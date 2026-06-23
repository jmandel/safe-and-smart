import React, {useEffect, useMemo, useRef, useState} from 'react';
import {retain, release, ThreadMessagePort} from '@quilted/threads';
import {RemoteReceiver, RemoteRootRenderer} from '@remote-dom/react/host';
import {
  PROTOCOL_VERSION,
  type AppletThreadExports,
  type HostThreadExports,
} from '../shared/protocol';
import {ClinicalBroker, type AuditRecord} from './broker/clinical-broker';
import {remoteComponentMap} from './components/remote-components';
import {AppletErrorBoundary} from './AppletErrorBoundary';
import {loadAppletBundle, sha256Hex} from './load-applet';
import {guardConnection} from './mutation-gateway';
import {createSafeDomFirewall} from './safe-dom-firewall';
import {ShadowSurface} from './ShadowSurface';

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper configuration. The wrapper renders the same sandboxed applet in several
// contexts (full demo shell, SMART launch, embedded playground preview), so its
// chrome is configurable. This is the committed, documented config surface — see
// docs/WRAPPER_CONFIG.md. Every field defaults to the full demo shell; presets are
// just bundles of these fields.
export interface WrapperConfig {
  /** Top bar (brand + patient + status). Default true. */
  header?: boolean;
  /** Applet picker dropdown in the header. Default true. Meaningless when the
   *  applet is fixed (e.g. an embedded preview), so turn it off there. */
  picker?: boolean;
  /** The trusted-shell capability audit panel. Default true. */
  audit?: boolean;
}

const FULL_CHROME: Required<WrapperConfig> = {header: true, picker: true, audit: true};
/** Preset for an embedded preview (playground): no picker, slim — just the applet
 *  surface and the audit log so you can watch the brokered calls. */
export const PREVIEW_CHROME: WrapperConfig = {header: false, picker: false, audit: true};

export function App({
  smartInit,
  appletSourceOverride,
  config,
}: {
  smartInit?: import('./smart-launch').SmartInit;
  // In-memory applet source (e.g. compiled in the browser authoring page). When
  // present it runs through the identical sandbox/launcher/firewall path instead
  // of being fetched from a URL.
  appletSourceOverride?: string;
  config?: WrapperConfig;
} = {}) {
  const chrome = {...FULL_CHROME, ...config};
  const receiver = useMemo(() => new RemoteReceiver({retain, release}), []);
  const broker = useMemo(() => new ClinicalBroker(smartInit), [smartInit]);
  const nonce = useMemo(() => crypto.randomUUID(), []);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'starting' | 'connected' | 'error'>('starting');
  const [error, setError] = useState<string>();
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  // Validated applet stylesheets (via clinical.registerStylesheet) installed into
  // the ShadowRoot surface. Reset when the applet (source) changes.
  const [appletStyles, setAppletStyles] = useState<string[]>([]);
  const [mutations, setMutations] = useState(0);
  useEffect(() => {
    setAppletStyles([]);
    setMutations(0);
    broker.setStyleSink((css) => setAppletStyles((prev) => [...prev, css]));
  }, [broker, appletSourceOverride]);

  // Two-origin (recommended, prod): VITE_SANDBOX_ORIGIN points at a different
  // origin and the dev server applies CSP via headers. Single-origin (e.g. GitHub
  // Pages): set VITE_SANDBOX_ORIGIN=self — the launcher loads same-origin under
  // the Vite base, isolation still comes from sandbox="allow-scripts" (opaque
  // origin) + the <meta> CSP in sandbox.html. Default keeps the dev two-origin flow.
  const sandboxOrigin = import.meta.env.VITE_SANDBOX_ORIGIN ?? 'http://127.0.0.1:4174';
  const sandboxUrl =
    sandboxOrigin && sandboxOrigin !== 'self'
      ? `${sandboxOrigin}/sandbox.html?nonce=${encodeURIComponent(nonce)}`
      : `${import.meta.env.BASE_URL}sandbox.html?nonce=${encodeURIComponent(nonce)}`;

  useEffect(
    () =>
      broker.subscribeAudit((record) => {
        setAudit((current) => [record, ...current].slice(0, 100));
      }),
    [broker],
  );

  useEffect(() => {
    const element = iframe.current;
    if (!element) return;

    const channel = new MessageChannel();
    channel.port1.start();
    let transferred = false;
    const thread = new ThreadMessagePort<AppletThreadExports, HostThreadExports>(channel.port1, {
      exports: {
        async connect(input) {
          if (input.protocolVersion !== PROTOCOL_VERSION) {
            throw new Error(`Protocol version ${input.protocolVersion} is not supported.`);
          }
          // Authoritative identity is HOST-derived (source URL + artifact SHA-256),
          // not the worker-declared id (which is recorded only as a consistency
          // note). Containment doesn't depend on this; it's for audit/provenance.
          broker.context.applet = {
            id: appletIdentity.url,
            version: appletIdentity.sha256 ? `sha256:${appletIdentity.sha256.slice(0, 16)}` : 'unknown',
          };
          if (input.appletId !== undefined) {
            console.info('applet declared id', input.appletId, input.appletVersion, '— host identity', appletIdentity.url, appletIdentity.sha256.slice(0, 16));
          }
          setStatus('connected');
          return {
            protocolVersion: PROTOCOL_VERSION,
            remoteConnection: guardConnection(receiver.connection, {
              validateRecords: createSafeDomFirewall().validateRecords,
              onStats: (total) => setMutations(total),
              onViolation: (code, detail) => {
                // Dev diagnostic + audit trail. A schema violation usually means the
                // applet used an element/prop/event outside the Safe DOM surface —
                // the generated intrinsic types (safe-dom-intrinsics.d.ts) list what's
                // allowed.
                console.warn(`[safe-dom] ${code}: ${detail}`);
                broker.recordHostEvent(`mutation.${code}`, detail, 'denied');
              },
            }),
            capabilities: broker.buildSession(),
          };
        },
      },
    });

    // The TRUSTED wrapper fetches the applet bundle (it has network authority);
    // the opaque sandbox never can. Default to the built-in growth applet bundle;
    // ?applet=<url> selects another (any CORS-enabled URL — bundled, third-party,
    // or LLM-authored). The source text is handed to the launcher, which runs it
    // as a classic blob worker with only brokered capabilities. This is how a
    // standalone bun/ts/react/zustand applet hosted anywhere runs safely against
    // the in-context SMART launch.
    const appletUrl =
      new URLSearchParams(window.location.search).get('applet') ??
      `${import.meta.env.BASE_URL}applets/growth-remote.js`;
    let appletIdentity = {url: appletSourceOverride ? 'authored://in-memory' : appletUrl, sha256: ''};
    const appletSourcePromise: Promise<string> = appletSourceOverride
      ? sha256Hex(appletSourceOverride).then((sha256) => {
          appletIdentity = {url: 'authored://in-memory', sha256};
          return appletSourceOverride;
        })
      : loadAppletBundle(appletUrl).then((loaded) => {
          appletIdentity = {url: loaded.url, sha256: loaded.sha256};
          return loaded.source;
        });

    const transfer = async () => {
      if (transferred || !element.contentWindow) return;
      let appletSource: string;
      try {
        appletSource = await appletSourcePromise;
      } catch (loadError) {
        setStatus('error');
        setError(loadError instanceof Error ? loadError.message : 'Applet load failed.');
        return;
      }
      if (transferred || !element.contentWindow) return;
      transferred = true;
      // The iframe deliberately has an opaque origin because allow-same-origin
      // is omitted. We therefore use '*' for the one-time transfer and bind the
      // handshake with both event.source and a 128-bit nonce inside the frame.
      element.contentWindow.postMessage(
        {type: 'clinical-sandbox/connect', nonce, appletSource},
        '*',
        [channel.port2],
      );
    };

    element.addEventListener('load', transfer, {once: true});
    if (element.contentDocument?.readyState === 'complete') transfer();

    const timeout = window.setTimeout(() => {
      if (!transferred) {
        setStatus('error');
        setError('Sandbox frame did not accept its MessagePort.');
      }
    }, 10_000);

    return () => {
      window.clearTimeout(timeout);
      element.removeEventListener('load', transfer);
      void thread.imports.dispose().catch(() => undefined);
      thread.close();
      channel.port1.close();
    };
  }, [broker, nonce, receiver, appletSourceOverride]);

  return (
    <div className="shell">
      {chrome.header ? (
        <header className="shell-header">
          <div className="shell-brand">
            <div className="shell-mark" aria-hidden>✚</div>
            <div className="shell-titles">
              <h1>Clinical Applet Sandbox</h1>
              <p className="shell-sub">{broker.context.user.display}</p>
            </div>
          </div>
          <div className="shell-context">
            <span className="shell-pill shell-pill--patient" title="Patient in context">
              {broker.context.patient.display}
            </span>
            {chrome.picker ? <AppletPicker /> : null}
            <span className={`shell-status is-${status}`} title={`Sandbox ${status}`}>
              <span className="shell-dot" aria-hidden />
              {status === 'connected' ? 'Live' : status}
            </span>
          </div>
        </header>
      ) : null}

      <main className={`shell-main${chrome.audit ? '' : ' shell-main--no-audit'}`}>
        <section className="applet-surface" aria-label="Sandboxed clinical applet">
          {status === 'error' ? (
            <div className="applet-loading" role="alert">
              <strong>Sandbox startup failed</strong>
              <p>{error}</p>
            </div>
          ) : null}
          {status === 'starting' ? (
            <div className="applet-loading">Starting isolated React applet…</div>
          ) : null}
          <AppletErrorBoundary onReload={() => window.location.reload()}>
            <ShadowSurface appletStyles={appletStyles}>
              <RemoteRootRenderer receiver={receiver} components={remoteComponentMap} />
            </ShadowSurface>
          </AppletErrorBoundary>
        </section>

        {chrome.audit ? (
          <aside className="audit-panel" aria-label="Trusted broker audit log">
            <h2>
              Trusted-shell capability audit
              {mutations > 0 ? <span className="audit-stat">{mutations.toLocaleString()} mutations</span> : null}
            </h2>
            {audit.length === 0 ? (
              <div className="audit-empty">No applet capability calls yet.</div>
            ) : (
              <ol className="audit-list">
                {audit.map((record, index) => (
                  <li className="audit-item" key={`${record.at}-${index}`}>
                    <strong>{record.operation}</strong>
                    <span>{record.summary}</span>
                    <small>
                      {new Date(record.at).toLocaleTimeString()} · {record.outcome}
                      {record.durationMs == null ? '' : ` · ${record.durationMs} ms`}
                    </small>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        ) : null}
      </main>

      <iframe
        ref={iframe}
        className="sandbox-frame"
        title="Trusted sandbox launcher"
        src={sandboxUrl}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        allow=""
      />
    </div>
  );
}

// The wrapper's applet registry/picker. Every entry runs in the same sandbox with
// identical isolation; switching is just choosing a different bundle (value is the
// ?applet URL, '' = the default growth bundle). Built-ins ship with the wrapper;
// user-added applets are any CORS-enabled URL, optionally remembered in this
// browser's localStorage (the wrapper origin can use storage; the applet cannot).
interface AppletEntry {
  label: string;
  value: string;
  // Self-documenting test-gallery metadata (built-ins only).
  group?: string;
  blurb?: string;
  tests?: string[];
}

const applet = (file: string) => `${import.meta.env.BASE_URL}applets/${file}`;

// The catalog is a coverage gallery: each built-in exercises a named slice of the
// platform so an evaluator can verify every capability end-to-end in the sandbox.
const BUILTINS: AppletEntry[] = [
  {
    label: 'Growth Explorer',
    value: '',
    group: 'Clinical apps',
    blurb: 'Live FHIR vital-signs → zustand store → animated Vega growth chart with reference curves and an accessible data table.',
    tests: ['FHIR', 'Vega chart', 'Table', 'State', 'Events'],
  },
  {
    label: 'Medication Reconciliation',
    value: applet('med-recon.js'),
    group: 'Clinical apps',
    blurb: 'Structured med list + recent notes → LLM adjudication returning structured discrepancies and clinician-facing actions.',
    tests: ['FHIR', 'LLM (structured JSON)', 'Audit'],
  },
  {
    label: 'Encounter Cockpit — everything',
    value: applet('encounter-cockpit.js'),
    group: 'Clinical apps',
    blurb: 'The whole surface in one screen: CSS, FHIR, chart + table, streaming LLM with a brokered tool, custom SVG, and an inline document.',
    tests: ['CSS', 'FHIR', 'Chart', 'LLM stream + tool', 'SVG', 'Attachment'],
  },
  {
    label: 'Styled Vitals — CSS',
    value: applet('styled-vitals.js'),
    group: 'Capability demos',
    blurb: 'Author real CSS (grid, @media, @keyframes, gradients) installed + scoped via registerStylesheet; validated inline style.',
    tests: ['CSS stylesheet', 'Inline style', 'ui-box/ui-inline'],
  },
  {
    label: 'Care Pathway — SVG',
    value: applet('careplan-diagram.js'),
    group: 'Capability demos',
    blurb: 'A custom diagram supplied as author SVG, validated to a safe subset (no script/handlers/external refs) and re-serialized.',
    tests: ['Safe SVG', 'ui-svg'],
  },
  {
    label: 'Order Entry — form',
    value: applet('order-entry-form.js'),
    group: 'Capability demos',
    blurb: 'Text inputs + textarea, inline validation, keyboard Tab/Enter-to-submit, and initial focus management.',
    tests: ['Inputs', 'Keyboard', 'Focus', 'Validation'],
  },
  {
    label: 'Note Summarizer — streaming',
    value: applet('note-summarizer.js'),
    group: 'Capability demos',
    blurb: 'Streaming LLM (SSE) rendered token-by-token, with a broker-executed getLatestVitals FHIR tool folded into generation.',
    tests: ['LLM streaming', 'Tool bridge'],
  },
  {
    label: 'FHIR Fetch Bridge',
    value: applet('fhir-bridge-demo.js'),
    group: 'Capability demos',
    blurb: "fetch('https://fhir.internal/Observation?…') ergonomics — parsed resources, no token, no absolute URL in the applet.",
    tests: ['FHIR bridge'],
  },
  {
    label: 'Document Viewer — inline attachment',
    value: applet('document-viewer.js'),
    group: 'Capability demos',
    blurb: 'Renders a document from inline attachment bytes as a self-contained data: URL — no fetch, no URL, no token.',
    tests: ['Inline document', 'ui-image (data: only)'],
  },
  {
    label: 'Intrinsic JSX demo',
    value: applet('intrinsic-demo.js'),
    group: 'Capability demos',
    blurb: 'A form-style app written in plain <ui-*> intrinsic TSX with familiar React events — no Remote DOM imports.',
    tests: ['Intrinsic JSX', 'Events'],
  },
];

const SAVED_KEY = 'safe-and-smart.applets';

function loadSaved(): AppletEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.value === 'string') : [];
  } catch {
    return [];
  }
}
function persistSaved(list: AppletEntry[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    // storage may be unavailable; remembering is best-effort
  }
}
function shortLabel(url: string): string {
  try {
    const u = new URL(url, window.location.href);
    return (u.pathname.split('/').filter(Boolean).pop() || u.host) + '';
  } catch {
    return url.slice(0, 40);
  }
}

// Navigate (reload) to run the chosen applet on the current page (/run or /fhir).
function runApplet(value: string) {
  window.location.search = value ? `?applet=${encodeURIComponent(value)}` : '';
}

function AppletPicker() {
  const current = new URLSearchParams(window.location.search).get('applet') ?? '';
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState<AppletEntry[]>(loadSaved);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [remember, setRemember] = useState(true);

  const known = [...BUILTINS, ...saved];
  const currentLabel =
    known.find((e) => e.value === current)?.label ?? (current ? shortLabel(current) : BUILTINS[0].label);

  function submitAdd() {
    const value = url.trim();
    if (!value) return;
    if (remember) {
      const next = [...saved.filter((s) => s.value !== value), {label: label.trim() || shortLabel(value), value}];
      persistSaved(next);
    }
    runApplet(value);
  }
  function removeSaved(value: string) {
    const next = saved.filter((s) => s.value !== value);
    setSaved(next);
    persistSaved(next);
  }

  return (
    <div className="picker">
      <button className="shell-pill picker-button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu">
        <span className="picker-current">{currentLabel}</span> ▾
      </button>

      {open ? (
        <>
          <div className="picker-backdrop" onClick={() => setOpen(false)} />
          <div className="picker-menu" role="menu">
            {[...new Set(BUILTINS.map((e) => e.group))].map((group) => (
              <div key={group} className="picker-section">
                <div className="picker-group">{group}</div>
                {BUILTINS.filter((e) => e.group === group).map((e) => (
                  <button
                    key={e.label}
                    className={`picker-item picker-item--rich${e.value === current ? ' is-current' : ''}`}
                    role="menuitem"
                    onClick={() => runApplet(e.value)}
                  >
                    <span className="picker-check">{e.value === current ? '✓' : ''}</span>
                    <span className="picker-body">
                      <span className="picker-label">{e.label}</span>
                      {e.blurb ? <span className="picker-blurb">{e.blurb}</span> : null}
                      {e.tests ? (
                        <span className="picker-tags">
                          {e.tests.map((t) => (
                            <span key={t} className="picker-tag">
                              {t}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            <a className="picker-add" href={`${import.meta.env.BASE_URL}author/`}>
              ✎ Author a new applet in the browser…
            </a>
            {saved.length > 0 ? <div className="picker-group">Saved in this browser</div> : null}
            {saved.map((e) => (
              <div key={e.value} className="picker-row">
                <button className="picker-item" role="menuitem" onClick={() => runApplet(e.value)}>
                  <span className="picker-check">{e.value === current ? '✓' : ''}</span>
                  {e.label}
                </button>
                <button className="picker-x" title="Forget" onClick={() => removeSaved(e.value)}>
                  ×
                </button>
              </div>
            ))}
            <button
              className="picker-add"
              onClick={() => {
                setOpen(false);
                setUrl('');
                setLabel('');
                setRemember(true);
                setAdding(true);
              }}
            >
              + Add applet by URL…
            </button>
          </div>
        </>
      ) : null}

      {adding ? (
        <div className="modal-overlay" onClick={() => setAdding(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add an applet</h3>
            <p className="modal-sub">
              Any CORS-enabled bundle URL. The wrapper fetches it and runs it in the same sandbox —
              no token, no network, no DOM.
            </p>
            <label className="modal-field">
              Applet bundle URL
              <input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/applet.js"
                onKeyDown={(e) => e.key === 'Enter' && submitAdd()}
              />
            </label>
            <label className="modal-field">
              Label (optional)
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My applet" />
            </label>
            <label className="modal-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember in this browser
            </label>
            <div className="modal-actions">
              <button onClick={() => setAdding(false)}>Cancel</button>
              <button className="modal-primary" disabled={!url.trim()} onClick={submitAdd}>
                Run applet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
