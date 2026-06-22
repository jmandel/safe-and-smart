# Applet API guide

## App component

The spike app receives three props:

```ts
interface AppProps {
  clinical: ClinicalCapabilityApi;
  context: ClinicalContext;
  securityProbe: SecurityProbeResult;
}
```

See `src/applet/App.tsx` for a complete example.

## FHIR

```tsx
React.useEffect(() => {
  let cancelled = false;

  clinical.fhirRequest({
    url: `Observation?patient=${encodeURIComponent(context.patient.id)}&_count=500`,
  }).then((bundle) => {
    if (!cancelled) setBundle(bundle);
  });

  return () => { cancelled = true; };
}, [clinical, context.patient.id]);
```

The URL is relative to the active FHIR base. Do not include authorization headers.

## LLM

```tsx
const response = await clinical.llmComplete({
  profile: 'baa-clinical-summary-demo',
  messages: [
    {
      role: 'system',
      content: 'Summarize the evidence and state uncertainty.',
    },
    {
      role: 'user',
      content: JSON.stringify(evidence),
    },
  ],
  responseSchema: {
    type: 'object',
    properties: {
      summary: {type: 'string'},
      evidenceIds: {type: 'array', items: {type: 'string'}},
    },
    required: ['summary', 'evidenceIds'],
  },
});
```

The spike returns plain text from a deterministic mock. A production profile should enforce the response schema in the trusted adapter.

## UI elements in the spike

```ts
Stack
Grid
Card
Heading
Text
Badge
Alert
Button
Select
Slider
Stat
Table
Vega
Code
```

These are React components backed by Remote DOM custom elements. Properties and event payloads are serialized; do not pass class instances, DOM nodes, cyclic objects, or very large values.

## Events

Remote events arrive as custom event-like objects. The spike uses:

```tsx
<Select
  value={metric}
  options={[...]}
  onChange={(event) => setMetric(event.detail.value)}
/>

<Button onPress={() => doSomething()}>
  Run
</Button>
```

A production SDK should wrap these details with strongly typed ergonomic callbacks such as `onValueChange(value)`.

## Vega

```tsx
<Vega
  spec={{
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: {values: rows},
    mark: {type: 'line', point: true},
    encoding: {
      x: {field: 'date', type: 'temporal'},
      y: {field: 'value', type: 'quantitative'},
    },
  }}
  ariaLabel="Longitudinal laboratory trend"
  minimumHeight={360}
/>
```

Use inline `data.values`. URL-backed data, images, hyperlinks, and external loaders are rejected.

## Audit

```ts
await clinical.audit({
  kind: 'application',
  message: 'Clinician switched to parent view',
  detail: {view: 'parent'},
});
```

Do not place PHI in the free-text message. Production SDKs should prefer structured event names and host-derived context.

## Programming constraints

Inside the worker:

- `window` and a real browser `document` are unavailable;
- the Remote DOM polyfill supplies enough DOM APIs for React and registered remote elements;
- direct network requests are blocked by CSP;
- persistent origin storage is expected to fail in the opaque-origin context;
- browser APIs that depend on actual DOM, navigation, CSSOM, or canvas are not portable;
- pure JavaScript computation and worker-compatible libraries are appropriate.

## Adding a host component

1. Define a `RemoteElement` in `src/applet/remote-elements.tsx` with explicit properties/events.
2. Create its applet React wrapper with `createRemoteComponent()`.
3. Add a host renderer in `src/host/components/remote-components.tsx`.
4. Validate, clamp, and copy every untrusted property.
5. Normalize event payloads before sending them back.
6. Add unit, hostile-payload, accessibility, and browser tests.
7. Document performance and compatibility limits.
