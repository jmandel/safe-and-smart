# Full-pipeline plan: from validated infra to applets using the full capabilities

## STATUS — implemented (cores landed, each wired + demonstrated + guarded)
- **W1 styling** ✅ ui-box/ui-inline + validated style/className + registerStylesheet
  → ShadowRoot install. Demo: styled-vitals. Hostile: styled-exfil.
- **W2 SVG** ✅ ui-svg + sanitizeSvgMarkup. Demo: careplan-diagram. Hostile: svg-exfil.
- **W3 events/forms** ✅ ui-input/ui-textarea + keyboard/focus. Demo: order-entry-form.
  (Fixed two real latent bugs: event value-read + onKeydown naming.)
- **W4 multi-file+npm authoring** ✅ esbuild-wasm + esm.sh + CSS-as-text. Multi-file
  starter importing date-fns, compiled in-browser, run in sandbox.
- **W5 streaming LLM + tool** ✅ llmStream + SSE bridge + getLatestVitals tool. Demo:
  note-summarizer.
- **W6 chart a11y + perf** ✅ tooltips + tabular fallback (growth) + mutation stats.
- **W7 protected attachments** ✅ opaque handles + ui-image. Demo: document-viewer.
  Hostile: image-src-exfil.
- **W8 signed catalog** ✅ (core) ECDSA verify + content-hash pinning + 5 tests.
- **Capstone** ✅ encounter-cockpit composes CSS+FHIR+chart+streaming+tool+SVG+
  attachment in one applet. Red-team ALL CONTAINED (7 hostile); 72 unit tests pass.

Deferred items are noted per workstream below and in each commit (Monaco, IndexedDB
package cache, OffscreenCanvas/virtual-list, build-time catalog signing, two-domain
deploy, SIEM). The validators are no longer infra-only — every one is reachable and
exercised by a working applet.

## 0. Honest starting point

**Works end-to-end today:** opaque-iframe → blob-worker sandbox; Safe DOM mutation
firewall; `@safe-smart/react` intrinsic JSX; `fhir.internal` + `llm.internal` fetch
bridges; in-browser TSX compile-and-run; 4 running applets (growth, med-recon,
intrinsic-demo, fhir-bridge-demo).

**Built but NOT wired to any applet-reachable path (the real gap):**
`css-validator.ts`, `safe-svg-validator.ts`, the broader event-snapshot builders,
and most of Phase 4/6. An applet today cannot supply CSS, cannot render custom SVG,
cannot import npm packages, is single-file, and has no streaming LLM. The validators
guard doors that don't exist yet.

## 1. Operating principle for this plan

Every capability ships only when it satisfies **three gates**, in order:

1. **Wired** — a real ingestion path from applet source → worker → broker/host →
   validator → render. No capability counts as "done" while it's library-only.
2. **Demonstrated** — an *acceptance applet* uses it for a real clinical task and is
   added to the picker + landing page.
3. **Guarded** — at least one *hostile* applet in `tests/security/hostile/` tries to
   abuse the new path and is CONTAINED (zero canary hits), wired into the CI gate.

A workstream that can't show all three is not merged.

---

## 2. Workstreams

Each lists: objective · wiring (concrete files/changes) · schema/protocol delta ·
acceptance applet · hostile case · rough size.

### W1 — Author styling path (closes the Phase-3 gate)
**Objective:** applets express real CSS, validated + scoped, not just enumerated props.

**Wiring**
- Add a styleable primitive element **`ui-box`** (block) and **`ui-inline`** (span):
  renderers in `remote-components.tsx` that render a `<div>`/`<span>` and accept a
  **validated** `style` object + a `className` string.
- Schema (`safe-dom-schema.ts`): add `style: 'object'` and `className: 'string'` to
  `ui-box`/`ui-inline` (and, phase 2, to all elements).
- Firewall (`safe-dom-firewall.ts`): special-case the `style` prop → run
  `validateStyleObject()` (already built) on every `UPDATE_PROPERTY`/insert; reject
  on `CssViolation`. `className` → validate it's a bounded token list.
- **CSS Modules:** extend the in-browser compiler (`authoring/compile.ts`) and
  `build.ts` to extract `*.module.css`, run `validateStylesheet()` (already built),
  hash-scope class names, and emit `{css, classMap}` into the applet manifest.
- **Scoped install:** `ShadowSurface.tsx` already adopts stylesheets — add the
  applet's validated sheet to the shadow root's `adoptedStyleSheets` (scoped by the
  shadow boundary; no leakage to host chrome).

**Acceptance applet:** `styled-vitals` — a responsive, **animated** vitals dashboard
using CSS Modules (grid, `@media`/`@container`, `@keyframes`) — the literal Phase-3
gate sentence.

**Hostile case:** applet ships `background:url(...)`, `@import`, escaped `\75rl`,
and a `style={{behavior:...}}` → all rejected, zero canary, shell survives.

**Size:** M (the validators exist; this is wiring + 2 renderers + compiler step).

### W2 — Safe custom SVG element (closes Phase-4 SVG)
**Objective:** applets render custom diagrams/markup, sanitized.

**Wiring**
- Add **`ui-svg`** element with a `markup: 'string'` prop.
- Renderer parses markup with `DOMParser`, runs `validateSvgDocument()` (already
  built) on the tree, and renders the **re-serialized sanitized** SVG (reject →
  render nothing + audit). No raw author markup ever reaches the DOM unparsed.
- Schema + firewall: `ui-svg.markup` is a normal string prop; the *content* gate is
  the renderer's validator pass (host-side, trusted).

**Acceptance applet:** `careplan-diagram` — renders a small SVG care-pathway with
internal gradient refs.

**Hostile case:** `ui-svg` markup containing `<script>`, `onload`, external
`<image href>`, `foreignObject` → sanitized away, zero canary.

**Size:** S–M.

### W3 — Event/interaction breadth (closes Phase-2 remainder)
**Objective:** form-heavy apps with keyboard/pointer/focus, headless-lib-friendly.

**Wiring**
- Add elements/props for text input (**`ui-input`**, **`ui-textarea`**) with
  `value` + `change`/`input`/`focus`/`blur`/`keydown` events, each surfaced through
  the existing `safe-events.ts` builders (already cover keyboard/pointer/focus).
- Wire `composition` + `wheel` builders to the relevant renderers.
- Add **safe refs**: a host-mediated `focus()`/`select()`/`scrollIntoView()`
  capability keyed by element id (no node handles cross the boundary).

**Acceptance applet:** `order-entry-form` — multi-field form, full keyboard nav,
focus management, validation messages.

**Hostile case:** event payload tries to smuggle a DOM node / oversized string (the
`safe-events` test already proves the builder; add an end-to-end applet variant).

**Size:** M.

### W4 — Multi-file + npm authoring (closes the Phase-6 gate)
**Objective:** create/edit/compile/run a **multi-file TSX/CSS app importing real npm
packages**, entirely in-browser, same security model.

**Wiring**
- Replace the textarea with **Monaco** + the TS language service (real in-editor
  type-checking against `safe-dom-intrinsics.d.ts`).
- **esbuild-wasm build worker** for true bundling (multi-file + tree-shake), run in
  a worker; CSP gets `'wasm-unsafe-eval'` **on the `/author` page only** (the
  compiled applet still runs in the locked sandbox — authoring tool ≠ runtime).
- **Virtual FS** (in-memory file map) + **package cache**: resolve bare imports from
  a pinned CDN (esm.sh/jsdelivr) **with no lifecycle scripts**, cache in IndexedDB,
  pin by integrity hash. Bundle the fetched sources; never execute install scripts.
- Manifest generation: emit `{files, css, classMap, deps[], sha256}` per build.

**Acceptance applet:** authored in-browser, **multi-file**, importing a real package
(e.g. `date-fns`) + a `.module.css`, compiled and run live.

**Hostile case:** authored applet that, once compiled, attempts exfil/escape →
CONTAINED (proves "browser-authored ⇒ same hostile-app model"); plus a malicious
*dependency* in the cache → bundled but still sandboxed at runtime.

**Size:** L (the biggest workstream; esbuild-wasm + Monaco + FS + cache).

### W5 — LLM streaming + tool bridge (closes Phase-5 remainder)
**Objective:** streaming completions and model-invoked local tools.

**Wiring**
- Streaming transport: `llm.internal` bridge returns a streamed `Response`
  (`ReadableStream`/SSE) backed by an async-iterable over the MessagePort; broker
  forwards model deltas. Applet uses `for await` or the `openai` stream API.
- **Tool bridge:** a brokered, allowlisted tool registry (e.g. `searchMeds`,
  `getObservation`) the model can call; results validated before return. Tools are
  host-defined capabilities, never applet-arbitrary code.

**Acceptance applet:** `note-summarizer` — streams a structured summary token-by-token
and calls a `getObservation` tool mid-generation.

**Hostile case:** tool args attempt FHIR-scope escalation / oversized payloads →
rejected by the same broker guards.

**Size:** M.

### W6 — Graphics, perf, chart accessibility (closes Phase-4 gate)
**Objective:** the growth-chart acceptance app to its full bar.

**Wiring**
- Vega widget: tooltips, keyboard selection, resize via `ResizeObserver` snapshot,
  and an **accessible tabular fallback** (a `ui-table` rendered from the same data).
- **OffscreenCanvas** widget: transfer an OffscreenCanvas to the worker for
  applet-driven drawing, with pointer/keyboard/resize events bridged safely.
- **Virtual list** host widget for large datasets.
- **Perf/mutation instrumentation:** surface mutation counts, budget headroom, frame
  timing in the audit panel (the gateway already counts mutations).

**Acceptance applet:** upgrade `growth` to meet its gate sentence verbatim
(populations/sex/age/disease-state, selection, tooltips, resize, keyboard, tabular
fallback).

**Size:** M–L.

### W7 — Protected attachments + nav handles (Phase-5 tail)
**Objective:** display `Binary`/DocumentReference attachments without raw URLs/token.
**Wiring:** broker fetches the `Binary`, returns a **blob handle** (object URL minted
host-side, scoped, revocable); a `ui-image`/`ui-attachment` element renders it.
Navigation handles for `ui-link` go through a brokered, audited open. **Size:** M.

### W8 — Signing, catalog, two-domain deploy (Phase-7 tail)
**Objective:** production identity + deployment.
**Wiring:** publisher-signed bundles; wrapper verifies signature + pins content hash
from a catalog manifest; refuses non-allowlisted hashes (Config B). Stand up the
two-registrable-domain deployment with server-set headers + a managed egress proxy
(documented in `PRODUCTION_DEPLOYMENT.md`; this builds it). Forward the audit stream
to a metrics sink with anomaly alerts. **Size:** L (partly organizational).

---

## 3. Sequencing & milestones

Dependencies: W1 (style firewall + manifest) and W4 (compiler/manifest) share the
**applet manifest** format — define it once, early.

- **M1 — "Applets can look like real apps."** W1 (styling) + W3 (forms/events) +
  W2 (SVG). Capstone: a styled, interactive, diagram-bearing applet. *Biggest
  perceived-capability jump; all three validators get wired and demonstrated.*
- **M2 — "Anyone can build one in the browser."** W4 (Monaco + esbuild-wasm + npm +
  multi-file). Capstone: multi-file npm applet authored live.
- **M3 — "Frontier clinical UX."** W5 (streaming/tools) + W6 (graphics/a11y) + W7
  (attachments). Capstone: the showcase app below.
- **M4 — "Production."** W8 (signing/catalog/two-domain/metrics) + Firefox/WebKit
  CI projects + an external pen-test pass.

## 4. Capstone showcase applet (proves "full capabilities")

`encounter-cockpit` — one applet exercising everything:
- **Multi-file + npm** (W4): components split across files, imports a date lib.
- **CSS Modules** (W1): responsive, animated layout.
- **Forms/keyboard** (W3): order-entry with full keyboard nav.
- **FHIR bridge** (done): pulls problems/meds/vitals via `fhir.internal`.
- **Streaming LLM + tool** (W5): live note summarization that calls a FHIR tool.
- **Graphics + a11y** (W6): trend chart with tooltips + tabular fallback.
- **SVG** (W2): a care-pathway diagram.
- **Attachments** (W7): renders a scanned document via a brokered blob handle.

If `encounter-cockpit` runs under the unchanged sandbox + firewall and the hostile
corpus stays ALL CONTAINED, the pipeline is real — not infra.

## 5. Definition of done (per workstream)

- [ ] Ingestion path wired end-to-end (source → render), no library-only deliverables
- [ ] Acceptance applet in the picker + landing, rendering with zero console errors
- [ ] ≥1 hostile applet for the new path, CONTAINED in `redteam.mjs` + CI
- [ ] Unit tests for new host validators/branches; `bun run verify` green
- [ ] `RELEASE_MANIFEST` schema/protocol versions bumped; claims doc updated
