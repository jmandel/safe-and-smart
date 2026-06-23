# Existing software evaluation

Research date: 2026-06-21.

## Recommended stack

| Layer | Software | Why it fits | Important caveat |
|---|---|---|---|
| Rich app framework | React 18 or Preact | Familiar component model, hooks, mature ecosystem, good clinician-developer ergonomics | DOM-dependent libraries need host adapters in worker mode |
| Remote UI transport | Shopify Remote DOM | Designed to create a DOM-like tree in a sandbox and render it elsewhere; includes worker polyfill and React/Preact/Svelte/Vue examples | Host must maintain a component catalog and review serialization limits |
| RPC | `@quilted/threads` | Handles functions, nested capabilities, events, and MessagePort transports; explicitly used by Remote DOM examples | Protocol still needs schema validation, quotas, and lifecycle rules |
| SMART client | `fhirclient` | Browser SMART launch, patient/user context, authenticated FHIR requests, paging, and token refresh | Keep its client object and state entirely in the trusted shell |
| Charts | Vega, Vega-Lite, `vega-embed` | Rich grammar, layered charts, transforms, interaction signals, canvas/SVG rendering | Disable actions and remote loaders; sanitize URL-bearing properties |
| Schemas | Zod in spike; JSON Schema/Ajv also suitable | Runtime validation and TypeScript inference | Validation must be paired with byte/depth budgets before expensive processing |
| Build | Vite for repository; `esbuild-wasm` for future in-browser authoring | Vite handles worker/iframe entries; esbuild officially supports its API in a browser Web Worker | Browser authoring needs a pinned virtual package filesystem and no online dependency resolver |
| Optional language hardening | Endo SES | `lockdown()` freezes intrinsics and Compartments expose only endowed globals | Not a resource-isolation boundary; runaway code still requires a worker that can be terminated |

## Shopify Remote DOM

**Assessment: primary choice.**

Remote DOM directly addresses the unusual requirement: let potentially untrusted code use a DOM-like programming model in an iframe or worker while the trusted environment controls the real elements. Its repository states that it can isolate code off the main thread, offers a minimal DOM polyfill for workers, and includes “kitchen sink” examples implemented with React, Preact, Svelte, Vue, and vanilla JavaScript.

Why it is better than a hand-built JSON renderer:

- React reconciliation remains in the applet.
- State and event handlers are normal functions.
- Mutations are incremental rather than whole-document JSON replacements.
- Custom elements can carry properties, events, and methods.
- The host can map one applet element to an arbitrarily sophisticated React implementation.
- Framework choice can broaden later without changing the host protocol.

Questions to validate in the pilot:

- mutation throughput with 10,000-row virtualized tables;
- callback retention and release under long sessions;
- large Vega specification/property transfer costs;
- event latency under simultaneous FHIR processing;
- behavior with React error boundaries and suspended components;
- accessibility and focus transfer for modal/portal components;
- compatibility with future React releases.

## `@quilted/threads`, Comlink, and raw MessageChannel

`@quilted/threads` is the best fit for this spike because Remote DOM's own examples use it for function properties and methods. It supports RPC objects that contain callable values, which is useful for both the clinical API and UI events.

Comlink is a mature alternative for making workers easier to use. It is attractive for plain capability calls, but Remote DOM already has a natural pairing with Threads. A raw MessageChannel plus JSON-RPC would minimize dependencies and maximize protocol control, but would require implementing function identity, event callback lifetime, cancellation, and structured error semantics.

Recommendation: use Threads for the spike, then decide whether to retain it or replace it with a deliberately small internal RPC protocol after measuring the trusted-code and supply-chain implications.

## React, Preact, Svelte, and Vue

Remote DOM does not force one remote framework. React is the right initial developer experience because:

- clinicians and health-IT developers are likely to encounter it already;
- hooks make FHIR request state and interactive filtering straightforward;
- TypeScript tooling is excellent;
- the platform can publish an opinionated `@clinical-applet/sdk` component package.

Preact may be an attractive production default for smaller startup and memory cost. Svelte and Vue can be supported as alternate compile targets once the host component protocol stabilizes.

The host and applet do not have to use the same framework.

## SMART `fhirclient`

`fhirclient` supports browser SMART authorization and a `client.request()` API that automatically refreshes the access token. It can request arbitrary resource URLs and supports paging and reference resolution.

The correct use here is not to put `fhirclient` inside the applet. Instead:

1. the trusted shell calls `FHIR.oauth2.ready()`;
2. it retains the returned client and token state;
3. it exposes a relative `fhirRequest()` method over MessagePort;
4. it calls `client.request()` on behalf of the applet;
5. the applet sees FHIR bodies but never client state or authorization headers.

This preserves broad SMART behavior with a much smaller credential-exfiltration surface.

## Vega and Vega-Lite

Vega-Lite is particularly suitable for clinical visualizations because it supports layered and faceted graphics, transformations, selections, scales, and declarative encodings. The original SMART Growth Chart demonstrates that clinical apps may require considerably more than a basic line chart: alternate reference populations, annotations, comparison, velocity, print views, and interaction.

The host should expose both:

- a high-level `Vega` component for most charts;
- a lower-level canvas or scene component for applications that cannot be expressed comfortably in Vega.

Vega-Embed exposes export, source, compiled-spec, and editor actions. Those are useful in ordinary apps but create unnecessary disclosure/navigation surfaces here, so the host disables them. A custom loader should reject any external URL even after the static sanitizer.

## Browser-side authoring and compilation

### `esbuild-wasm`

**Recommended for the next spike increment.**

The official esbuild API can run in the browser using WebAssembly in a Web Worker. That supports a browser-only editor/compile loop without a build service. The platform should not permit arbitrary package downloads at compile time. Instead it should provide:

- a virtual file system;
- a curated, version-pinned package catalog;
- local type declarations;
- an import resolver that rejects URLs and undeclared packages;
- deterministic bundle hashes;
- a compilation worker with CPU/time limits;
- applet reload by terminating and replacing the execution worker.

The first authoring version can support TSX plus a small pinned SDK. Later versions can add selected pure-JavaScript packages, D3 modules, date libraries, and tested clinical utilities.

### Sandpack

Sandpack offers a polished component toolkit for browser coding experiences and is powered by CodeSandbox's online bundler by default. It is excellent inspiration for editor, preview, console, and error UX. It is not the default runtime choice here because a PHI-sensitive deployment should not depend on an external online bundler. Sandpack documents options around hosting the bundler and local dependencies, so parts of it could still be evaluated for a trusted authoring workspace.

### WebContainers

WebContainers run Node.js applications and operating-system-style commands entirely in a browser tab. They are compelling for a full browser IDE with npm, Vite, tests, and familiar toolchains.

They are broader than needed for the execution runtime, increase startup and compatibility complexity, and may require cross-origin isolation and licensing review. They could be useful as an **authoring environment** that produces a sealed applet bundle, but the resulting applet should still run in the smaller Remote DOM worker runtime.

## SES / Endo

SES provides `lockdown()`, `harden()`, and Compartments. Its documentation explains that lockdown freezes shared JavaScript intrinsics and that Compartments control which powerful globals client code receives.

Useful roles:

- prevent applet code from poisoning shared prototypes in a worker runtime;
- evaluate smaller clinician formulas or plugins with explicit endowments;
- strengthen a browser compiler/plugin subsystem.

Limitations:

- a Compartment alone does not stop infinite loops or memory exhaustion;
- it does not remove powerful ambient objects from an enclosing worker unless the host carefully controls globals;
- framework and module packaging requires deliberate integration;
- the worker boundary remains necessary for hard termination.

Recommendation: evaluate SES inside the worker as defense in depth after the basic Remote DOM architecture is stable, not as a replacement for iframe/worker/CSP isolation.

## QuickJS-Wasm

QuickJS compiled to WebAssembly can execute JavaScript in a separate engine with explicit host functions and memory/runtime controls. It is attractive for formulas, transformation scripts, and LLM-generated calculation code.

It is not the leading UI-app choice because ordinary React and browser package ecosystems expect a browser JavaScript realm, workers, timers, and module tooling. Recreating enough of that environment inside QuickJS would sacrifice the developer ergonomics central to this product.

A hybrid may be valuable later:

- React/Remote DOM worker for the app;
- an embedded QuickJS instance for especially untrusted generated snippets;
- only pure-data input and output between them.

## Pyodide

Pyodide makes Python and many scientific packages available in the browser and can run in a worker. It is valuable for statistical extensions. However, Python can access JavaScript objects through `JsProxy`, so simply putting Pyodide in a worker does not automatically remove the worker's Web APIs. Package loading also creates an asset and supply-chain challenge.

Treat Pyodide as an optional language runtime inside the already CSP-constrained worker, with a fixed offline package set and no direct JavaScript global bridge exposed to user code unless carefully wrapped.

## Partytown and WorkerDOM

Partytown is optimized for relocating third-party scripts off the main thread while forwarding selected DOM operations. Its primary use case is analytics and third-party scripts, not a general untrusted application platform with a typed host component SDK.

AMP WorkerDOM pioneered running DOM code in workers and mutating the main DOM, but Remote DOM is a more direct and currently maintained match for this architecture and provides explicit framework integrations.

## Direct iframe React mode

An ordinary React application inside a sandboxed iframe has the best compatibility. CSP can block most resource loads and the sandbox can remove forms, popups, downloads, top navigation, cookies, and storage.

The problem is that code controlling a real document retains many complex browser behaviors, including self-navigation and future/obscure URL-bearing DOM surfaces. Browser CSP is not a complete navigation policy. Therefore this mode should rely on independent network controls such as a managed browser and outbound proxy that allows only the shell and sandbox static origins.

Use it only as a separately labeled compatibility tier, not as the basis of the strongest security claim.

## Conclusion

The recommended first stack is intentionally conventional:

```text
React + Remote DOM + Dedicated Worker + MessagePort
+ trusted fhirclient broker + trusted Vega host
```

It is the smallest combination found that offers both a credible isolation story and an application model capable of recreating dense, interactive SMART applications.
