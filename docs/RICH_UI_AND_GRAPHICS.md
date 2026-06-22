# Rich UI and graphics strategy

## React is the applet language

The remote UI layer is not intended to be a static dashboard schema. Applets are normal React component trees running in a worker:

```tsx
export function App({clinical, context}) {
  const [metric, setMetric] = React.useState('height');
  const [observations, setObservations] = React.useState([]);

  React.useEffect(() => {
    clinical.fhirRequest({
      url: `Observation?patient=${context.patient.id}&_count=500`,
    }).then(setObservations);
  }, [clinical, context.patient.id]);

  return (
    <UI.Stack gap={16}>
      <UI.Select value={metric} onChange={setMetric} />
      <UI.Vega spec={buildSpec(observations, metric)} />
    </UI.Stack>
  );
}
```

React owns application composition, state, effects, calculations, and event handling. Remote DOM replaces only the final host-element layer.

## Component SDK scope

A credible platform needs a broad, versioned SDK. Suggested categories:

### Layout and navigation

- stack, inline, grid, split pane, resizable pane;
- tabs, accordion, breadcrumb, stepper, command palette;
- scroll area, virtual list, sticky regions;
- host-owned modal, drawer, popover, tooltip, and menu portals.

### Inputs

- text, number, date/time, date range;
- select, autocomplete, combobox, multiselect;
- slider, checkbox, radio group, switch;
- clinical code search and unit-aware numeric entry;
- file/document handles supplied by the broker, never arbitrary local paths.

### Data presentation

- virtualized data grid with sorting/filtering;
- timeline, problem list, medication list, result cards;
- tree and graph views;
- safe note/document viewer with match highlighting;
- status, alert, badge, progress, skeleton, empty state;
- print/export mediated by trusted shell policy.

### Graphics

- Vega/Vega-Lite;
- host D3 adapters where needed;
- canvas scene graph;
- optional transferable OffscreenCanvas;
- image layers sourced only from broker-issued handles;
- medical imaging integration as a separate high-governance component.

### Accessibility

- semantic headings and landmarks;
- keyboard and focus-management contracts;
- accessible names and descriptions;
- screen-reader status announcements;
- high-contrast and reduced-motion support from the host theme.

The host should publish Storybook-like documentation and TypeScript declarations, but the production applet should import only the compact runtime SDK.

## Remote DOM performance model

A React update causes reconciliation in the worker, followed by a stream of Remote DOM mutation records. Performance depends on:

- number of remote nodes changed;
- property payload size;
- event callback churn;
- structured clone costs;
- host React reconciliation and component cost;
- chart re-instantiation frequency.

Guidelines:

- keep high-volume tabular data in a host virtualized-grid component rather than thousands of remote row nodes;
- send arrays as one bounded property to specialized components when appropriate;
- keep transient pointer/animation state inside a host component if it updates at frame rate;
- debounce expensive chart specifications;
- expose imperative host methods for zoom, focus, selection, and incremental data append;
- use transferable `ArrayBuffer`s for large numeric data in a future binary channel;
- terminate stale callbacks and release Remote DOM references.

The spike intentionally sends a complete Vega spec for clarity. A production chart component can support `setData`, `append`, `setSignal`, and `resize` methods to avoid rebuilding the view.

## Recreating a SMART Growth Chart class of app

The original SMART Growth Chart advertises interactive graphs, chart auto-selection, multiple standards, annotations, percentile and bone-age estimates, comparison, gestation correction, velocity, table and parent views, and print formats. That complexity is a useful acceptance target.

A production implementation can divide responsibility as follows:

```text
Worker React app
  ├─ FHIR acquisition and normalization
  ├─ cohort/reference selection state
  ├─ percentile and velocity calculations
  ├─ view mode and animation state
  ├─ annotations and clinician interactions
  └─ Vega spec / scene commands

Trusted host components
  ├─ responsive layout and controls
  ├─ Vega runtime and canvas
  ├─ high-frequency hover/zoom interactions
  ├─ accessible tooltip / detail portals
  ├─ print and export workflow
  └─ theme and EHR visual integration
```

This does not require direct DOM access in the applet. It does require richer host components than a basic table-and-chart toolkit.

## Vega-Lite first-class component

Recommended API evolution:

```ts
<Vega
  specification={spec}
  data={{observations: typedArrayOrRows}}
  signals={{selectedPopulation, maximumAge}}
  onSignal={(event) => ...}
  onSelection={(event) => ...}
  render="canvas"
  exportPolicy="clinician-confirmed"
/>
```

The host should:

- use an offline, pinned Vega runtime;
- reject all remote data and image URLs;
- install a loader that fails closed;
- disable editor/source/export actions by default;
- limit transforms, rows, expression length, and wall time;
- normalize event payloads;
- expose only approved expression functions;
- dispose views deterministically.

## Canvas and custom graphics

Some applications need lower-level drawing than Vega. Two options are compatible with the architecture.

### Host scene graph

The worker sends declarative draw objects or compact binary commands. The host owns canvas and interaction. This has the strongest control but requires a custom API.

### OffscreenCanvas

A trusted host component creates a canvas and transfers an `OffscreenCanvas` to a dedicated rendering worker. This supports familiar Canvas 2D or WebGL drawing at high performance. It should be a separate worker from the applet where practical, with a narrow command/data interface; transferring the canvas directly to arbitrary applet code expands its browser API surface but does not inherently provide network access.

Start with a host scene graph and Vega. Add OffscreenCanvas only after profiling shows a concrete need.

## DOM-library compatibility

Libraries fall into three groups:

1. **Pure computation:** D3 scales, shapes, arrays, statistics, date utilities. Usually work directly in the applet worker.
2. **React components built from ordinary elements:** require Remote DOM element mappings or a platform-specific adapter.
3. **Imperative DOM/CSS/canvas libraries:** must run inside a trusted host component or in the lower-assurance direct-iframe mode.

The platform package catalog should label compatibility and security tier. Do not promise that every npm React component works unchanged.

## Direct-DOM compatibility tier

For selected institutions, a second mode could run an ordinary ReactDOM app in a visible sandboxed iframe. It would provide nearly complete web compatibility but rely on:

- a browser/network egress allowlist, not CSP alone;
- a dedicated sandbox registrable domain;
- no credentials, cookies, storage, forms, popups, downloads, or parent DOM;
- brokered FHIR/LLM capabilities;
- stronger app admission and monitoring.

The UI SDK can be shared between modes so applets can target the safer worker mode first and opt into direct DOM only for a documented dependency.
