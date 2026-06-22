// Build a STANDALONE applet into a single self-contained classic (IIFE) worker
// script that can be hosted anywhere (GitHub Pages, a CDN, S3) and loaded at
// runtime by any wrapper speaking this protocol.
//
//   bun run tools/build-applet.ts
//
// Output: dist/applets/growth-remote.js. Demonstrates that a normal bun + ts +
// react + zustand app compiles into the loadable form. The only contract is:
// (1) entry calls runApplet(App, manifest) from the runtime SDK, and (2) the
// output is one classic IIFE script (no ES-module worker / external chunks, which
// cannot load from a blob: URL in an opaque-origin sandbox).
import {mkdirSync, writeFileSync} from 'node:fs';

// Each entry is a standalone applet; same wrapper hosts them all, equally safe.
const APPLETS = [
  {entry: 'src/applet/standalone-entry.tsx', out: 'growth-remote.js'},
  {entry: 'src/applet/med-recon/entry.tsx', out: 'med-recon.js'},
];

mkdirSync('dist/applets', {recursive: true});
for (const applet of APPLETS) {
  const result = await Bun.build({
    entrypoints: [applet.entry],
    target: 'browser',
    format: 'iife', // classic worker script
    minify: true,
    define: {'process.env.NODE_ENV': '"production"'},
  });
  if (!result.success) {
    for (const message of result.logs) console.error(message);
    process.exit(1);
  }
  const code = await result.outputs[0].text();
  writeFileSync(`dist/applets/${applet.out}`, code);
  console.log(`Built ${applet.entry} -> dist/applets/${applet.out} (${code.length} bytes, classic IIFE).`);
}
console.log('Serve any of these anywhere with permissive CORS, then open the wrapper with');
console.log('  ?applet=<url-to-applet.js>');
