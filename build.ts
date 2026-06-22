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
import {rmSync, mkdirSync, writeFileSync} from 'node:fs';

const BASE = process.env.VITE_BASE ?? '/';

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
  entrypoints: ['index.html', 'sandbox.html'],
  outdir: 'dist',
  target: 'browser',
  minify: true,
  define,
  ...(BASE !== '/' ? {publicPath: BASE} : {}),
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
];
for (const applet of APPLETS) {
  const result = await Bun.build({
    entrypoints: [applet.entry],
    target: 'browser',
    format: 'iife',
    minify: true,
    define,
  });
  if (!result.success) {
    for (const m of result.logs) console.error(m);
    process.exit(1);
  }
  writeFileSync(`dist/applets/${applet.out}`, await result.outputs[0].text());
}

console.log(`Built with Bun -> dist/ (base ${BASE}).`);
