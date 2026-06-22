// Hardened applet-bundle fetch performed by the TRUSTED wrapper. Containment does
// not depend on provenance (the sandbox contains any code), but the wrapper still
// fetches deliberately and derives an auditable identity from the artifact itself.
const ALLOWED_MIME = new Set([
  'text/javascript',
  'application/javascript',
  'application/ecmascript',
  'text/ecmascript',
]);
const MAX_BUNDLE_BYTES = 8_000_000;

export interface LoadedApplet {
  url: string;
  source: string;
  sha256: string;
}

export async function loadAppletBundle(url: string): Promise<LoadedApplet> {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit', // never attach the wrapper's cookies/credentials
    redirect: 'error', // a redirect could land off the intended origin — reject it
  });
  if (!response.ok) throw new Error(`Applet fetch failed: ${response.status} ${response.statusText}`);

  const mime = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (mime && !ALLOWED_MIME.has(mime)) {
    throw new Error(`Applet bundle has a disallowed MIME type: ${mime}`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BUNDLE_BYTES) {
    throw new Error(`Applet bundle exceeds the ${MAX_BUNDLE_BYTES.toLocaleString()} byte limit.`);
  }

  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return {url, source: new TextDecoder().decode(buffer), sha256};
}
