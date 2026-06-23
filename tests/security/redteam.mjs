// Red-team harness: builds each tests/security/hostile/*.entry.tsx as a classic
// applet bundle, loads it in the running wrapper, and asserts it triggers NO
// request to an independent canary server. Run with: bun tests/security/redteam.mjs
// Env: REDTEAM_CHROMIUM=<path to chrome>, WRAPPER=http://localhost:4273 (default)
import {createServer} from 'node:http';
import {readdirSync, mkdirSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
// Resolve playwright from either a global install (local dev) or the project.
const require = createRequire(import.meta.url);
let chromium;
try {
  ({chromium} = require('/home/jmandel/node_modules/playwright-core/index.js'));
} catch {
  ({chromium} = require('playwright-core'));
}

const WRAPPER = process.env.WRAPPER ?? 'http://localhost:4273';
// Use an explicit chromium path if provided/known; otherwise let Playwright use
// its own installed browser (CI: `playwright install chromium`).
const LOCAL_CHROME = '/home/jmandel/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const CHROME = process.env.REDTEAM_CHROMIUM ?? (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);
const CANARY_PORT = 4399;

// 1) Build hostile bundles into dist/applets/_hostile (served by the running wrapper).
mkdirSync('dist/applets/_hostile', {recursive: true});
const entries = readdirSync('tests/security/hostile').filter((f) => f.endsWith('.entry.tsx'));
const cases = [];
for (const entry of entries) {
  const name = entry.replace('.entry.tsx', '');
  const r = await Bun.build({
    entrypoints: [`tests/security/hostile/${entry}`],
    target: 'browser', format: 'iife', minify: true,
    define: {'process.env.NODE_ENV': '"production"'},
  });
  if (!r.success) { for (const m of r.logs) console.error(m); process.exit(1); }
  await Bun.write(`dist/applets/_hostile/${name}.js`, await r.outputs[0].text());
  cases.push({name, url: `/applets/_hostile/${name}.js`});
}

// 2) Independent canary server (records every hit).
let hits = [];
const canary = createServer((req, res) => {
  hits.push(req.url);
  res.writeHead(200, {'access-control-allow-origin': '*'});
  res.end('ok');
}).listen(CANARY_PORT);

// 3) Drive each hostile applet; assert no canary hit.
const b = await chromium.launch({
  headless: true,
  ...(CHROME ? {executablePath: CHROME} : {}),
  args: ['--no-sandbox'],
});
let failures = 0;
for (const c of cases) {
  hits = [];
  const p = await (await b.newContext()).newPage();
  await p.goto(`${WRAPPER}/run/?applet=${encodeURIComponent(c.url)}`, {waitUntil: 'load'}).catch(() => {});
  await p.waitForTimeout(4500);
  const leaked = hits.filter((h) => !h.startsWith('/favicon'));
  const shellSurvived = await p.locator('text=Clinical Applet Sandbox').count() > 0;
  const ok = leaked.length === 0 && shellSurvived;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}${ok ? '' : '  → canary hits: ' + JSON.stringify(leaked)}`);
  await p.close();
}
await b.close();
canary.close();
console.log(`\n${failures === 0 ? 'ALL CONTAINED' : failures + ' LEAK(S)'} across ${cases.length} hostile applet(s).`);
process.exit(failures === 0 ? 0 : 1);
