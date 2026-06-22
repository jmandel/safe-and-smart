# Clinical Browser Sandbox Spike

A runnable research spike for **browser-only clinical applets** that can use rich React application logic, broad clinician-scoped SMART on FHIR access, and approved LLM APIs without receiving bearer tokens or ordinary browser network authority.

The spike is deliberately centered on developer ergonomics:

- Applet logic is ordinary React with hooks, composition, events, timers, and state.
- The applet runs in a `DedicatedWorker` launched by a sandboxed, opaque-origin iframe.
- Shopify Remote DOM transports incremental UI mutations to a trusted React host.
- Vega-Lite is a first-class host-rendered component for dense, interactive clinical graphics.
- A broad `fhirRequest()` capability approximates use of the active clinician's SMART client. It is not constrained to a fixed FHIR profile or resource allowlist.
- The SMART access token and LLM credentials never cross into the applet runtime.
- Direct applet DOM access, ordinary network calls, and persistent origin storage are probed and expected to be unavailable.
- All clinical applet computation runs in the browser. The included Node process is only a two-origin static development server; it never executes applet code or sees clinical data.

The demonstration app is a synthetic pediatric-style growth explorer inspired by the interaction density of the original SMART Growth Chart. It supports React-driven controls, animated age filtering, alternate synthetic reference cohorts, a Vega-Lite chart, tabular observations, a mock protected LLM call, and a trusted-shell audit trail.

> **Safety:** Every patient record and growth reference curve in this repository is fabricated. This is an architecture experiment, not a clinical product or validated growth-chart implementation.

## Run the prebuilt spike

Requirements: Node.js 22 or newer and a current Chromium, Firefox, or Safari browser.

```bash
unzip clinical-browser-sandbox-spike.zip
cd clinical-browser-sandbox-spike
node tools/serve.mjs
```

Open `http://localhost:4173`.

The repository includes `dist/`, so the prebuilt demonstration does not require package installation. The static server creates two origins:

- Trusted shell: `http://localhost:4173`
- Opaque sandbox launcher: `http://127.0.0.1:4174`

Using different hostnames is intentional. A production deployment should use different registrable domains, not merely different subdomains.

## Develop the spike

```bash
npm ci
npm run start
```

Edit `src/applet/App.tsx` to try richer applet behavior. The build step is local tooling only; the resulting applet executes entirely in the browser.

Useful commands:

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

## Architecture at a glance

```text
Trusted EHR browser shell
  ├─ SMART client and token
  ├─ broad FHIR request broker
  ├─ approved LLM-profile broker
  ├─ audit / quotas / cancellation
  ├─ React host renderers
  └─ hidden sandboxed iframe: sandbox="allow-scripts"
       └─ inline Blob DedicatedWorker
            ├─ React 18 applet
            ├─ Remote DOM polyfill
            ├─ no real DOM
            ├─ CSP-blocked fetch / WebSocket / beacon
            ├─ no usable IndexedDB in opaque origin
            └─ MessagePort capabilities
                 ├─ fhirRequest(relativeUrl, options)
                 ├─ llmComplete(profile, messages, schema)
                 └─ audit(event)
```

The iframe is a launcher and policy boundary. The clinician-authored React application runs one layer deeper in the worker. Remote DOM gives that application a React-compatible virtual UI tree while the trusted shell owns the actual DOM and graphics libraries.

## Why this is not a thin JSON widget language

The applet is a real React program. It can use:

- hooks and component composition;
- local state machines and asynchronous effects;
- high-frequency interaction state;
- event callbacks crossing the Remote DOM protocol;
- arbitrary browser-side computation that does not require ambient browser APIs;
- first-class host components such as Vega-Lite, tables, controls, cards, timelines, and future canvas surfaces.

The security boundary is the **host component implementation**, not a static JSON document. Remote DOM serializes low-level tree mutations and event functions, which lets React retain its ordinary programming model. A production SDK would contain a substantially broader component set than this compact spike.

The main compatibility trade-off is that arbitrary React libraries that directly manipulate `window`, `document`, CSSOM, canvas, or portals need a host adapter. The documentation describes a two-tier model: Remote DOM as the high-assurance default, and a direct-DOM iframe mode only where a hospital also enforces hard browser/network egress controls and accepts a lower assurance level.

## Broad SMART capability

The core applet interface is intentionally token-equivalent rather than profile-specific:

```ts
const observations = await clinical.fhirRequest({
  url: `Observation?patient=${context.patient.id}&_count=500`,
});
```

The trusted shell performs the request through its live `fhirclient` instance. The broker:

- accepts relative URLs across the active FHIR base;
- relies on the clinician's SMART scopes and the FHIR server for semantic authorization;
- never returns the OAuth bearer token;
- strips caller-supplied authorization, cookie, origin, and host headers;
- rejects absolute destinations and FHIR-base path traversal;
- applies time and response-size budgets;
- records a metadata-only audit event;
- defaults to read-only in this spike, with a single explicit switch for token-equivalent writes.

This is broad enough to support exploratory clinical applications while preserving the most important separation: the applet can ask the shell to exercise the clinician's FHIR authority, but cannot extract or repurpose that credential for another destination.

## What the spike validates

1. Rich React application logic can run off the main thread without a real DOM.
2. Host-rendered custom components can support interactive controls, tables, and Vega-Lite graphics.
3. Callable capabilities can cross a dedicated `MessagePort` using `@quilted/threads`.
4. The FHIR broker can remain broad without exposing a raw token or a generic network primitive.
5. CSP, iframe sandboxing, opaque-origin storage behavior, and the worker boundary provide complementary controls.
6. The host can retain a complete capability audit without logging returned clinical bodies.

## What it does not prove

- It is not a formal proof of non-exfiltration.
- It does not defend against a compromised browser, kernel, hospital endpoint, trusted-shell dependency, malicious extension with sufficient permissions, or a browser zero-day.
- It cannot stop an authorized clinician from seeing, copying, photographing, or manually disclosing displayed information.
- The current renderer catalog is illustrative, not complete.
- The mock LLM does not establish BAA coverage; a production deployment must bind each model profile to a covered service, tenant, retention policy, region, and tool configuration.
- The bundled growth curves are synthetic and clinically meaningless.
- The end-to-end Playwright test is included but could not be executed in the build environment used to assemble this ZIP because its system Chromium was governed by an enterprise `URLBlocklist: ["*"]` policy. Unit tests, type checking, and the production build passed. See `docs/VALIDATION.md`.

## Repository map

```text
src/host/                  trusted React shell, capability broker, renderers
src/sandbox/               opaque iframe bootstrap
src/applet/                worker-resident React applet and growth demo
src/shared/                typed protocol and compact FHIR types
tests/                     unit and browser attack/behavior tests
tools/serve.mjs            two-origin static development server
docs/                      research, architecture, threat model, and plans
manifests/                  example applet manifest
examples/                   small applet authoring examples
dist/                       prebuilt browser assets
```

## Recommended reading order

1. `docs/EXECUTIVE_RECOMMENDATION.md`
2. `docs/ARCHITECTURE.md`
3. `docs/SOFTWARE_EVALUATION.md`
4. `docs/THREAT_MODEL.md`
5. `docs/FHIR_AND_LLM_CAPABILITIES.md`
6. `docs/RICH_UI_AND_GRAPHICS.md`
7. `docs/SPIKE_PLAN.md`
8. `docs/PRODUCTION_GAPS.md`

## Research basis

The primary implementation direction is based on Shopify Remote DOM, whose stated purpose is to let a sandboxed JavaScript environment create a tree that is rendered in a different environment; its repository includes worker support and examples for React, Preact, Svelte, and Vue. SMART `fhirclient` supplies browser SMART launch and authenticated FHIR requests with token refresh. Vega-Embed supplies the graphics host, with its export/source/editor actions disabled and external data loading rejected. Browser sandbox, CSP, and worker behavior are documented in the linked references.

See `docs/REFERENCES.md` for the source list and access date.

## License

The spike source is provided under the Apache License 2.0. Third-party dependencies retain their own licenses.
