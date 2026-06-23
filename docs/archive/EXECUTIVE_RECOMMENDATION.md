# Executive recommendation

## Recommendation

Proceed with a focused product spike based on **React in a Dedicated Worker + Shopify Remote DOM + a trusted SMART/LLM shell**.

This is the best current compromise between the two goals that matter most:

1. **App developer freedom:** clinicians and informaticists write ordinary component-oriented JavaScript/TypeScript with React hooks, asynchronous FHIR calls, local computation, interactive charts, and reusable packages that do not require direct DOM access.
2. **Containment:** applet code has no bearer token, real DOM, normal network authority, persistent same-origin storage, or direct access to the parent page. All privileged activity crosses one typed and audited `MessagePort`.

The result should be marketed as a **capability-secured browser applet platform**, not as “an iframe makes arbitrary code perfectly safe.”

## Product shape

The trusted shell should be approved as a platform. Individual applets should be admitted mostly through automated checks and signed manifests. The default applet authority can be broad:

- the currently selected patient and encounter;
- the full FHIR operations permitted by the clinician's active SMART scopes;
- approved BAA-covered LLM profiles;
- a rich host UI SDK;
- bounded local browser computation.

Narrow data capabilities can remain available for particularly sensitive applets or institutions, but they do not need to be the universal programming model.

## Important distinction

Expose a **token-equivalent FHIR client**, not the token itself.

That API can support arbitrary relative FHIR requests and even write methods when enabled. It retains nearly all practical SMART application flexibility while preventing code from copying the bearer token, changing the destination, or attaching it to a covert channel.

## UI direction

Do not reduce applets to static JSON dashboards. Use React or Preact as the app programming model and Remote DOM as the transport. Expand the trusted component SDK to include:

- complete layout, typography, form, navigation, dialog, table, and accessibility primitives;
- a first-class Vega/Vega-Lite component;
- a high-performance canvas/scene-graph component with an optional `OffscreenCanvas` mode;
- virtualized tables and timelines;
- safe Markdown and clinical text viewers;
- image and document viewers that accept only broker-issued object handles;
- portals owned by the host for popovers, menus, tooltips, and modal workflows.

This is a rich UI runtime with an enforceable host surface, not a thin schema renderer.

## Modes worth considering

| Mode | Developer compatibility | Containment | Recommendation |
|---|---:|---:|---|
| Worker + Remote DOM | High for component applications; adapters needed for direct-DOM libraries | Highest practical browser-only option | Default |
| Direct React DOM in sandboxed iframe | Near-normal web compatibility | Lower because the applet controls navigation and DOM-triggered channels | Optional, higher-governance tier only |
| SES compartment in worker | Good for restricted code, but framework integration and resource termination are harder | Useful defense in depth | Evaluate after the worker spike |
| QuickJS-Wasm | Stronger JavaScript engine separation | Good, but React/browser package compatibility is substantially worse | Reserve for calculation plugins, not primary UI apps |
| WebContainers | Excellent browser IDE and Node tooling | Too broad and operationally heavy for the default clinical runtime | Consider only for an authoring workspace |

## Go/no-go gates for a larger pilot

Proceed beyond the spike only after all of these are demonstrated on managed hospital browsers:

- no network packets from the applet worker to unapproved destinations under the attack suite;
- no raw SMART or LLM credential appears in applet memory, logs, errors, source maps, or messages;
- a complex growth-chart-style app remains responsive with realistic observation volumes;
- a virtualized longitudinal note viewer performs acceptably;
- malicious Remote DOM payloads cannot create arbitrary HTML, CSS, URL loads, or host callbacks;
- the runtime can terminate runaway workers and recover cleanly;
- all applet FHIR and LLM operations produce useful metadata-only audit records;
- the hospital browser extension policy and outbound network policy are part of the deployment control set;
- external security review agrees with the bounded claim: prevention of silent programmatic exfiltration by ordinary applet code, not absolute prevention of every disclosure path.

## Bottom line

The architecture is plausible and materially safer than installing ordinary SMART apps with their own origins, credentials, dependencies, and network access. Remote DOM is the key enabling software because it preserves a real React programming experience while moving the actual DOM into the trusted shell.
