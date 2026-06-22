// Sandbox launcher. Receives the applet source (already fetched by the trusted
// wrapper) and runs it as a CLASSIC blob worker. The opaque sandbox never fetches
// anything itself (CSP connect-src 'none'); the applet is always provided as text.
// A module worker cannot load from a blob: URL in an opaque origin, so it must be
// a classic worker.
const parameters = new URLSearchParams(location.search);
const expectedNonce = parameters.get('nonce');
let connected = false;
let worker: Worker | undefined;

window.addEventListener('message', (event) => {
  if (connected) return;
  if (event.source !== window.parent) return;
  if (event.data?.type !== 'clinical-sandbox/connect') return;
  if (!expectedNonce || event.data?.nonce !== expectedNonce) return;

  const port = event.ports[0];
  if (!port) throw new Error('Trusted sandbox frame did not receive a MessagePort.');
  const appletSource: unknown = event.data?.appletSource;
  if (typeof appletSource !== 'string' || appletSource.length === 0) {
    throw new Error('Trusted sandbox frame did not receive applet source.');
  }
  connected = true;

  worker = new Worker(URL.createObjectURL(new Blob([appletSource], {type: 'text/javascript'})), {
    name: 'clinical-applet-worker',
  });
  worker.addEventListener('error', (error) => {
    console.error('Applet worker error', error.message);
  });
  worker.postMessage(
    {
      type: 'clinical-applet/connect',
      probeUrl: new URL('/probe', location.href).href,
    },
    [port],
  );
});

window.addEventListener('pagehide', () => worker?.terminate(), {once: true});
