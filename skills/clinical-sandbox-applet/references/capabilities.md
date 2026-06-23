# Capabilities: using and extending the broker

The applet receives one `session` object whose namespaces — `session.smart`,
`session.ai`, `session.styles`, `session.audit` (plus the read-only
`session.probe`) — are the *only* way out of the sandbox. Each namespace is one
brokered host handler, validated (zod) and audited by the wrapper. (See
`docs/APPLET_API.md` for the full applet-facing surface; `docs/HOST_API.md` for
the wrapper-side handler registry.)

## `session.smart` — context + FHIR

Mirrors a `fhirclient` SMART client: the launch context (`patient`, `user`,
`encounter?`, `scopes`, `fhirBaseUrl`) and scoped FHIR access on one object. URLs
are **relative** to the active FHIR base; the wrapper performs the authenticated
request and returns the parsed body.

```ts
const bundle = await session.smart.search('Observation', {
  patient: session.smart.patient.id,
  category: 'vital-signs',
  _count: 500,
});
const patient = await session.smart.read('Patient', session.smart.patient.id);
// escape hatch for any relative FHIR URL + init:
const r = await session.smart.request('Encounter?patient=' + session.smart.patient.id);
```

The broker (wrapper side): strips `authorization`/`cookie`/`origin`/`host`
headers, rejects absolute URLs and base-path escapes, enforces time and
response-size budgets, defaults to read-only (one explicit switch enables
token-equivalent writes), and records a metadata-only audit event (never the
body). It deliberately does **not** enforce a resource allowlist — the
clinician's SMART scopes and the FHIR server are the authorization boundary.

## `session.ai` — the model

`session.ai.complete({profile, messages, responseSchema?})` and
`session.ai.stream(request, onToken)` — approved LLM access by **profile name**,
never a raw endpoint or key. The wrapper binds the profile to a covered
model/tenant/retention policy and returns the completion (`{text, data?, model,
profile, usage}`; `data` carries structured output when a `responseSchema` was
requested). In the reference impl this is a deterministic stub; a production
wrapper swaps in a real adapter behind the same interface.
Default to the latest Claude models (e.g. Opus 4.8 / Sonnet 4.6) for a real adapter.

**Ergonomic layer (recommended for applet authors):** the applet runtime installs
an **OpenAI-compatible bridge**. Applets call the familiar HTTP shape against a
sentinel base, and the runtime routes it over the MessagePort to `session.ai` —
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

The bridge maps OpenAI `messages`/`response_format` → `session.ai`, and the
broker's structured `data` → the assistant message content (JSON mode). This is
how applets get clean, well-known LLM ergonomics while the wrapper keeps the key
and governs the destination. The med-reconciliation applet (below) uses this path;
the worked code is `src/applet/runtime.tsx` (`installLlmBridge`).

### Worked example: a second applet (different domain)

`src/applet/med-recon/` is a medication-reconciliation applet — a different
clinical domain in the **same wrapper**, one of the ten built-ins, proving the
platform thesis. It pulls the live structured med list (`session.smart.search` →
MedicationRequest), assembles recent notes, and hands **both to the model** via
`session.ai` (or the OpenAI bridge); the **model** does the extraction +
reconciliation and returns structured discrepancies + proposed clinician actions
(Accept-for-review / Dismiss, each audited). The applet itself does none of the
reconciliation logic — that lives in the model (a deterministic stand-in in the
reference broker). The wrapper ships a **working applet picker** (`BUILTINS` in
`src/host/App.tsx`) that switches between all ten built-ins; each builds via
`bun run build.ts` and runs with identical isolation.

## `session.audit(event)`

Append a metadata-only event to the wrapper's audit trail (shown on screen). Use
it for lifecycle/application events; the broker also auto-audits every capability
call with timing.

## `session.styles` — install validated CSS

`session.styles.add(css)` installs a validated stylesheet scoped to the applet's
ShadowRoot (no `url()`/scheme/`@import`/escape-hatch). Reference the classes via
`<Box className>` / `<Inline className>`. It resolves `{ok:false, error}` (audited)
on rejection — never silently dropped.

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
  store state in a FHIR resource via `session.smart`, or add a brokered KV method).
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
// The token stays inside this closure; the applet only ever gets session.smart.
```
Swap the broker's mock/live transport for this in the wrapper. The applet code
does not change at all — it still calls `session.smart.search/read/request`. That
invariance ("wire the token once in the wrapper, every applet benefits, none sees
it") is the whole platform value.
