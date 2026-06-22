# Capabilities: using and extending the broker

The applet receives a `clinical` object with three async methods. They are the
*only* way out of the sandbox. All are validated (zod) and audited by the wrapper.

## `fhirRequest({url, init?})`

Broad, token-equivalent FHIR access. `url` is **relative** to the active FHIR
base; the wrapper performs the authenticated request and returns the parsed body.

```ts
const bundle = await clinical.fhirRequest({
  url: `Observation?patient=${context.patient.id}&category=vital-signs&_count=500`,
});
```

The broker (wrapper side): strips `authorization`/`cookie`/`origin`/`host`
headers, rejects absolute URLs and base-path escapes, enforces time and
response-size budgets, defaults to read-only (one explicit switch enables
token-equivalent writes), and records a metadata-only audit event (never the
body). It deliberately does **not** enforce a resource allowlist — the
clinician's SMART scopes and the FHIR server are the authorization boundary.

## LLM access — two layers

**Low-level capability:** `llmComplete({profile, messages, responseSchema?})` —
approved LLM access by **profile name**, never a raw endpoint or key. The wrapper
binds the profile to a covered model/tenant/retention policy and returns the
completion (`{text, data?, usage}`; `data` carries structured output when a
`responseSchema` was requested). In the reference impl this is a deterministic
stub; a production wrapper swaps in a real adapter behind the same interface.
Default to the latest Claude models (e.g. Opus 4.8 / Sonnet 4.6) for a real adapter.

**Ergonomic layer (recommended for applet authors):** the applet runtime installs
an **OpenAI-compatible bridge**. Applets call the familiar HTTP shape against a
sentinel base, and the runtime routes it over the MessagePort to `llmComplete` —
no API key, no real network ever exists in the applet:

```ts
// plain fetch — exactly the wire shape the openai client uses
const r = await fetch('https://llm.internal/v1/chat/completions', {
  method: 'POST', headers: {'content-type': 'application/json'},
  body: JSON.stringify({
    model: 'baa-clinical-summary-demo',         // "model" == approved profile
    response_format: {type: 'json_schema', json_schema: {name: 'out', schema}},
    messages: [{role: 'system', content}, {role: 'user', content}],
  }),
});
const {choices} = await r.json();
const data = JSON.parse(choices[0].message.content); // JSON mode → structured

// or the real OpenAI JS client, unchanged:
//   new OpenAI({ baseURL: 'https://llm.internal/v1', apiKey: 'sandbox',
//               dangerouslyAllowBrowser: true })
```

The bridge maps OpenAI `messages`/`response_format` → `llmComplete`, and the
broker's structured `data` → the assistant message content (JSON mode). This is
how applets get clean, well-known LLM ergonomics while the wrapper keeps the key
and governs the destination. The med-reconciliation applet (below) uses this path;
the worked code is `src/applet/runtime.tsx` (`installLlmBridge`).

### Worked example: a second applet (different domain)

`src/applet/med-recon/` is a medication-reconciliation applet — a different
clinical domain in the **same wrapper**, proving the platform thesis. It pulls the
live structured med list (`fhirRequest` → MedicationRequest), assembles recent
notes, and hands **both to the model** via the OpenAI bridge; the **model** does
the extraction + reconciliation and returns structured discrepancies + proposed
clinician actions (Accept-for-review / Dismiss, each audited). The applet itself
does none of the reconciliation logic — that lives in the model (a deterministic
stand-in in the reference broker). The wrapper ships a small **applet picker**
(`REGISTRY` in `src/host/App.tsx`) that switches between this and the growth
applet; both build via `bun run build.ts` and run with
identical isolation.

## `audit(event)`

Append a metadata-only event to the wrapper's audit trail (shown on screen). Use
it for lifecycle/application events; the broker also auto-audits every capability
call with timing.

## Using third-party libraries in the applet

The worker is real JS + React 18, so **pure libraries work unchanged**: state
(Zustand, Redux, XState, Jotai), logic (date-fns, lodash-es, zod), immutability
(immer). They have no DOM/network/storage dependency.

Worked example — Zustand (as in the reference impl):
```ts
// growth-store.ts — a normal store, running inside the worker
import {create} from 'zustand';
export const useView = create((set) => ({
  metric: 'height',
  setMetric: (metric) => set({metric}),
}));
// in the applet: const metric = useView((s) => s.metric);  // selector subscription
```
No extra steps. Re-renders flow through Remote DOM to the wrapper exactly like any
other state change.

**Caveats** (anything touching ambient browser APIs needs help):
- Zustand `persist` / Redux-persist default to `localStorage`/IndexedDB →
  unavailable in the opaque worker. Back persistence with a host capability (e.g.
  store state in a FHIR resource via `fhirRequest`, or add a brokered KV method).
- `devtools` middleware no-ops without the extension global — harmless.
- Libraries that touch `window`/`document`/CSSOM/`canvas`/portals (charting that
  renders to a real canvas, focus-trap, react-dnd HTML5 backend) need a **host
  component** instead — see below.

## Adding a host-rendered component (extends what applets can express)

The wrapper's component catalog *is* the security surface for UI. To give applets
a new capability (say, a timeline), you: (1) define a Remote DOM custom element
the applet imports, and (2) implement the real React component in the wrapper and
register it in the component map. Heavy/native rendering (Vega-Lite, canvas,
maps) lives in the wrapper component; the applet only sends props/data through
the serialized tree. Read the reference impl's `src/applet/remote-elements.tsx`
(applet side) and `src/host/components/remote-components.tsx` + `vega-sanitizer.ts`
(wrapper side) for the exact pattern, including how the Vega host component
disables export/source/editor actions and rejects external data loading.

## Wiring a real SMART launch (wrapper does this once, for itself)

The reference impl ships a `createSmartFhirTransport()` sketch using `fhirclient`.
The shape:
```ts
import FHIR from 'fhirclient';
const client = await FHIR.oauth2.ready();   // standard SMART browser launch
// Build a transport whose request() calls client.request(relativeUrl, ...).
// The token stays inside this closure; the applet only ever gets fhirRequest().
```
Swap the broker's mock/live transport for this in the wrapper. The applet code
does not change at all — it still calls `fhirRequest()` with relative URLs. That
invariance ("wire the token once in the wrapper, every applet benefits, none sees
it") is the whole platform value.
