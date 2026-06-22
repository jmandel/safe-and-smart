import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const hostPort = Number(process.env.HOST_PORT ?? 4173);
const sandboxPort = Number(process.env.SANDBOX_PORT ?? 4174);

// Trusted-shell CSP. Mirrors the <meta> CSP baked into the host HTML so dev and
// GitHub Pages enforce the same policy. Locks exfiltration sinks; leaves
// connect/frame broad (trusted broker + launcher).
const HOST_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "img-src 'self' data: blob:",
  "media-src 'none'",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' https: http:",
  "frame-src 'self' http: https: blob:",
  "frame-ancestors 'none'",
].join('; ');

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
]);

function headers(kind, pathname) {
  const common = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  if (kind === 'host') {
    return {
      ...common,
      'Permissions-Policy':
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=()',
      // Defense-in-depth for the trusted shell. The applet renders through the
      // host's vetted components, so the host page is where img/media/form/object
      // exfiltration sinks would live — lock them down even if a component
      // regresses. connect-src/frame-src stay broad: the trusted broker talks to
      // arbitrary FHIR/LLM servers and frames the launcher (not applet-controlled
      // sinks). 'unsafe-eval' is required by Vega's expression compiler.
      'Content-Security-Policy': HOST_CSP,
    };
  }

  const sandboxHeaders = {
    ...common,
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Permissions-Policy':
      'accelerometer=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), web-share=(), xr-spatial-tracking=()',
    'Content-Security-Policy': [
      "default-src 'none'",
      `script-src 'self' http://127.0.0.1:${sandboxPort} blob:`,
      "connect-src 'none'",
      "worker-src blob:",
      "child-src blob:",
      "style-src 'unsafe-inline'",
      "img-src data: blob:",
      "font-src 'none'",
      "media-src 'none'",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      `frame-ancestors http://localhost:${hostPort}`,
    ].join('; '),
  };
  // NB: Clear-Site-Data on sandbox.html was removed for performance. On a real,
  // long-lived Chrome profile the "cache" directive makes the browser
  // synchronously purge cache before committing the document — multiple seconds
  // per load (the "storage" directive is even worse). It was also redundant: the
  // launcher iframe is an opaque origin (sandbox="allow-scripts" without
  // allow-same-origin) that cannot persist storage, the bundle is served
  // no-store, and the launcher never sets cookies. Re-add only specific
  // inexpensive directives (e.g. "cookies") if a deployment actually needs them.
  return sandboxHeaders;
}

function createStaticServer(kind) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      if (url.pathname === '/probe') {
        response.writeHead(204, headers(kind, url.pathname));
        response.end();
        return;
      }

      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = kind === 'host' ? '/index.html' : '/sandbox.html';
      const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      let file = join(root, safe);
      try {
        const metadata = await stat(file);
        if (metadata.isDirectory()) file = join(file, 'index.html');
      } catch {
        if (!extname(file) && kind === 'host') file = join(root, 'index.html');
      }

      if (!file.startsWith(root)) throw new Error('Path traversal rejected.');
      const body = await readFile(file);
      response.writeHead(200, {
        ...headers(kind, pathname),
        'Content-Type': mime.get(extname(file)) ?? 'application/octet-stream',
        'Content-Length': body.byteLength,
      });
      response.end(body);
    } catch (error) {
      response.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      response.end(error instanceof Error ? error.message : 'Not found');
    }
  });
}

const host = createStaticServer('host');
const sandbox = createStaticServer('sandbox');

host.listen(hostPort, 'localhost', () => {
  console.log(`Trusted host: http://localhost:${hostPort}`);
});
sandbox.listen(sandboxPort, '127.0.0.1', () => {
  console.log(`Sandbox origin: http://127.0.0.1:${sandboxPort}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    host.close();
    sandbox.close();
  });
}
