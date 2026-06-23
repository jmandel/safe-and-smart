// Content smoke harness: actually EXECUTES all shipped content in a real browser,
// so a runtime crash (e.g. btoa on a non-Latin1 char) can't hide behind a green
// tsc/bundle. It also proves the error-bubbling path: a deliberately-throwing
// applet must surface a visible error component, not a silent blank surface.
//
//   1. erroring fixture  → assert the wrapper shows the error component + message
//   2. every demo bundle (dist/applets/*.js) via /run → renders content, no error
//   3. every playground lesson + example via /author → renders content, no error
//
// Run: bun tests/content/smoke.mjs   (needs the built dist served at $WRAPPER)
// Env: WRAPPER=http://localhost:4273, REDTEAM_CHROMIUM=<chrome path>
import {readdirSync, mkdirSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright-core'); // declared in devDependencies

const WRAPPER = process.env.WRAPPER ?? 'http://localhost:4173'; // matches serve.mjs default
const LOCAL_CHROME = '/home/jmandel/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const CHROME = process.env.REDTEAM_CHROMIUM ?? (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);
const ERROR_TITLE = 'This applet hit an error';
const BOOM = 'intentional render failure for the error-bubbling test';

// Build the erroring fixture into a servable bundle.
mkdirSync('dist/applets/_smoke', {recursive: true});
{
  const r = await Bun.build({
    entrypoints: ['tests/content/erroring.entry.tsx'],
    target: 'browser',
    format: 'iife',
    minify: true,
    define: {'process.env.NODE_ENV': '"production"'},
  });
  if (!r.success) {
    for (const m of r.logs) console.error(m);
    process.exit(1);
  }
  await Bun.write('dist/applets/_smoke/erroring.js', await r.outputs[0].text());
}

const demoBundles = readdirSync('dist/applets').filter((f) => f.endsWith('.js'));

// Read the applet surface text + element count, piercing the open ShadowRoot.
async function readSurface(page, scopeSel) {
  return page.evaluate((sel) => {
    const scope = sel ? document.querySelector(sel) : document.body;
    const surface =
      scope && (scope.matches?.('.applet-surface') ? scope : scope.querySelector('.applet-surface'));
    if (!surface) return {found: false, text: '', els: 0};
    const host = surface.querySelector('.applet-shadow-host');
    const root = host && host.shadowRoot;
    const container = root && root.querySelector('.applet-shadow-root');
    if (!container) return {found: true, text: (surface.textContent || '').trim(), els: 0};
    return {
      found: true,
      text: (container.textContent || '').trim(),
      els: container.querySelectorAll('*').length,
    };
  }, scopeSel);
}

// Poll until the applet has rendered something (els >= 2) or shown the error
// component, or we time out.
async function waitForRender(page, scopeSel, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let last = {found: false, text: '', els: 0};
  while (Date.now() < deadline) {
    last = await readSurface(page, scopeSel);
    if (last.els >= 2 || last.text.includes(ERROR_TITLE)) return last;
    await page.waitForTimeout(150);
  }
  return last;
}

const browser = await chromium.launch({
  headless: true,
  ...(CHROME ? {executablePath: CHROME} : {}),
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext();
let failures = 0;
const fail = (name, why) => {
  failures++;
  console.log(`FAIL  ${name}  → ${why}`);
};
const pass = (name, note = '') => console.log(`PASS  ${name}${note ? '  ' + note : ''}`);

async function openRun(appletPath) {
  const page = await ctx.newPage();
  await page
    .goto(`${WRAPPER}/run/?applet=${encodeURIComponent(appletPath)}`, {waitUntil: 'load'})
    .catch(() => {});
  return page;
}

// ── 1. Error bubbling: the throwing applet must surface a visible error ───────
{
  const name = 'error-bubbling/erroring';
  const page = await openRun('/applets/_smoke/erroring.js');
  const s = await waitForRender(page, null);
  const shellSurvived = (await page.locator('text=Clinical Applet Sandbox').count()) > 0;
  if (!shellSurvived) fail(name, 'wrapper shell did not survive the applet error');
  else if (!s.text.includes(ERROR_TITLE)) fail(name, `no error component shown (surface: ${JSON.stringify(s.text.slice(0, 80))})`);
  else if (!s.text.includes(BOOM)) fail(name, 'error component shown but missing the thrown message');
  else pass(name, '→ error bubbled up as a visible component');
  await page.close();
}

// ── 2. Every demo bundle renders content with no error ────────────────────────
for (const file of demoBundles) {
  const name = `demo/${file}`;
  const page = await openRun(`/applets/${file}`);
  const s = await waitForRender(page, null);
  const shellSurvived = (await page.locator('text=Clinical Applet Sandbox').count()) > 0;
  if (!shellSurvived) fail(name, 'wrapper shell did not survive');
  else if (s.text.includes(ERROR_TITLE)) fail(name, `applet errored: ${JSON.stringify(s.text.slice(0, 160))}`);
  else if (s.els < 2) fail(name, 'applet surface rendered nothing (blank)');
  else pass(name);
  await page.close();
}

// ── 3. Every playground lesson + example renders content with no error ────────
async function walkPlayground(modeLabel) {
  const page = await ctx.newPage();
  await page.goto(`${WRAPPER}/author/`, {waitUntil: 'load'}).catch(() => {});
  await page.waitForSelector('.play-side-item', {timeout: 15000});
  if (modeLabel === 'Examples') {
    await page.locator('.play-modes button', {hasText: 'Examples'}).click();
    await page.waitForTimeout(200);
  }
  const count = await page.locator('.play-side-item').count();
  for (let i = 0; i < count; i++) {
    const item = page.locator('.play-side-item').nth(i);
    const label = (await item.innerText()).replace(/\s+/g, ' ').trim().slice(0, 40);
    const name = `playground/${modeLabel}/${i + 1}. ${label}`;
    await item.click();
    // Let the debounced compile start, then wait for the buffer to be promoted
    // (the "updating" pill is removed once the new preview is ready).
    await page.waitForTimeout(700);
    await page.locator('.play-updating').waitFor({state: 'detached', timeout: 30000}).catch(() => {});
    await page.waitForTimeout(300);
    const scope = '.play-buf:not(.play-buf--pending)';
    const s = await waitForRender(page, scope, 8000);
    if (s.text.includes(ERROR_TITLE)) fail(name, `errored: ${JSON.stringify(s.text.slice(0, 160))}`);
    else if (s.els < 2) fail(name, 'preview rendered nothing (blank)');
    else pass(name);
  }
  await page.close();
}
await walkPlayground('Learn');
await walkPlayground('Examples');

await ctx.close();
await browser.close();
console.log(`\n${failures === 0 ? 'ALL CONTENT OK' : failures + ' FAILURE(S)'} (${demoBundles.length} demos + playground).`);
process.exit(failures === 0 ? 0 : 1);
