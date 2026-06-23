# Security claims and assumptions (for independent verification)

This document states, precisely and conservatively, what the **safe-and-smart**
wrapper claims to prevent, the mechanism behind each claim, the evidence we have,
and — most importantly — the **assumptions** each claim rests on that an
independent reviewer should confirm. It is deliberately scoped: we claim
**prevention of silent, programmatic exfiltration by ordinary (including hostile
or LLM-generated) applet code**, not absolute prevention of every disclosure path.

If you are reviewing this, the fastest high-value pass is: (1) confirm the
assumptions in §4 hold in your target browsers, (2) audit the trusted computing
base in §3, (3) try to violate the claims in §2 with a hostile applet.

## 0. Design evolution since the original spike (read this first)

This started as a research spike and has changed in ways a reviewer will not have
seen documented elsewhere. **None of the changes alter the core security model**
(untrusted applet in a worker → Remote DOM → vetted host component catalog;
token-less broker; opaque-origin launcher). Several are security-relevant; here
they are, grouped by effect, so you can calibrate quickly.

**Neutral to the security model (build / tooling / ergonomics):**
- **Bundler: Vite → Bun.** The project now builds with a single `build.ts` (Bun);
  Vite and Vitest were removed (smaller build-tooling surface; unit tests run under
  `bun test`). The bundler is *not* in the runtime TCB, but it must preserve two
  invariants the model relies on (A8): the applet worker ships as **one
  self-contained classic (IIFE) script** — a *module* worker cannot load from a
  `blob:` URL in an opaque origin, so this is load-bearing — and the trust tiers
  stay in **separate bundles** (token/host code never bundled into the launcher or
  worker). `import.meta.env` values are inlined at build via Bun `define`.
- **Distinct entry points / clean URLs** (`/`, `/run`, `/fhir`) plus an applet
  picker. The picker's "remembered applets" list lives in the **wrapper origin's**
  `localStorage` — trusted-origin storage, **not** the applet sandbox (which still
  has none; C4 is unaffected).
- **Removed `Clear-Site-Data` from the launcher** (it cost seconds per load on real
  profiles). It was defense-in-depth wiping launcher-origin storage; it is **not**
  load-bearing, because the launcher is an opaque origin that cannot persist
  storage anyway (C4 rests on the opaque origin per A2). Flagged so you don't read
  its absence as a dropped control.

**Strengthened:**
- **A host-page CSP was added** (defense-in-depth for C3): the trusted shell now
  locks `img-src data: blob:`, `media-src`/`object-src 'none'`,
  `form-action 'none'`, `base-uri 'none'`, so a rendered-channel beacon fails even
  if a URL-bearing component is added later or a host dependency is compromised. Its
  `script-src` is `'self'` — Vega's expressions run through a CSP-safe AST
  interpreter, not `eval` (see §6).
- **Real SMART standalone launch** (`/fhir`): the wrapper performs the OAuth itself
  and holds the token; the applet still receives only brokered capabilities (C1).
  Clinician/encounter identity now comes from the launch (`openid`/`fhirUser`),
  replacing hardcoded demo identities that existed in the original spike.

**New capability, with a bounded security argument:**
- **Applets are fetched from a URL at runtime.** The original built-in inlined
  worker was removed; the launcher always runs **wrapper-fetched** applet source as
  a classic blob worker. This is what lets the wrapper host third-party /
  LLM-authored / externally-hosted applets. It does **not** change the threat
  model: applets are untrusted by assumption regardless of origin, and the
  **trusted wrapper** performs the fetch (the opaque sandbox has `connect-src
  'none'` and can never fetch code — its own or anyone's). *Provenance* (knowing
  which URL ran: optional hash-pin / allowlist / audit) is separate from
  *containment* (what the code can do, which does not depend on provenance).
  **Review URL-loaded and bundled applets identically.**

**Deployment posture (affects §4 assumptions, not §2 claims):**
- The public demo is **single-origin on GitHub Pages**: wrapper and launcher share
  one origin, and Pages cannot set response headers, so the launcher CSP is
  delivered as a `<meta http-equiv>` tag rather than a header (we verified the
  meta-CSP `connect-src 'none'` still propagates to the blob worker; Pages also
  sends `Access-Control-Allow-Origin: *`, which is why the opaque iframe can load
  its launcher script). This is a **weaker posture** than the recommended
  production setup — two registrable domains + server-set headers + a managed
  egress proxy — and is called out in §6. The same source builds either posture via
  `VITE_BASE` / `VITE_SANDBOX_ORIGIN`.

## 1. System under review (one design, one tier)

A single **trusted wrapper** (the "shell", a normal web origin) performs the
SMART App Launch and holds the OAuth token. It runs each applet as **untrusted
code** with this topology:

```
Trusted wrapper origin (has token, broker, host component renderers)
  └─ <iframe sandbox="allow-scripts">  (opaque origin; the "launcher")
       └─ DedicatedWorker (classic blob worker)   ← the applet runs HERE
            • real React, but NO real document/DOM, NO window.location
            • CSP connect-src 'none' (no fetch/XHR/WebSocket/beacon)
            • opaque origin ⇒ no usable storage
            • only channel out: one MessagePort (capabilities + UI tree)
```

The applet's UI is **React in the worker → Shopify Remote DOM serialized tree →
the wrapper renders it through a FIXED map of vetted host components**
(`remoteComponentMap`). This is the **catalog tier**.

**Explicitly NOT in scope of this review / not implemented:** a "direct-DOM"
tier that renders arbitrary applet element trees into an iframe. We evaluated it
(see §7) and rejected it: closing its navigation channels would require running
trusted JavaScript *inside* the render iframe to strip/broker link clicks, which
enlarges the TCB. The catalog tier needs no in-iframe click brokering because it
never renders an applet-controlled link, image URL, or navigation at all.

## 2. Claims

Each claim lists the **mechanism**, the **evidence** we have, and the **assumption**
it depends on (cross-referenced to §4).

- **C1 — The applet never obtains the SMART bearer token or any credential.**
  Mechanism: the token lives only inside the wrapper's `fhirclient` closure; the
  broker returns parsed response bodies, never the token, and strips
  `authorization`/`cookie`/`origin`/`host` from applet-supplied headers.
  Evidence: code review of `clinical-broker.ts` / `fhir-capability.ts`; unit
  tests. Assumptions: A6 (MessagePort is the only channel), A8 (token/host code
  not bundled into the worker).

- **C2 — The applet cannot make arbitrary network requests.**
  Mechanism: the worker runs under CSP `connect-src 'none'`, which the spec
  applies to `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, and
  `navigator.sendBeacon`. No general network primitive is exposed; the only
  egress is the broker, which restricts FHIR to the active SMART base and binds
  LLM calls to named profiles. Evidence: we observed a `securitypolicyviolation`
  with `violatedDirective: connect-src` for a `fetch` from a blob worker created
  inside the opaque iframe (Chromium 133). Assumptions: A1 (CSP propagates to
  blob workers), A2 (opaque origin).

- **C3 — The applet cannot exfiltrate through rendered channels** (images, CSS
  `url()`, links, forms, `<iframe>`, fonts, media, navigation).
  Mechanism: the wrapper renders **only element names present in
  `remoteComponentMap`**; an element name not in the map causes
  `renderRemoteNode` to **throw** (it does not pass the element through to the
  DOM). Every renderer coerces props to enums/clamped-numbers/length-capped text;
  none emits an applet-controlled URL; the Vega spec is sanitized to reject any
  `url`/`href`/`src`/loader. The worker has no `document`/`window.location`, so
  there is no navigation surface. A host-page CSP (`img-src data: blob:`,
  `media-src/object-src 'none'`, `form-action 'none'`, `base-uri 'none'`) is a
  defense-in-depth backstop. Evidence: a hostile applet emitting
  `<img>/<a>/<iframe>` produced a `No component found for remote element` throw
  and no DOM/network (see §8). Assumptions: A3 (unknown elements throw, not
  passthrough), A4 (no sink in any renderer; Vega sanitizer correct), A5 (only
  declared properties sync, so `style`/`className`/`on*` never cross).

- **C4 — The applet cannot persist data.** Mechanism: opaque origin ⇒ no usable
  cookies/localStorage/IndexedDB/CacheStorage. Evidence: isolation probe reports
  storage unavailable. Assumption: A2.

- **C5 — The applet cannot read the wrapper's DOM/storage or other origins'
  data.** Mechanism: it runs in a worker (no DOM) inside an opaque-origin iframe
  (no same-origin access to the wrapper). Assumptions: A2, A6.

- **C6 — The FHIR broker confines requests** to the active SMART base path,
  rejects absolute/escaping URLs, is read-only by default, enforces time/size
  budgets, and records a metadata-only audit. Evidence: `fhir-capability` unit
  tests. Assumption: A8.

## 3. Trusted computing base (audit targets)

A bug in any of these can break the claims:
- the wrapper shell + broker (`src/host/**`), especially header stripping, URL
  confinement, and that no code path returns the token;
- the **host component renderers** (`src/host/components/remote-components.tsx`)
  and the **Vega sanitizer** (`vega-sanitizer.ts`) — these define the entire
  rendered-output surface;
- the two-origin server / headers (`tools/serve.mjs`) and the launcher CSP
  (`sandbox.html` meta + dev header);
- third-party deps that run in the wrapper (React, vega-embed, fhirclient,
  @remote-dom/*) — pinned; a compromise here is in-scope-for-impact, out-of-scope
  -for-our-claims (see §5).

## 4. Assumptions to independently verify

- **A1.** A `blob:` **classic** worker created inside a `sandbox="allow-scripts"`
  (opaque-origin) iframe inherits and enforces the iframe document's CSP,
  including `connect-src 'none'` for `fetch`/XHR/WebSocket/EventSource/sendBeacon.
  *Verify across every supported browser + version*; we only confirmed current
  Chromium.
- **A2.** `sandbox="allow-scripts"` without `allow-same-origin` yields an opaque
  origin with no ambient credentials and no usable persistent storage, in all
  supported browsers.
- **A3.** `@remote-dom/react` host (pinned version) **throws** for an element name
  absent from the components map and **never** maps an unknown name onto a real
  DOM element. *Verify for the pinned version and pin it*; re-verify on upgrade.
- **A4.** No renderer in `remote-components.tsx` forwards an applet-controlled
  value into a URL, raw HTML, CSS, or DOM event-handler position; the Vega
  sanitizer rejects all external/loadable references. (Manual audit + the §8
  harness.)
- **A5.** `@remote-dom/core` custom elements sync **only declared properties**, so
  `style`, `className`, `id`, `data-*`, and `on*` set by the applet never reach
  the host renderer.
- **A6.** The applet↔wrapper channel is exactly one `MessagePort`, established via
  a one-time transfer bound to `event.source === window.parent` **and** a 128-bit
  nonce; no other `postMessage`/global is trusted.
- **A7.** The launcher document cannot be navigated or reframed to bypass the
  handshake (`frame-ancestors`, nonce check), and the wrapper page is not framable
  by hostile origins.
- **A8.** The build emits a **self-contained classic worker** (no external chunk
  fetches, which would fail under the opaque origin anyway) and preserves **tier
  separation** — token/broker/host code is never bundled into the launcher or
  worker outputs.

## 5. Non-claims / out of scope

We do **not** claim to prevent:
- **User-mediated disclosure** — a clinician reading, copying, screenshotting,
  printing, or retyping data the applet legitimately displays.
- A **compromised browser/OS**, malicious browser extension, or browser **zero-day**.
- A **compromised wrapper dependency** or supply-chain attack on the TCB (§3).
- The **FHIR server's own authorization** — scope enforcement is the server's job;
  the broker is intentionally broad within the granted SMART scopes.
- **Capability abuse within granted scope** — e.g., an applet laundering data into
  a FHIR write or a `session.ai` prompt sent to a logged/third-party model.
  Mitigated by broker policy (read-only default, quotas, LLM-destination
  governance, audit), not eliminated; reviewers should treat the **broker policy**
  as the control here, not the sandbox.
- **Covert timing/behavioral channels** through the audited, rate-limited broker.

## 6. Known weaknesses / open items
> **Phase-0 re-baseline (closed since first draft).** The items below marked
> *(closed)* were open in the original draft and have since been fixed and
> regression-tested; they are retained here for reviewer traceability. See §9.
- *(closed)* **No error boundary** around `RemoteRootRenderer` — a disallowed
  element used to unmount the whole wrapper UI. Now contained to the applet
  surface by `AppletErrorBoundary` (reload-applet affordance; shell survives).
- *(closed)* **Host `script-src 'unsafe-eval'`** — dropped. Vega now runs through
  the CSP-safe AST interpreter (`vega-interpreter`), so the host CSP no longer
  carries `unsafe-eval`.
- *(closed)* **`importScripts` same-origin channel** — the worker prelude
  neutralizes `importScripts` (own + prototype) and nested `Worker`/`SharedWorker`
  before any applet code runs; with no worker `unsafe-eval`, the native cannot be
  recovered. Verified by a hostile red-team case (zero canary hits).
- *(closed)* **Vega `usermeta` exfil** — `usermeta` (and scheme/protocol-relative/
  `url()` string values) are rejected by the spec sanitizer; the loader rejects all
  network/file access. Was confirmed live, then closed and regression-tested.
- *(closed)* **Unbounded FHIR/mutation volume** — FHIR responses carry a byte
  budget enforced during retrieval, auto-paging is capped, request headers are
  allowlisted, and the Remote DOM connection is wrapped by a mutation budget +
  error-isolation gateway.
- *(closed)* **Declarative Safe-DOM mutation firewall.** Each mutation record is
  now validated against `SAFE_DOM_SCHEMA` *before* it reaches the receiver
  (`safe-dom-firewall.ts`, wired in `App.tsx`): unknown element/prop/event/attribute
  → rejected; `style`/`className`/`src` validated by value (`src` must be a
  `data:image/` URL). Verified by the `raw-mutation` hostile case (forged records
  driven straight at the connection).
- The public demo runs single-origin on GitHub Pages (wrapper and launcher share
  an origin; isolation still from the opaque iframe + meta-CSP). A production PHI
  deployment should use two registrable domains + server-set headers + a managed
  egress proxy.

## 7. Why not the "direct-DOM in a locked iframe" tier
We measured a CSP-locked, sandboxed iframe (see §8): it blocks all **resource**
channels (img/css/connect/font/media/frame/form-submit/popup) but **not
navigation** — `location.href`, `<meta refresh>`, and **`<a href>` clicks** all
exfiltrated. Closing those requires (a) no applet script in the render document
*and* (b) the trusted renderer stripping/brokering `href` and denylisting
`<meta>`/`<base>`. (b) means running trusted JS inside the render iframe to broker
clicks — which we are choosing not to do. The catalog tier avoids the entire
problem by not rendering applet-controlled navigations.

## 8. Reproduction harness (evidence)
The claims above were checked with headless-browser probes a reviewer can rerun:
- **connect-src on blob worker:** worker `fetch` → `securitypolicyviolation`,
  `violatedDirective=connect-src`, request never sent.
- **rendered-channel / unknown elements:** an applet rendering `<img>/<a>/<iframe>`
  → host logs `Error: No component found for remote element: img`; no request to
  the canary; nothing added to the DOM.
- **locked-iframe navigation residual (the rejected tier):** `location.href`,
  `<meta refresh>`, and `<a href>` click each reached a canary server from a
  `default-src 'none'` sandboxed iframe; `href`-strip and capturing
  `preventDefault` closed the click case only.

Reviewers should treat §4 assumptions as the verification checklist and §2 claims
as the properties to attack.

## 9. Phase-0 hardening + standing red-team harness
The §6 *(closed)* items landed as commits P0a–P0h and are guarded by a repeatable
red-team harness (`tests/security/redteam.mjs`, `bun run test:redteam`): each
`tests/security/hostile/*.entry.tsx` is built as a real applet bundle, loaded in
the running wrapper, and asserted to produce **zero hits** on an independent canary
server **and** to leave the shell alive. Current hostile corpus (all CONTAINED):
- `vega-usermeta` — smuggles an exfil URL through `usermeta.embedOptions.config`.
- `import-scripts` — `importScripts` via own-property, prototype, and nested Worker.
- `disallowed-element` — raw `<img>` (rejected by the Safe-DOM firewall).
- `raw-mutation` — forged mutation records driven straight at the connection,
  bypassing React (exercises the pre-receiver Safe-DOM firewall).
- `styled-exfil` — a `url()` beacon smuggled through an applet stylesheet.
- `svg-exfil` — an external reference smuggled through author SVG markup.
- `image-src-exfil` — a remote / `handle` `src` forced onto `ui-image`.
The corpus grows by one+ case per phase; a phase is not "done" until its new
hostile cases are CONTAINED. Host-side controls are unit-tested across
`tests/*.test.ts` (firewall, mutation gateway, CSS + SVG validators, safe events,
FHIR capability).

## 10. Reproducing claims against an exact release (Phase 7)
- `bun run verify` runs typecheck + the unit suite; the `verify` CI workflow
  (`.github/workflows/verify.yml`) additionally builds and runs the browser
  red-team on every push, so these claims are enforced, not just asserted.
- `bun run release` emits `dist/RELEASE_MANIFEST.json` — SHA-256 of every served
  artifact and of each trusted-computing-base source file, plus the schema/protocol
  versions and pinned dependency versions. A reviewer matches the deployed hashes,
  then audits the named `tcbSources`.
- `docs/PRODUCTION_DEPLOYMENT.md` defines the supported deployment configurations
  (demo single-origin Pages vs. production two-domain + server headers + managed
  egress), the browser matrix, dependency upgrade gates, applet signing/identity,
  and incident/revocation procedures.
