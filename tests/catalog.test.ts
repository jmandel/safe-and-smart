import {describe, expect, it} from 'bun:test';
import {
  verifyCatalogSignature,
  findCatalogEntry,
  assertPinnedHash,
  canonicalizeEntries,
  type SignedCatalog,
  type CatalogEntry,
} from '../src/host/catalog';

async function makeSignedCatalog(input: CatalogEntry[]): Promise<SignedCatalog> {
  const entries = structuredClone(input); // don't mutate shared fixtures
  const pair = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, [
    'sign',
    'verify',
  ]);
  const signature = await crypto.subtle.sign(
    {name: 'ECDSA', hash: 'SHA-256'},
    pair.privateKey,
    new TextEncoder().encode(canonicalizeEntries(entries)),
  );
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    entries,
    signature: btoa(String.fromCharCode(...new Uint8Array(signature))),
    publicKeyJwk,
  };
}

const ENTRIES: CatalogEntry[] = [
  {id: 'growth', url: '/applets/growth-remote.js', sha256: 'a'.repeat(64), publisher: 'acme-health'},
  {id: 'cockpit', url: '/applets/encounter-cockpit.js', sha256: 'b'.repeat(64), publisher: 'acme-health'},
];

describe('signed catalog + hash pinning', () => {
  it('verifies a correctly signed catalog', async () => {
    const catalog = await makeSignedCatalog(ENTRIES);
    expect(await verifyCatalogSignature(catalog)).toBe(true);
  });

  it('rejects a tampered catalog (entry changed after signing)', async () => {
    const catalog = await makeSignedCatalog(ENTRIES);
    catalog.entries[0]!.sha256 = 'c'.repeat(64); // tamper
    expect(await verifyCatalogSignature(catalog)).toBe(false);
  });

  it('rejects a swapped public key', async () => {
    const catalog = await makeSignedCatalog(ENTRIES);
    const other = await makeSignedCatalog(ENTRIES);
    catalog.publicKeyJwk = other.publicKeyJwk; // attacker substitutes their key
    expect(await verifyCatalogSignature(catalog)).toBe(false);
  });

  it('pins the content hash — matching passes, mismatch throws', () => {
    const entry = findCatalogEntry({entries: ENTRIES} as SignedCatalog, '/applets/growth-remote.js');
    expect(() => assertPinnedHash(entry, '/applets/growth-remote.js', 'a'.repeat(64))).not.toThrow();
    expect(() => assertPinnedHash(entry, '/applets/growth-remote.js', 'd'.repeat(64))).toThrow(
      /hash pinning/,
    );
  });

  it('refuses an applet absent from the catalog', () => {
    const entry = findCatalogEntry({entries: ENTRIES} as SignedCatalog, '/applets/evil.js');
    expect(() => assertPinnedHash(entry, '/applets/evil.js', 'x'.repeat(64))).toThrow(
      /not in the signed catalog/,
    );
  });
});
