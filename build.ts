// Bundler for the whole project — Bun only, no Vite.
//   bun run build.ts
// Env (all optional):
//   VITE_BASE              base path for asset URLs (GitHub Pages: /<repo>/)
//   VITE_SANDBOX_ORIGIN    'self' for single-origin (Pages) or a 2nd origin (dev)
//   VITE_FHIR_*, VITE_USE_MOCK, VITE_SMART_*   broker / SMART defaults
//
// Produces dist/ with: index.html (landing), app.html (wrapper runtime),
// sandbox.html (launcher) + hashed assets, and applets/*.js (standalone classic
// worker bundles loaded at runtime).
import {rmSync, mkdirSync, writeFileSync, copyFileSync} from 'node:fs';

const BASE = process.env.VITE_BASE ?? '/';

// Bun's syntax-minify pass intermittently mangles complex regex literals in
// transitive deps (e.g. semver's loose regex → "Unmatched ')'"), producing a
// non-deterministically broken bundle. Keep whitespace + identifier minification
// (the bulk of the size win) but disable the syntax pass for reproducible builds.
const minify = {whitespace: true, identifiers: true, syntax: false} as const;

// Replace Vite's import.meta.env.* at build time so app code is unchanged.
const def = (name: string) =>
  process.env[name] === undefined ? 'undefined' : JSON.stringify(process.env[name]);
const define: Record<string, string> = {
  'process.env.NODE_ENV': '"production"',
  'import.meta.env.MODE': '"production"',
  'import.meta.env.DEV': 'false',
  'import.meta.env.PROD': 'true',
  'import.meta.env.BASE_URL': JSON.stringify(BASE),
  'import.meta.env.VITE_SANDBOX_ORIGIN': def('VITE_SANDBOX_ORIGIN'),
  'import.meta.env.VITE_FHIR_BASE_URL': def('VITE_FHIR_BASE_URL'),
  'import.meta.env.VITE_FHIR_PATIENT_ID': def('VITE_FHIR_PATIENT_ID'),
  'import.meta.env.VITE_USE_MOCK': def('VITE_USE_MOCK'),
  'import.meta.env.VITE_SMART_ISS': def('VITE_SMART_ISS'),
  'import.meta.env.VITE_SMART_CLIENT_ID': def('VITE_SMART_CLIENT_ID'),
  'import.meta.env.VITE_SMART_SCOPE': def('VITE_SMART_SCOPE'),
};

rmSync('dist', {recursive: true, force: true});
mkdirSync('dist/applets', {recursive: true});

// 1. HTML entries (landing, wrapper runtime, sandbox launcher) + their JS/CSS.
const html = await Bun.build({
  entrypoints: ['index.html', 'run/index.html', 'fhir/index.html', 'author/index.html', 'sandbox.html'],
  outdir: 'dist',
  target: 'browser',
  minify,
  define,
  // No publicPath: Bun emits asset URLs relative to each HTML file (./chunk from
  // the root, ../chunk from /run and /fhir), which resolve correctly under any
  // base. Runtime-constructed URLs use import.meta.env.BASE_URL (via define).
});
if (!html.success) {
  for (const m of html.logs) console.error(m);
  process.exit(1);
}

// 2. Applet bundles — self-contained CLASSIC (IIFE) worker scripts, loaded at
//    runtime by the wrapper (default growth bundle, or any ?applet=<url>).
const APPLETS = [
  {entry: 'src/applet/standalone-entry.tsx', out: 'growth-remote.js'},
  {entry: 'src/applet/med-recon/entry.tsx', out: 'med-recon.js'},
  {entry: 'src/applet/intrinsic-demo/entry.tsx', out: 'intrinsic-demo.js'},
  {entry: 'src/applet/fhir-bridge-demo/entry.tsx', out: 'fhir-bridge-demo.js'},
  {entry: 'src/applet/styled-vitals/entry.tsx', out: 'styled-vitals.js'},
  {entry: 'src/applet/careplan-diagram/entry.tsx', out: 'careplan-diagram.js'},
  {entry: 'src/applet/order-entry-form/entry.tsx', out: 'order-entry-form.js'},
  {entry: 'src/applet/note-summarizer/entry.tsx', out: 'note-summarizer.js'},
];
for (const applet of APPLETS) {
  const result = await Bun.build({
    entrypoints: [applet.entry],
    target: 'browser',
    format: 'iife',
    minify,
    define,
  });
  if (!result.success) {
    for (const m of result.logs) console.error(m);
    process.exit(1);
  }
  writeFileSync(`dist/applets/${applet.out}`, await result.outputs[0].text());
}

// 3. Authoring SDK — prebuilt classic-worker IIFE that the browser authoring page
//    prepends to compiled author code (provides React + ui-* + runApplet globals).
mkdirSync('dist/applets/_sdk', {recursive: true});
const sdk = await Bun.build({
  entrypoints: ['src/applet/authoring-sdk.ts'],
  target: 'browser',
  format: 'iife',
  minify,
  define,
});
if (!sdk.success) {
  for (const m of sdk.logs) console.error(m);
  process.exit(1);
}
writeFileSync('dist/applets/_sdk/authoring-sdk.js', await sdk.outputs[0].text());

// 4. esbuild-wasm binary — served same-origin so the /author page can initialize
//    the in-browser bundler under the host CSP.
copyFileSync('node_modules/esbuild-wasm/esbuild.wasm', 'dist/esbuild.wasm');

console.log(`Built with Bun -> dist/ (base ${BASE}).`);
