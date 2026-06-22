# Reuse patterns

The same runtime supports a spectrum of deployment shapes. Match the user's
situation; lead with the platform pattern when the framing is organizational
("let clinicians build/experiment safely").

## 1. Platform / host (default — the headline story)

**One wrapper, a registry of applets, pick-an-applet.** The hospital deploys a
single trusted wrapper that does the SMART launch once. Applets are registry
entries; running another is just selecting it. Every applet is equally contained,
so onboarding a new one is a content decision, not a security review.

Minimal registry shape (wrapper side):
```ts
const REGISTRY = [
  {id: 'growth-explorer', title: 'Growth Explorer', source: growthAppletSource},
  {id: 'med-reconciler',  title: 'Med Reconciler',  source: medAppletSource},
];
// Wrapper renders a picker; the chosen entry's `source` becomes the worker blob.
```
To make applets independently selectable, build **each applet as its own
self-contained classic worker bundle** (the build invariant) and have the launcher
instantiate the chosen one. The reference impl currently bundles a single applet
at build time; generalizing to a registry/picker is the natural next step and a
great thing to demo.

CISO pitch: *"Enable one wrapper; safety is a property of the wrapper, not a
promise each app makes."*

## 2. Dynamic / late-bound applets (an applet "store", or LLM-authored applets)

The wrapper loads an applet bundle **from a URL** (or accepts user-/LLM-authored
code) at runtime and runs it in the same sandbox. **This is safe because applets
are untrusted by construction** — the origin of the code does not change the
threat model. The reference impl implements this end to end (host fetches
`?applet=<url>`, passes the source to the launcher, which runs it as a classic
blob worker); see `standalone-applets.md` for the build + hosting + load recipe. A URL-loaded applet has exactly the authority of a bundled one: no
token, no network (`connect-src 'none'`), no DOM, no storage; only the brokered
capabilities.

Safe recipe:

1. **The trusted wrapper does the fetch, never the sandbox.** The wrapper has
   network authority and fetches the applet source as text; the opaque-origin
   sandbox keeps `connect-src 'none'`, so the applet can never fetch anything —
   including its own code or updates. Loading is mediated exactly like FHIR is.
2. **Validate before instantiating.** As gatekeeper, the wrapper should: pin a
   SHA-256 (SRI-style) hash or signature per registry entry and reject
   mismatches; keep a CIO-controlled allowlist/catalog of applet sources rather
   than arbitrary user URLs; and `audit()` the URL + hash on load.
3. **Honor the build invariant.** "Load via URL" means load **one self-contained
   classic (IIFE) script** — no ES-module worker, no external chunks (they fail in
   a `blob:` worker under an opaque origin). Then:
   `new Worker(URL.createObjectURL(new Blob([source], {type:'text/javascript'})))`.

Residual risks are the same as the rest of the model: it can't stop an authorized
clinician from reading/exporting what an applet legitimately shows, and it assumes
the FHIR server enforces scopes. But no applet — third-party, marketplace, or
LLM-generated five minutes ago — can exfiltrate the token or call home. That is
precisely what makes "clinicians run any applet safely" defensible.

### Containment vs. provenance (for *fully untrusted* code)

Containment here is **capability/origin-based, not source-based** — it does not
require trusting the code. So the model's strongest claim is that even arbitrary,
untrusted code stays contained. The hash/allowlist controls above are about
**provenance** (knowing *what* you ran), not containment (limiting what it *can*
do); drop them and the containment guarantees still hold. Two hard rules make this
real: **the wrapper fetches the source but must never `eval`/`Function()` it
itself** (it only hands the text to a blob *worker*, so untrusted code never runs
in the trusted context), and the self-contained-classic-script requirement means
anything that's an ES module / has imports / is HTML simply **fails closed** in
the worker — no safety loss.

Once the source is untrusted, the **broker becomes the real attack surface** — so
that's where to add controls:
- **Capability abuse within scope.** The applet can't exfiltrate over the network,
  but could try to launder data *through* a granted capability (encode it into a
  FHIR write, or into an `llmComplete` prompt sent to a logged/third-party model).
  Defenses: read-only by default, per-applet scope limiting, broker quotas/rate
  limits, and treating each LLM destination as part of the trust boundary.
- **Resource abuse / DoS.** It's already off the main thread; add an execution
  timeout and terminate the worker on overrun.
- **UI redress / deception.** It renders to the clinician via Remote DOM and can
  display misleading content within its pane. The wrapper owns the real DOM and
  component catalog, so frame/label applet output as untrusted.
- Browser zero-day / authorized clinician copying shown data — unchanged.

## 3. Library / embedded

A single, otherwise-normal app vendors the runtime to sandbox **one risky
surface** — e.g. an LLM-generated chart panel, a third-party widget — inside an
app it otherwise trusts. Here the runtime is a dependency, the host app provides
the broker, and only the risky component runs in the worker. Use this when the
unit of distribution is the app, not the platform. It's a valid shape, but it
puts the security burden back on each embedding app, so prefer pattern 1 when the
goal is organization-wide safe experimentation.

## Choosing

| Goal | Pattern |
|---|---|
| "Let our clinicians build/experiment safely" | 1 (+ 3 for late binding) |
| "Run marketplace / third-party / LLM-written applets" | 2 |
| "Sandbox one risky panel inside my existing app" | 3 |
