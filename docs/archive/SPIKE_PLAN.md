# Spike plan

## Purpose

Determine whether a browser-only Remote DOM runtime can support rich clinical applications while making silent programmatic exfiltration substantially harder than in an ordinary SMART app.

## Included proof of concept

The ZIP already implements the first vertical slice:

- two browser origins;
- opaque sandboxed iframe;
- inline Dedicated Worker;
- React and Remote DOM in worker;
- MessagePort RPC with `@quilted/threads`;
- broad relative FHIR capability and synthetic data;
- protected mock LLM capability;
- trusted React component catalog;
- Vega-Lite growth-style visualization;
- direct DOM/network/storage probes;
- trusted audit panel;
- unit and Playwright tests.

## Experiment 1: rich UI viability

### Build

Extend the demo until it matches a meaningful subset of SMART Growth Chart behavior:

- multiple metrics and reference populations;
- zoom, hover details, annotations, and comparison;
- animation across age/reference cohorts;
- table and parent-friendly views;
- printable host-mediated output;
- keyboard and screen-reader navigation.

### Measure

- first render and time to interactive;
- mutation count and serialized bytes;
- chart update latency;
- main-thread and worker CPU;
- memory after 30 minutes of interaction;
- callback and Remote DOM node retention;
- behavior at 100, 1,000, and 10,000 observations.

### Acceptance

- control interactions feel immediate on standard managed-clinic hardware;
- animation remains visually smooth or is moved into a host component;
- no unbounded mutation/callback growth;
- all test cases work without applet access to the real DOM.

## Experiment 2: broad FHIR behavior

Replace `MockFhirTransport` with `createSmartFhirTransport()` in a SMART development sandbox.

Test:

- arbitrary R4 resource searches;
- paging and `_include` / `_revinclude`;
- absolute references returned by resources;
- Binary and DocumentReference handling;
- large Bundle limits and cancellation;
- token refresh;
- EHR errors and OperationOutcome display;
- patient/encounter switch and worker revocation;
- optional writes with trusted confirmation.

Acceptance:

- any request permitted by the active SMART grant can be represented without exposing the token;
- destination binding cannot be bypassed by URL parsing tricks;
- all operations are attributable to exact applet/user/patient/version metadata;
- token and refresh state never appear in applet-visible values.

## Experiment 3: adversarial exfiltration

Run `docs/SECURITY_TEST_PLAN.md` in current Chrome, Edge, Firefox, and Safari on managed and unmanaged endpoints.

Add packet capture at the network boundary and verify that failed browser API calls do not create DNS, proxy, preconnect, reporting, or crash-telemetry disclosures containing test secrets.

Acceptance:

- no test secret reaches an unapproved endpoint;
- no applet-controlled value appears in sandbox static-server request paths or headers;
- extensions and browser policies are explicitly part of the supported deployment definition;
- browser-version regressions block release.

## Experiment 4: longitudinal notes

Build a note explorer entirely in the worker:

- retrieve realistic synthetic DocumentReference/Composition data;
- section and index locally;
- literal, token, and bounded regex search;
- 10,000-note stress case;
- selected evidence sent to mock/approved LLM;
- source-linked result display.

Measure memory, search latency, transfer cost, and cancellation.

Acceptance:

- interactive filtering is practical;
- the UI uses host virtualization rather than thousands of remote nodes;
- model calls are evidence-bounded and auditable;
- no note text enters ordinary logs.

## Experiment 5: in-browser authoring

Add Monaco or CodeMirror and `esbuild-wasm` as described in `IN_BROWSER_AUTHORING.md`.

Acceptance:

- edit/compile/reload occurs without uploading source for execution;
- only pinned offline packages resolve;
- worker replacement reliably clears old clinical state;
- the compiled artifact is deterministic and content-addressed;
- diagnostics are useful to a competent JavaScript developer;
- a clinician-informaticist can build a small app without platform-team intervention.

## Experiment 6: runtime robustness

Test:

- infinite loops and deliberate memory pressure;
- worker crash and browser tab suspension;
- mutation floods and event storms;
- malformed Remote DOM payloads;
- repeated model and FHIR calls;
- network and EHR timeouts;
- browser back/forward navigation;
- patient context changes during outstanding calls.

Acceptance:

- host detects an unresponsive applet and terminates it;
- capabilities are revoked immediately on teardown;
- applet restart does not retain PHI or callbacks;
- the trusted shell remains usable after failure.

## Suggested two-week technical spike

### Days 1–2

Run the included demo, review trust boundaries, connect to a non-PHI SMART sandbox, and instrument mutation/byte metrics.

### Days 3–5

Port one genuinely complex existing React visualization into the Remote DOM SDK. Record every incompatibility and required host component.

### Days 6–7

Implement note-search and virtualized-grid components; profile realistic synthetic data.

### Days 8–9

Execute the adversarial test suite with browser/network capture and add worker watchdogs.

### Day 10

Decision review using the scorecard below.

## Decision scorecard

| Dimension | Target |
|---|---|
| Developer experience | React/TypeScript feels familiar; ordinary hooks and composition work |
| UI coverage | Complex chart and longitudinal viewer need no unrestricted DOM |
| Performance | No material lag at realistic chart/note volumes |
| Credential isolation | Tokens and model keys never cross capability boundary |
| Egress control | No secret reaches unapproved destination in supported browsers |
| Operational fit | Static origins, CSP, browser policy, and audit fit hospital deployment |
| Maintenance | Trusted renderer/RPC dependency set is small enough to own |
| Governance | Low-risk read-only applets can be admitted automatically |

A “no” on Remote DOM compatibility does not invalidate the business idea. It would indicate that the direct-DOM compatibility tier plus network-level egress enforcement should become primary, with a correspondingly narrower security claim and stronger app governance.
