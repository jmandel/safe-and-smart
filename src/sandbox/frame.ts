import AppletWorker from '../applet/worker.tsx?worker&inline';

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
  connected = true;

  // If the trusted wrapper fetched an external applet bundle, run THAT as a
  // classic blob worker. Otherwise run the built-in (build-time inlined) applet.
  // The opaque sandbox never fetches anything (connect-src 'none'); it only
  // receives the already-fetched source text. Both are classic workers — a module
  // worker cannot load from a blob: URL in an opaque origin.
  const appletSource: string | undefined = event.data?.appletSource;
  worker = appletSource
    ? new Worker(
        URL.createObjectURL(new Blob([appletSource], {type: 'text/javascript'})),
        {name: 'clinical-applet-worker'},
      )
    : new AppletWorker({name: 'clinical-applet-worker'});
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
