# Standalone, URL-loadable applets

This is the model's strongest demonstration: a normal **bun + TypeScript + React +
Zustand** app, compiled into a single file, hosted **anywhere** (GitHub Pages, a
CDN, S3), and loaded by a trusted wrapper **at runtime** — where it runs safely
against the wrapper's in-context SMART on FHIR launch without ever touching the
token, network, DOM, or storage.

The reference implementation **implements this today** (not just documents it):
- `src/applet/runtime.tsx` — the applet runtime/SDK (`runApplet(App, manifest)`).
- `src/applet/standalone-entry.tsx` — an example standalone entry.
- `tools/build-applet.ts` — Bun build → `dist/applets/growth-remote.js` (classic IIFE).
- The wrapper loads `?applet=<url>`, fetches it on the trusted side, and runs it.

Verified: loading the bundle **cross-origin** at runtime renders the applet,
passes all isolation probes, and pulls live FHIR — identical to the default applet path.

## You do NOT register an applet to run it

This is the deployment payoff worth stressing. An applet does **not** need to be
bundled into, registered with, or deployed alongside any particular wrapper. Host
the bundle anywhere with permissive CORS, then run it in **any compatible wrapper**
— including the public demo or any other hosted copy — by appending `?applet=<url>`:

```
https://joshuamandel.com/safe-and-smart/?applet=https://you.example/applet.js
```

The wrapper just fetches your source and sandboxes it; there is no registry,
manifest upload, or redeploy. Registering an applet in a wrapper's `build.ts` /
`REGISTRY` is **only** for shipping it inside that wrapper and listing it in the
picker — a convenience, not a requirement. So an applet author can iterate on a
GitHub Pages bundle and demo it live against a real (or sandbox) SMART context
they never had to stand up themselves. (Provenance controls — which wrappers
choose to load which URLs — are a wrapper policy decision; see "provenance vs.
containment" in `patterns.md`.)

## The contract (what "compiled into a loadable form" means)

An applet bundle is **one self-contained classic (IIFE) worker script** whose
entry calls the runtime:

```ts
// the entire applet entry
import {runApplet} from '@clinical-sandbox/applet-runtime'; // or a vendored copy
import {App} from './App';                                   // your React app
runApplet(App, {appletId: 'org.acme.my-applet', appletVersion: '1.0.0'});
```

`runApplet` owns the worker-side protocol (handshake, security probe, Remote DOM
wiring) and renders `<App clinical={…} context={…} securityProbe={…} />`. The
author writes only `App` and uses any pure libraries (Zustand, etc.) normally.

The two build invariants from `build-and-gotchas.md` still apply, and are exactly
what makes a bundle URL-loadable: **classic IIFE, fully self-contained** (no
ES-module worker, no external chunks — they can't load from a `blob:` URL in the
opaque sandbox; non-conforming bundles fail closed).

## Building the bundle (Bun)

```ts
// build-applet.ts — bun run build-applet.ts
const result = await Bun.build({
  entrypoints: ['src/standalone-entry.tsx'],
  target: 'browser',
  format: 'iife',                                   // classic worker script
  minify: true,
  define: {'process.env.NODE_ENV': '"production"'}, // production React
});
await Bun.write('dist/applet.js', await result.outputs[0].text());
```

This is exactly how the repo builds its applet bundles (`build.ts`). A Vite
`?worker&inline` build produces an equivalent inlined classic bundle, but Bun is
a single explicit step and matches the "standalone bun/ts app" framing.

## How the wrapper loads it (the safe flow)

```
clinician opens wrapper?applet=https://acme.github.io/my-applet/applet.js
   │
   ▼
TRUSTED wrapper fetch()es the bundle text   ← only the wrapper has network
   │  (validate here if you want provenance: SHA-256/SRI, allowlist, audit URL+hash)
   ▼
wrapper postMessages {nonce, port, appletSource} into the opaque launcher iframe
   │  (the sandbox has connect-src 'none' — it can NEVER fetch the bundle itself)
   ▼
launcher: new Worker(URL.createObjectURL(new Blob([appletSource],{type:'text/javascript'})))
   │  classic blob worker — no {type:'module'}
   ▼
applet runs: handshake → brokered fhirRequest/llmComplete/audit only
```

Crucial: the wrapper **fetches but never `eval`/`Function()`s** the bundle — it
hands the text to a *worker*, so untrusted code never executes in the trusted
context. The applet inherits the wrapper's SMART session purely through the
broker; it never sees the token.

## Hosting anywhere — the CORS detail

The **trusted wrapper** performs the fetch, so the applet host must allow that
cross-origin read (or the wrapper proxies it):
- **GitHub Pages**: sends `access-control-allow-origin: *` (verified), so a
  Pages-hosted bundle loads cross-origin into another wrapper out of the box.
- **CDNs**: jsDelivr (`https://cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/applet.js`)
  and `raw.githubusercontent.com` also send `ACAO: *`.
- **Same-origin**: host the bundle on the wrapper's own domain — no CORS at all.
- **Wrapper-proxied**: the wrapper's backend fetches the URL server-side and
  re-serves it same-origin. Lets the wrapper enforce allowlists/hashes centrally
  and works even for hosts that send no CORS header.

In the reference impl, the dev sandbox origin sends `ACAO: *`, which is why
loading `?applet=http://127.0.0.1:4274/applets/growth-remote.js` works cross
-origin out of the box.

## Provenance vs. containment (how much to trust the URL)

Containment does not depend on trusting the bundle — see `patterns.md`
("Containment vs. provenance"). For a CIO-curated app catalog, add provenance
controls (hash/signature pinning, source allowlist, audit). For truly arbitrary
URLs, containment still holds; harden the **broker** instead (read-only by
default, per-applet scopes, quotas, LLM-destination governance, worker execution
timeouts, untrusted-UI labeling).
