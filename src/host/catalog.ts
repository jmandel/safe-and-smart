// Signed applet catalog + content-hash pinning (W8 / Config B). In a production
// deployment the wrapper runs applets only from a signed catalog: it verifies the
// catalog's signature against a pinned publisher public key, then refuses to run an
// applet whose fetched bytes don't match the catalog's pinned SHA-256. This makes a
// rendered applet attributable to a signed, hash-pinned artifact (the demo Pages
// build stays in open mode and runs any URL; see docs/PRODUCTION_DEPLOYMENT.md).

export interface CatalogEntry {
  id: string;
  url: string;
  sha256: string;
  publisher: string;
}

export interface SignedCatalog {
  // The signature covers JSON.stringify(entries) exactly.
  entries: CatalogEntry[];
  signature: string; // base64 ECDSA P-256 / SHA-256
  publicKeyJwk: JsonWebKey;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function canonicalizeEntries(entries: CatalogEntry[]): string {
  return JSON.stringify(entries);
}

// Verify the catalog signature against its public key (ECDSA P-256 / SHA-256).
export async function verifyCatalogSignature(catalog: SignedCatalog): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      catalog.publicKeyJwk,
      {name: 'ECDSA', namedCurve: 'P-256'},
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      {name: 'ECDSA', hash: 'SHA-256'},
      key,
      base64ToBytes(catalog.signature) as BufferSource,
      new TextEncoder().encode(canonicalizeEntries(catalog.entries)) as BufferSource,
    );
  } catch {
    return false;
  }
}

export function findCatalogEntry(catalog: SignedCatalog, url: string): CatalogEntry | undefined {
  return catalog.entries.find((e) => e.url === url);
}

// Gate an applet load against a verified catalog: the entry must exist and the
// fetched bytes' hash must match the pinned hash. Throws on any mismatch.
export function assertPinnedHash(entry: CatalogEntry | undefined, url: string, sha256: string): void {
  if (!entry) throw new Error(`Applet ${url} is not in the signed catalog.`);
  if (entry.sha256 !== sha256) {
    throw new Error(
      `Applet ${url} failed hash pinning: catalog ${entry.sha256.slice(0, 12)} ≠ fetched ${sha256.slice(0, 12)}.`,
    );
  }
}
