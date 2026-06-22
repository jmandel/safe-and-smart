# Decision log

## D-001 — Browser-only applet execution

**Decision:** all clinician-authored and LLM-generated applet code executes in a browser worker. No server-side applet code execution is included.

**Reason:** matches the product premise, keeps PHI computation local, and avoids operating a multi-tenant code-execution service.

**Qualification:** a hospital relay may still transport FHIR or LLM HTTP requests where direct browser CORS/credential handling is impractical. It must not execute applet code.

## D-002 — Broad SMART-client capability

**Decision:** expose arbitrary relative FHIR requests within the active SMART server base rather than a fixed resource/profile API.

**Reason:** preserves the flexibility expected by SMART application developers and supports unforeseen clinical apps.

**Control:** do not expose the raw token; bind destination, strip credential headers, budget, audit, and make write mode explicit.

## D-003 — React + Remote DOM as primary UI model

**Decision:** use React in the worker and Remote DOM to render trusted host components.

**Reason:** preserves a proper virtual-DOM programming model while withholding the real DOM and its many URL/navigation surfaces.

**Trade-off:** arbitrary DOM-dependent React packages need adapters.

## D-004 — Vega-Lite in trusted host

**Decision:** make Vega/Vega-Lite a first-class remote component, but execute the Vega runtime in the trusted host.

**Reason:** supports rich clinical charting and high-performance canvas rendering while keeping external loading and export/editor functions under host control.

## D-005 — Worker inside sandboxed iframe

**Decision:** use both boundaries.

**Reason:** the iframe provides opaque-origin and sandbox/CSP policy; the worker provides no real DOM, off-main-thread execution, and hard termination. A worker alone would still have broad browser APIs, and an iframe alone would still expose a full document.

## D-006 — No `allow-same-origin`

**Decision:** omit it.

**Reason:** makes the sandbox an opaque origin and prevents ordinary cookie/local-storage access.

**Trade-off:** the host must use a source/nonce-bound MessagePort handshake rather than relying on a stable child origin for messages.

## D-007 — `@quilted/threads` for spike RPC

**Decision:** use Threads because it pairs naturally with Remote DOM and preserves callable event/capability objects.

**Follow-up:** review whether a smaller internal protocol is preferable for production trust minimization.

## D-008 — Read-only default, not read-only architecture

**Decision:** spike defaults to GET, with `allowWrites` as one policy switch.

**Reason:** write-back has separate clinical-safety implications. The broad API should still be able to support writes under an explicit mode or host confirmation flow.

## D-009 — In-browser compiler is next increment

**Decision:** document `esbuild-wasm` architecture but keep it out of the first runtime slice.

**Reason:** first validate isolation, Remote DOM compatibility, and performance. Then add a browser editor/compiler with a pinned offline package catalog.

## D-010 — Direct DOM is a separate compatibility tier

**Decision:** do not make ordinary iframe React the strongest/default mode.

**Reason:** a real document has a large and evolving set of navigation/resource surfaces. It can still be offered where network-level egress controls and higher governance compensate for lower runtime containment.
