# Applet API — `session` + components

An applet is a sandboxed React component. It has **no ambient powers** — no network,
no DOM, no storage. Everything it can do arrives as a single prop, `session`, plus
the component set it renders with. This is the whole surface.

```tsx
import {runApplet} from './runtime';
import {Stack, Heading, Text, Button} from './remote-elements';

function App({session}) {
  return (
    <Stack gap={12}>
      <Heading level={2}>Hello, {session.smart.patient.display}</Heading>
      <Button onPress={() => session.audit({message: 'said hi'})}>Log</Button>
    </Stack>
  );
}

runApplet(App, {appletId: 'org.example.hello', appletVersion: '0.1.0'});
```

`session` is **one object with four namespaces** (each one a brokered host handler),
plus a worker-side isolation report:

| `session.*` | concern | also reachable as |
| --- | --- | --- |
| `session.smart` | SMART-on-FHIR launch context **and** scoped FHIR access | `fetch('https://fhir.internal/…')` |
| `session.ai` | the language model | `fetch('https://llm.internal/v1/…')` (OpenAI shape) |
| `session.styles` | install validated CSS for your surface | — |
| `session.audit` | write to the trusted audit log | — |
| `session.probe` | the worker's own sandbox self-test (read-only) | — |

Every capability reaches only a **fixed, trusted destination** (the FHIR server, the
model gateway). There is deliberately **no capability that lets the applet choose a
URL or origin** for the host to fetch — that would re-open the network egress the
sandbox exists to remove (an exfiltration channel). You read data from the trusted
origins and render bytes you already hold; you never hand the host an address to go
get.

---

## `session.smart` — context + FHIR

Mirrors a `fhirclient` SMART client: the launch context (data you read) and the
FHIR calls (scoped to the granted token, attached host-side) live on one object.

```ts
session.smart.patient      // { id, display }
session.smart.user         // { id, display, practitioner? }
session.smart.encounter    // { id } | undefined
session.smart.scopes       // string[]  — the authorization envelope
session.smart.fhirBaseUrl  // string

session.smart.search(type, params?)   // GET a search  → Bundle
session.smart.read(type, id)          // GET one resource
session.smart.request(url, init?)     // escape hatch: any relative FHIR URL
```

```tsx
const vitals = await session.smart.search('Observation', {
  patient: session.smart.patient.id,
  category: 'vital-signs',
  _count: 200,
});
const patient = await session.smart.read('Patient', session.smart.patient.id);
```

You never see a bearer token or an absolute server URL. The broker validates the
URL (relative-only, no traversal), attaches the token, enforces byte budgets, and
audits the call. Writes are off by default. **Bring your own client:** point
`fhirclient` at `https://fhir.internal/` and it works unchanged.

## `session.ai` — the model

OpenAI-compatible. `profile` (the `model` field) selects an approved, covered model
profile — there is no API key in the applet.

```tsx
// non-streaming, optional structured output
const res = await session.ai.complete({
  profile: 'clinical-summary',
  messages: [{role: 'user', content: JSON.stringify(evidence)}],
  responseSchema: {type: 'object', properties: {summary: {type: 'string'}}},
});

// streaming — deltas arrive through the callback
await session.ai.stream(
  {profile: 'summarizer', messages: [{role: 'user', content: '…'}]},
  (delta) => setText((t) => t + delta),
);
```

**Bring your own client:** the `openai` SDK pointed at `baseURL:
'https://llm.internal/v1'` works (including `stream: true`). A model profile may
invoke broker-side **tools** (e.g. a scoped FHIR read) and fold the result into the
answer — the applet never gets that access and the model can't reach beyond the
tool allowlist.

## `session.styles` — your own CSS

Express real design (grids, `@media`, `@keyframes`, gradients) beyond the component
props. You hand over CSS; the host validates it (no `url()`/scheme/`@import`/escape
hatch) and installs it **scoped to your ShadowRoot** — it cannot touch the wrapper
chrome. Reference your classes via `<Box className>` / `<Inline className>`.

```tsx
const css = `.grid { display:grid; gap:12px; }
@media (max-width:480px){ .grid{ grid-template-columns:1fr; } }`;
useEffect(() => { session.styles.add(css); }, []);
// …
<Box className="grid">…</Box>
```

`add()` resolves `{ok:false, error}` if the CSS is rejected (and the rejection is
audited) — never silently dropped.

## Showing documents — `<Image>`

Documents aren't a separate way to fetch. A FHIR document is a `Binary`/`Attachment`
you read like anything else with `session.smart`. The bytes are usually inline
(`Attachment.data`, base64) — once you have them, you display them yourself:

```tsx
// Data you already have → a self-contained data: URL. No fetch, nothing to leak.
const dataUrl = `data:${attachment.contentType};base64,${attachment.data}`;
<Image src={dataUrl} alt="Scanned note" />
```

`<Image src>` accepts **`data:` URLs only** — self-contained, so they make no
network request. A remote (`http(s)`) or relative src is rejected (that would be an
applet-controlled image source — the exfil vector the sandbox forbids).

There is **no `open this URL for me`** capability. Letting the applet name a URL for
the host to fetch (with the clinician's token) would be a confused-deputy /
exfiltration channel — the applet could point the host at an attacker origin, or
smuggle data out in the path. So the model is strictly: read bytes from the trusted
FHIR origin via `session.smart`, then render them. If an `Attachment.url` points at a
server the FHIR scope can't reach, it's out of scope — not something the wrapper
fetches on the applet's behalf.

## `session.audit` — accountability

Record a clinician action to the trusted, append-only log (production: forwarded to
the EHR audit/SIEM). The host already auto-audits every brokered call; this adds
your own semantic events. The applet can **write but not read** the log.

```ts
session.audit({
  code: 'applet.review-accepted',         // optional closed vocabulary
  message: `accepted reconciliation for ${med}`,  // bounded, sanitized
});
```

Only `message` is required — `code`, `detail`, and `kind` are optional (`kind`
defaults to `'application'`), so `session.audit({message: 'did X'})` is valid.

Do not put bulk PHI in `message`; prefer a `code` + minimal `detail`.

## `session.probe`

The worker's own isolation self-test, for display/diagnostics:

```ts
session.probe.directNetworkBlocked   // true — fetch() to the real network is dead
session.probe.directDomUnavailable
session.probe.persistentStorageBlocked
```

---

## Components

You render with a curated, host-rendered element set (not raw HTML — there is no DOM
in the worker, and raw tags would be exfiltration vectors). Two equivalent styles:

```tsx
// capitalized components (import or, in the playground, the `ui` global)
import {Stack, Card, Button, Input, Table, Vega, Svg, Image, Box} from './remote-elements';
<Stack gap={12}><Button onPress={fn}>Go</Button></Stack>

// or intrinsic JSX via @safe-smart/react (no imports)
<ui-stack gap={12}><ui-button onPress={fn}>Go</ui-button></ui-stack>
```

Layout/text: `Stack`, `Grid`, `Box`, `Inline`, `Card`, `Heading`, `Text`, `Badge`,
`Alert`, `Stat`, `Code`. Interactive: `Button`, `Select`, `Slider`, `Input`,
`Textarea`. Data/graphics: `Table`, `Vega`, `Svg`, `Image`. `Box`/`Inline` accept a
validated `style` object + `className`.

**Events** arrive as bounded, structured-clonable snapshots — no live DOM nodes, no
functions, capped strings:

```tsx
<Input label="Dose" onChange={(e) => setDose(e.detail.value)} onKeyDown={(e) => {
  if (e.detail.key === 'Enter') submit();
}} />
<Select options={opts} onChange={(e) => setX(e.detail.value)} />
<Button onPress={(e) => run()}>Run</Button>
```

`Vega` takes an inline-data Vega-Lite spec (URL-backed data, images, and external
loaders are rejected). `Svg` takes `markup` validated to a safe subset.

## Constraints

- No `window`/real `document`, no `fetch` to the real network, no persistent storage.
- Props and event payloads are structured-cloned — no class instances, DOM nodes,
  cyclic objects, or huge values across the boundary.
- Anything off the Safe DOM schema (unknown element, prop, attribute, or event) is
  rejected by the host mutation firewall and contained by the error boundary.

See **ARCHITECTURE.md** for how this is enforced and **HOST_API.md** for the
wrapper-side handler registry.
