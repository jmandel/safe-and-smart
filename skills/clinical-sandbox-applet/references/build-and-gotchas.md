# Build configuration and hard-won gotchas

The security boundary is the **runtime** (two-origin server, opaque iframe, CSP,
broker, MessagePort) — not the bundler. Any bundler works as long as it preserves
the two invariants below. Everything here was discovered by actually running the
thing; several items are silent failures that pass typecheck and unit tests.

## The two invariants

1. **The applet worker must be ONE self-contained classic (IIFE) script** — no ES
   modules, no code splitting, no external chunks, no module-preload polyfill.
2. **Trust tiers stay in separate bundles** — token/host-only code never lands in
   the sandbox-launcher or worker output.

## Gotcha 1 — module workers don't load from `blob:` in an opaque origin (THE big one)

The applet worker is created from a `blob:` URL inside a `sandbox="allow-scripts"`
(opaque-origin) iframe. **Chromium cannot instantiate a `{type:'module'}` worker
there** — it fails with an opaque, message-less error and the applet never boots.
Classic workers work fine.

Symptom: iframe loads, worker is created, then a bare `Applet worker error
undefined` and nothing renders. The worker's own top-level code never executes
(no console output from it), because it's a *load*, not runtime, failure.

Fix: build every applet bundle as a classic IIFE (`Bun.build({format:'iife'})`),
and have the wrapper **always load the applet from a URL** — the launcher fetches
nothing; the trusted host hands it the source text, which it runs as
`new Worker(blobUrl)` (classic, no `{type:'module'}`). The repo's `build.ts` does
exactly this (see "The build (Bun)" below). There is no built-in inlined worker;
the default applet is just the first registry entry, loaded like any other.

## Gotcha 2 — (Vite only) the module-preload polyfill breaks an inline worker

If you build with Vite instead of Bun, its module-preload polyfill is injected as
a relative `import` into every entry, including a `?worker&inline` worker; under
`blob:null` that relative import 404s and kills the worker. Set
`build.modulePreload: {polyfill: false}`. (Bun doesn't have this issue — there is
no inlined worker entry.)

## Gotcha 3 — `Clear-Site-Data: "cache"`/"storage" costs SECONDS per load

A natural defense-in-depth move is to send `Clear-Site-Data: "cache", "cookies",
"storage"` on the sandbox launcher document. **Don't ship the `"cache"` or
`"storage"` directives.** On a real, long-lived Chrome profile, Chromium
synchronously tears down the cache/storage backends for the origin *before
committing the document* — we measured **~2s for `"storage"` and up to ~5s for
`"cache"` per load**. It is also redundant: the launcher is an opaque origin that
cannot persist storage, the bundle is served `no-store`, and the launcher sets no
cookies. A fresh/headless profile has an empty cache, so this is invisible in
automated tests and only bites real users — measure on a warm profile.

Verdict: omit `Clear-Site-Data` entirely (or only `"cookies"`, which is cheap).

## Gotcha 4 — source maps + DevTools

`sourcemap: true` emits multi-MB maps (the host map was ~4MB). With DevTools open,
the browser auto-fetches and parses them on every load (and the worker map is
CSP-blocked under `connect-src 'none'`, which DevTools retries). Use `false` for
the served build, or `'hidden'` to keep maps available without the auto-fetch
comment. Flip to `true` only while actively debugging.

## Gotcha 5 — FHIR `effectiveDateTime` is a full ISO timestamp

Real servers return `"2015-01-19T20:11:16+00:00"`, not a date. Code that does
`new Date(`${date}T00:00:00Z`)` produces `NaN`. Parse full datetimes directly and
only force UTC-midnight for date-only strings:
```ts
const ms = s.length > 10 ? Date.parse(s) : Date.parse(`${s}T00:00:00Z`);
```

## Gotcha 6 — CORS and the open SMART sandbox

For demos, `https://r4.smarthealthit.org` is an open R4 server (no auth) with
Synthea patients and proper CORS (reflects the Origin). The wrapper's host page
has no `connect-src` restriction, so its `fetch` to the FHIR server works. The
applet's `fhirRequest` headers stay CORS-safelisted (`accept`), so no preflight.
A good pediatric patient with longitudinal vitals: `0d1c4ee3-084d-4818-9689-783e94162748`
(Lloyd Rippin, born 2012; height/weight/BMI from birth).

## Gotcha 7 — the worker has a *synthetic* DOM; probe the native one

Remote DOM's polyfill installs a synthetic `document`/`window` in the worker so
React can render. A naive isolation probe (`typeof document === 'undefined'`) will
therefore wrongly report "DOM available." Capture native globals in a module
imported **before** the polyfills, and probe those, so the report honestly says
"no native DOM; UI is a host-serialized Remote DOM tree."

## The build (Bun) — what the repo actually uses

The repo is bundled by **Bun only** (`build.ts`, no Vite). Two kinds of output:

1. **HTML entries** — `index.html` (landing), `app.html` (wrapper runtime),
   `sandbox.html` (launcher) — built together with Bun's HTML bundler, which
   bundles their module scripts + CSS and rewrites refs. These are ES-module
   scripts; that's fine because they load same-origin (or from a host sending CORS
   headers — GitHub Pages sends `access-control-allow-origin: *`, which is what
   lets the opaque iframe load its module launcher).
2. **Applet bundles** — `Bun.build({format:'iife'})` per applet entry →
   `dist/applets/*.js`. Self-contained CLASSIC scripts, loaded at runtime by the
   wrapper and run as classic blob workers.

`import.meta.env.*` (Vite-style, used for base path + broker/SMART config) is
replaced at build time with Bun's `define`. Shape:

```ts
// build.ts — bun run build.ts   (env: VITE_BASE, VITE_SANDBOX_ORIGIN=self for Pages, …)
const def = (n) => process.env[n] === undefined ? 'undefined' : JSON.stringify(process.env[n]);
const define = {
  'process.env.NODE_ENV': '"production"',
  'import.meta.env.BASE_URL': JSON.stringify(process.env.VITE_BASE ?? '/'),
  'import.meta.env.VITE_SANDBOX_ORIGIN': def('VITE_SANDBOX_ORIGIN'),
  // … other VITE_* the code reads (define as 'undefined' when unset so `?? default` works)
};

await Bun.build({                       // HTML entries (host/landing/launcher)
  entrypoints: ['index.html', 'app.html', 'sandbox.html'],
  outdir: 'dist', target: 'browser', minify: true, define,
  ...(BASE !== '/' ? {publicPath: BASE} : {}),
});

for (const a of APPLETS) {              // applet bundles → classic IIFE
  const r = await Bun.build({entrypoints: [a.entry], target: 'browser', format: 'iife', minify: true, define});
  await Bun.write(`dist/applets/${a.out}`, await r.outputs[0].text());
}
```

Security is unchanged because it lives in the server/iframe/CSP/broker — the
bundler only has to emit (1) classic self-contained applet bundles and (2)
separate tier bundles (token/host code never lands in launcher or applet output).

If you prefer **Vite**: use `worker.format:'iife'` + `inlineDynamicImports` for an
inlined `?worker&inline` worker, `build.modulePreload:{polyfill:false}` (Gotcha 2),
and `sourcemap:false` (Gotcha 4). The runtime contracts are identical.

## Deploying to GitHub Pages (single origin)

Pages is one static origin with no custom response headers. Two adaptations,
both already in the repo: build with `VITE_SANDBOX_ORIGIN=self` (the launcher
loads same-origin under the Vite `base`) and put the launcher CSP in a
`<meta http-equiv="Content-Security-Policy">` in `sandbox.html`. Verified: a
meta-CSP `connect-src 'none'` **propagates to the blob worker** and blocks its
network even with no CSP header, so isolation holds. `.github/workflows/deploy.yml`
runs `bun install` + `bun run build.ts` with `VITE_BASE=/<repo>/` and deploys.

## Verifying (do this — typecheck/unit tests won't catch the runtime failures above)

Drive it headless and assert the applet actually rendered AND stayed contained:

```js
// the page must reach the applet heading, AND the isolation probes must pass
await page.goto(hostUrl, {waitUntil: 'load'});
await page.getByRole('heading', {name: 'Your Applet'}).waitFor();
expect(await page.getByText('isolation checks passed').count()).toBe(1);
expect(await page.locator('.remote-chart canvas').count()).toBe(1); // if charting
```

Phase-timing tip: the applet renders inside the worker, so the wrapper's audit log
(host-timestamped) is a free, on-screen boot timeline — read the deltas between
audit entries to localize a slow phase before guessing.
