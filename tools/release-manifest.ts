// Emits dist/RELEASE_MANIFEST.json: SHA-256 of every built artifact plus the Safe
// DOM schema version and pinned dependency versions. This is what makes the
// security claims reproducible against an EXACT release (Phase-7 gate): a reviewer
// hashes the deployed files and compares, then audits the named TCB sources at the
// recorded dependency versions. Run after a build: `bun run tools/release-manifest.ts`.
import {createHash} from 'node:crypto';
import {readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {SAFE_DOM_SCHEMA_VERSION} from '../src/shared/safe-dom-schema';
import {PROTOCOL_VERSION} from '../src/shared/protocol';

const DIST = 'dist';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version?: string;
  dependencies?: Record<string, string>;
};

// The trusted computing base a reviewer must audit (host-side validators + the
// brokered capability boundary), tracked so claims name exact files.
const TCB_SOURCES = [
  'src/host/safe-dom-firewall.ts',
  'src/host/mutation-gateway.ts',
  'src/host/css-validator.ts',
  'src/host/safe-svg-validator.ts',
  'src/host/components/vega-sanitizer.ts',
  'src/host/broker/fhir-capability.ts',
  'src/host/broker/clinical-broker.ts',
  'src/host/load-applet.ts',
  'src/shared/safe-dom-schema.ts',
  'src/applet/worker-prelude.ts',
];

const files = walk(DIST)
  .sort()
  .map((file) => ({path: relative(DIST, file), sha256: sha256(file)}));

const manifest = {
  schemaVersion: SAFE_DOM_SCHEMA_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  appVersion: pkg.version ?? '0.0.0',
  dependencies: pkg.dependencies ?? {},
  tcbSources: TCB_SOURCES.map((path) => ({path, sha256: sha256(path)})),
  artifacts: files,
};

writeFileSync(join(DIST, 'RELEASE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `RELEASE_MANIFEST.json — schema v${SAFE_DOM_SCHEMA_VERSION}, ${files.length} artifacts, ${TCB_SOURCES.length} TCB sources hashed.`,
);
