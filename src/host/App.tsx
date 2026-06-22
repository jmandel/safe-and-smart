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
          // Identity is recorded for audit/display, not used to gate access:
          // containment comes from the sandbox, so the wrapper can safely run any
          // applet (bundled or loaded from a URL) regardless of its declared id.
          broker.context.applet = {id: input.appletId, version: input.appletVersion};
          setStatus('connected');
          return {
            protocolVersion: PROTOCOL_VERSION,
            remoteConnection: receiver.connection,
            clinical: broker.capabilityApi(),
            context: broker.context,
          };
        },
      },
    });

    // Optional: load an applet bundle from a URL chosen by the wrapper (e.g.
    // ?applet=https://host/applet.js). The TRUSTED wrapper fetches it (it has
    // network authority); the opaque sandbox never can. We pass the source text
    // to the launcher, which runs it as a classic blob worker. This is how a
    // standalone bun/ts/react/zustand applet hosted anywhere is run safely
    // against the in-context SMART launch — it gets brokered capabilities only.
    const appletUrl = new URLSearchParams(window.location.search).get('applet');
    const appletSourcePromise: Promise<string | undefined> = appletUrl
      ? fetch(appletUrl, {cache: 'no-store'}).then((response) => {
          if (!response.ok) throw new Error(`Applet fetch failed: ${response.status}`);
          return response.text();
        })
      : Promise.resolve(undefined);

    const transfer = async () => {
      if (transferred || !element.contentWindow) return;
      let appletSource: string | undefined;
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
          <RemoteRootRenderer receiver={receiver} components={remoteComponentMap} />
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
// identical isolation; switching is just choosing a different bundle. The built-in
// entry uses the inlined worker; the others are standalone bundles loaded at
// runtime via ?applet=<url> (here same-origin; any CORS-enabled URL works).
const REGISTRY = [
  {label: 'Growth Explorer (built-in)', value: ''},
  {label: 'Growth Explorer (remote bundle)', value: '/applets/growth-remote.js'},
  {label: 'Medication Reconciliation', value: '/applets/med-recon.js'},
];

function AppletPicker() {
  const current = new URLSearchParams(window.location.search).get('applet') ?? '';
  return (
    <select
      className="shell-pill"
      aria-label="Choose applet"
      value={current}
      onChange={(event) => {
        const value = event.target.value;
        window.location.search = value ? `?applet=${encodeURIComponent(value)}` : '';
      }}
    >
      {REGISTRY.map((entry) => (
        <option key={entry.value} value={entry.value}>
          {entry.label}
        </option>
      ))}
    </select>
  );
}
