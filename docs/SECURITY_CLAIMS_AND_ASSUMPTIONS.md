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
  there is no navigation surface. A host-page CSP (`img-src 'self' data: blob:`,
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
  a FHIR write or an `llmComplete` prompt sent to a logged/third-party model.
  Mitigated by broker policy (read-only default, quotas, LLM-destination
  governance, audit), not eliminated; reviewers should treat the **broker policy**
  as the control here, not the sandbox.
- **Covert timing/behavioral channels** through the audited, rate-limited broker.

## 6. Known weaknesses / open items
- **No error boundary** around `RemoteRootRenderer`: an applet that emits a
  disallowed element throws and currently unmounts the **whole wrapper UI**
  (availability bug; fail-closed for exfil but blanks the shell). Recommend an
  error boundary that contains the failure to the applet surface.
- The host CSP carries `script-src 'unsafe-eval'` for Vega's expression compiler;
  reviewers should weigh this (mitigation: Vega CSP-safe interpreter).
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
