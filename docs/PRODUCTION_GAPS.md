# Production gaps and hard decisions

The repository is a technical spike. These items must be resolved before real PHI.

## 1. Real SMART launch

Wire `createSmartFhirTransport()` into the trusted shell and test against each target EHR. Confirm:

- launch and standalone modes;
- public-client PKCE behavior;
- refresh token storage and expiry;
- CORS and private network access;
- scope formats supported by the EHR;
- patient/user/encounter context;
- logout and patient-switch revocation;
- FHIR R4/R4B differences;
- Binary/DocumentReference handling.

Never serialize `client.state` into the applet protocol.

## 2. LLM BAA implementation

The deterministic mock must be replaced by an approved adapter. Contract, tenant, exact product features, retention, training, abuse monitoring, subprocessors, region, and logging must be verified. “The provider signs a BAA” is not enough if the selected feature or account is outside its covered-service terms.

Decide whether direct browser calls are permitted. Many providers require a confidential API key that should not be embedded in a browser. In that case use a hospital-controlled relay that performs only model transport and approved tools; it must not execute applet code.

## 3. Runtime watchdog

A worker can monopolize its own thread indefinitely. Add:

- heartbeat from applet worker;
- host wall-clock timeout;
- FHIR/LLM request cancellation on teardown;
- mutation and message budgets;
- memory-warning heuristics where browser APIs allow;
- kill and restart UI;
- deterministic cleanup tests.

## 4. Protocol hardening

Add:

- generated protocol schemas and version negotiation;
- maximum structured-clone bytes/depth/count;
- request IDs, deadlines, cancellation, and idempotency;
- bounded callback registry with retain/release telemetry;
- typed error codes with redaction;
- exact applet bundle hash in handshake;
- capability revocation state;
- protection against prototype-pollution keys.

Review `@quilted/threads` as trusted code and consider a smaller internal protocol if its flexibility exceeds product needs.

## 5. Renderer maturity

The illustrative component catalog is not enough for a platform. Build a versioned SDK with:

- virtualized grids and timelines;
- accessible overlays and focus management;
- safe note/document rendering;
- forms and validation;
- robust Vega event/signal API;
- canvas/scene graph as needed;
- host-mediated print/export;
- internationalization and units;
- design-system theming;
- property and event schemas generated on both sides.

Fuzz every component with malformed values and large payloads.

## 6. Vega policy

The current recursive sanitizer is deliberately simple. Production work includes:

- a fail-closed custom Vega loader;
- review of expression functions and transforms;
- wall-time/row/mark budgets;
- disabling all URL, image, hyperlink, editor, source, export, and external locale paths unless mediated;
- incremental data and signal APIs;
- trusted export workflow;
- regression tests against each Vega update.

## 7. Browser and endpoint control

The strongest claim depends on a supported deployment profile:

- managed browser versions;
- extension allowlist or extension-free application mode;
- outbound network allowlist/proxy;
- rapid browser patching;
- disabled developer tools where institutionally appropriate, balanced against support needs;
- endpoint detection/logging configured not to capture PHI in URLs or page bodies;
- crash-reporting and telemetry review;
- kiosk/app mode where useful.

A browser extension can operate outside the assumptions of page CSP. This cannot be ignored.

## 8. Origin and hosting design

Use separate registrable domains for host and sandbox. The sandbox origin should:

- carry no cookies or credentials;
- serve immutable local assets only;
- have no dynamic logging of query parameters;
- send strict CSP, Permissions Policy, Referrer Policy, CORP/CORS headers;
- never share origin with ordinary applications;
- have an outbound identity that the network can deny Internet access;
- be penetration-tested for redirects and path reflection.

Evaluate COOP/COEP only if required for SharedArrayBuffer or advanced Wasm. Cross-origin isolation complicates embedding and should not be enabled casually.

## 9. In-browser compiler and package catalog

The current repository builds with Vite. A clinician authoring product needs the browser compiler described in `IN_BROWSER_AUTHORING.md`.

Decide:

- editor and language server;
- deterministic compiler version;
- virtual filesystem format;
- package admission and licensing;
- immutable catalog hosting;
- source-map policy;
- artifact signing/provenance;
- offline behavior;
- compatibility testing across runtime versions.

Never fetch arbitrary npm packages in a PHI-bearing session.

## 10. Governance

Even with no generic egress, hospitals will need:

- authenticated applet authorship;
- ownership and support contact;
- immutable versions and rollback;
- launch and usage inventory;
- privacy and clinical-safety classification;
- write-mode approval;
- protected-data overlays for 42 CFR Part 2 and local policy where applicable;
- incident response and emergency disable;
- user-visible indication of experimental status;
- validation requirements for algorithms used in care.

The platform can eliminate bespoke network/security review for many read-only applets. It cannot eliminate clinical safety, privacy purpose, and lifecycle governance.

## 11. Broad-access decision

The core proposition knowingly lets an applet read everything the active SMART grant permits. Confirm this with privacy and security leaders using explicit scenarios:

- clinician launches an unknown applet while viewing one patient;
- token scope permits other patients or organizational data;
- sensitive segmented records are returned;
- applet sends large portions of the record to an approved model;
- applet renders misleading conclusions;
- applet is abandoned but remains launchable.

Possible institutional overlays include patient-compartment enforcement, maximum lookback, sensitive-label prompts, model-input limits, and per-applet disclosure notices. These can be policies over the broad API rather than a different programming model.

## 12. Formal security review

Commission review of:

- URL parsing and redirects;
- worker/iframe CSP semantics across browsers;
- Remote DOM and event serialization;
- renderer injection and Vega expressions;
- capability and token lifecycle;
- browser extensions and managed policy;
- covert channels and network instrumentation;
- dependency supply chain;
- threat claim and customer documentation.
