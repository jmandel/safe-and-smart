# Architecture

One **trusted wrapper** does the SMART-on-FHIR launch once, holds the token, and runs
many **untrusted applets** inside it. Safety is a property of the wrapper, not a
promise each applet keeps. An applet can be first-party, third-party, or
LLM-written; it still cannot leak the token, call home, or touch the DOM.

## The containment stack

```
┌─ Trusted wrapper (real origin; holds the SMART token) ───────────────────────┐
│  • Handler registry (the broker): smart / ai / styles / audit                │
│  • Host-side validators: Safe DOM mutation firewall, CSS + SVG validators,    │
│    Vega sanitizer, FHIR URL/budget/scope enforcement                          │
│  • Renders the applet's element tree with vetted React components in a        │
│    ShadowRoot; CSP forbids every resource origin reachable from CSS           │
│                                                                               │
│   ┌─ Opaque-origin iframe  (sandbox="allow-scripts", no allow-same-origin) ─┐ │
│   │  • Launcher; its own strict CSP                                          │ │
│   │   ┌─ Dedicated Worker  (classic blob worker) ──────────────────────────┐│ │
│   │   │  • The applet: real React + your libraries                          ││ │
│   │   │  • NO DOM, NO network (connect-src 'none'), NO storage              ││ │
│   │   │  • UI via Remote DOM → serialized mutations → host                  ││ │
│   │   │  • Capabilities via `session.*` over a MessagePort                  ││ │
│   │   └────────────────────────────────────────────────────────────────────┘│ │
│   └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

Three nested boundaries, each independently sufficient for most threats: an
opaque-origin sandboxed iframe, a dedicated worker with no DOM/network/storage, and
a host-side mutation firewall that validates every UI change before it renders.

## How UI works (Remote DOM)

The applet runs **real React** in the worker, against a polyfilled DOM. Instead of
touching a real document, React's output becomes a stream of serialized **mutation
records** (insert/remove/update) sent over the MessagePort. The host:

1. runs every record through the **Safe DOM mutation firewall** — the element must be
   in the versioned schema, every property/event must be declared for that element,
   raw attributes are rejected, and node/depth/text quotas bound resource use;
2. renders the validated tree with a fixed map of **vetted React components**
   (`remote-components.tsx`) that coerce/clamp every prop;
3. mounts it inside a **ShadowRoot** so applet CSS is scoped to its surface.

So even an applet that bypasses the SDK and drives raw mutations cannot introduce an
undeclared element, prop, attribute, or event. (Proven by the `raw-mutation` hostile
red-team case.)

## How capabilities work (the handler registry)

The applet has no ambient powers; it acts only through `session.*`. The design is a
**single registry of capability handlers** in the wrapper, with two thin views:

```
  applet  ──►  session.smart.search(…)         ─┐
                                                 ├─►  one host handler  ──► validate,
  applet  ──►  fetch('https://fhir.internal/…') ─┘     scope, token, audit, dispatch
```

- The **broker** (`clinical-broker.ts`) registers one handler per concern
  (`smart`, `ai`, `styles`, `audit`) and composes them into the namespaced
  `session` object via `buildSession()`.
- The **handshake returns that object directly** — `@quilted/threads` proxies the
  nested functions and clones the nested data, so the wire shape *is* the API shape.
  No flat capability bag, no translation layer.
- The **typed SDK** (`session.smart`, `session.ai`, …) and the **`*.internal` fetch
  facade** (for dropping in `fhirclient`/`openai`) both funnel into the same handler.
  One enforcement point — the FHIR allowlist, scopes, budgets, and audit live once,
  not duplicated per access style.

To add a capability: register a handler. The typed method and (optionally) a
`*.internal` endpoint follow. See **HOST_API.md**.

## Two CSPs, and why CSS can't exfil

There are two Content-Security-Policies, and within the host one, two directive
*families* that must not be conflated:

- **Wrapper (host page) CSP.** `connect-src` is open (`'self' https: http:`) so the
  trusted wrapper can `fetch()` an applet bundle from anywhere and reach the FHIR/LLM
  servers. But the **CSS-reachable** directives are locked: `img-src data: blob:`,
  `font-src 'self' data:`, `style-src 'self' 'unsafe-inline'`, fallback
  `default-src 'self'`. **CSS cannot use `connect-src`** — it only loads resources via
  the image/font/style directives — so an applet stylesheet has no path to an external
  origin, even though scripted fetch is open. Any future CSS-fetch feature falls back
  to `default-src` (mandatory fallback chain), so coverage is complete by
  construction, not by pattern-matching.
- **Sandbox/worker CSP.** `connect-src 'none'` — the applet has no network at all.
  Applet code is fetched as *data* by the wrapper and run in a blob worker; it is
  never injected as a `<script src>`, so the host `script-src` stays `'self'`.

The CSS validator is therefore **defense-in-depth + DX + closing the same-origin
residual**, not the primary control. See **THREAT_MODEL.md** §CSS.

## Browser-only authoring

The `/author` playground compiles a multi-file TSX/CSS project **in the browser**
(esbuild-wasm + esm.sh for npm), concatenates the prebuilt SDK, hash-addresses the
artifact, and runs it through the identical sandbox. `wasm-unsafe-eval` is granted
only on `/author` (the trusted tool); the compiled applet still runs under the locked
sandbox CSP. Authored artifacts inherit full containment via the same launcher path.

## Source map

| Area | Files |
| --- | --- |
| Capability surface (wire = API) | `src/shared/protocol.ts` |
| Handler registry / broker | `src/host/broker/clinical-broker.ts`, `fhir-capability.ts` |
| Applet runtime (composes `session`, fetch facades) | `src/applet/runtime.tsx` |
| Safe DOM schema + firewall | `src/shared/safe-dom-schema.ts`, `src/host/safe-dom-firewall.ts`, `mutation-gateway.ts` |
| Validators | `src/host/css-validator.ts`, `safe-svg-validator.ts`, `components/vega-sanitizer.ts` |
| Vetted components / events | `src/host/components/remote-components.tsx`, `src/shared/safe-events.ts` |
| Styles install / surface | `src/host/ShadowSurface.tsx` |
| In-browser authoring | `src/host/authoring/esbuild-compile.ts`, `src/applet/authoring-sdk.ts` |

## Companion docs

- **APPLET_API.md** — the `session.*` surface for applet authors.
- **HOST_API.md** — the handler registry; how to add a capability.
- **THREAT_MODEL.md** — boundaries, the CSS/CSP guarantee, the attachment model.
- **SECURITY_CLAIMS_AND_ASSUMPTIONS.md** — claims to attack; reproduction harness.
- **PRODUCTION_DEPLOYMENT.md** — two-domain deployment, signing, incident/revocation.
