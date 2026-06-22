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
import {loadAppletBundle} from './load-applet';
import {guardConnection} from './mutation-gateway';
import {createSafeDomFirewall} from './safe-dom-firewall';

export function App({smartInit}: {smartInit?: import('./smart-launch').SmartInit} = {}) {
  const receiver = useMemo(() => new RemoteReceiver({retain, release}), []);
  const broker = useMemo(() => new ClinicalBroker(smartInit), [smartInit]);
  const nonce = useMemo(() => crypto.randomUUID(), []);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'starting' | 'connected' | 'error'>('starting');
  const [error, setError] = useState<string>();
  const [audit, setAudit] = useState<AuditRecord[]>([]);

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
              onViolation: (code, detail) =>
                broker.recordHostEvent(`mutation.${code}`, detail, 'denied'),
            }),
            clinical: broker.capabilityApi(),
            context: broker.context,
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
    let appletIdentity = {url: appletUrl, sha256: ''};
    const appletSourcePromise: Promise<string> = loadAppletBundle(appletUrl).then((loaded) => {
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
  }, [broker, nonce, receiver]);

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-brand">
          <div className="shell-mark">C</div>
          <div>
            <h1>Clinical Applet Runtime</h1>
            <p>Trusted SMART + LLM shell / browser-only untrusted applet</p>
          </div>
        </div>
        <div className="shell-context">
          <AppletPicker />
          <span className="shell-pill">{broker.context.user.display}</span>
          <span className="shell-pill">Patient: {broker.context.patient.display}</span>
          <span className="shell-pill">{status === 'connected' ? 'Connected' : status}</span>
        </div>
      </header>

      <main className="shell-main">
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
            <RemoteRootRenderer receiver={receiver} components={remoteComponentMap} />
          </AppletErrorBoundary>
        </section>

        <aside className="audit-panel" aria-label="Trusted broker audit log">
          <h2>Trusted-shell capability audit</h2>
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
}

const BUILTINS: AppletEntry[] = [
  {label: 'Growth Explorer', value: ''},
  {label: 'Medication Reconciliation', value: `${import.meta.env.BASE_URL}applets/med-recon.js`},
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
            <div className="picker-group">Applets</div>
            {BUILTINS.map((e) => (
              <button key={e.label} className="picker-item" role="menuitem" onClick={() => runApplet(e.value)}>
                <span className="picker-check">{e.value === current ? '✓' : ''}</span>
                {e.label}
              </button>
            ))}
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
