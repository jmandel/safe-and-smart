# Host API — the capability registry

The wrapper side of the contract. Where the applet sees `session.*`, the wrapper sees
a **registry of capability handlers**: one trusted implementation per concern, each
the single enforcement point for its capability. The applet-facing typed SDK and the
`*.internal` fetch facade are both thin views over these handlers.

## The broker is the registry

`ClinicalBroker` (`src/host/broker/clinical-broker.ts`) holds the SMART context + FHIR
transport and exposes one private handler per concern:

```ts
#fhirRequest({url, init})        // validate (relative-only, no traversal), scope,
                                 // attach token, enforce byte budget, audit, dispatch
#llmComplete(req) / #llmStream(req, onToken)  // model + broker-side tool allowlist
#registerStylesheet(css)         // CSS validate → ShadowRoot-scoped install
#audit(event)                    // schema-validate + sanitize → trusted log
```

Every handler reaches only a fixed trusted origin (the FHIR server, the model
gateway). There is deliberately no "fetch an applet-supplied URL" handler — that
would let the applet pick the request origin and re-open the egress channel the
sandbox removes. Documents are read as bytes via `#fhirRequest` and rendered with
`<Image src="data:…">` (the firewall rejects any non-`data:` image src).

`buildSession()` composes those handlers into the namespaced object the handshake
returns:

```ts
buildSession(): HostCapabilities {
  return {
    smart: {
      patient, user, encounter, scopes, fhirBaseUrl,
      request: (url, init) => this.#fhirRequest({url, init}),
      search:  (type, p)   => this.#fhirRequest({url: buildFhirUrl(type, p)}),
      read:    (type, id)  => this.#fhirRequest({url: `${type}/${encodeURIComponent(id)}`}),
    },
    ai:     {complete: this.#llmComplete, stream: this.#llmStream},
    styles: {add: this.#registerStylesheet},
    audit:  this.#audit,
  };
}
```

## The handshake returns the API shape

`App.tsx`'s `connect()` returns `{remoteConnection, capabilities: broker.buildSession()}`.
`@quilted/threads` serializes that nested object by walking it — **functions become
MessagePort proxies at any depth, data is structured-cloned** — so `session.smart.read`
is a live proxied call and `session.smart.patient` is a snapshot. The applet runtime
attaches the worker-side `probe` to form the full `Session`. There is no separate
`context` object and no flat `clinical` bag: the wire shape equals the API shape.

## The two views funnel into one handler

- **Typed SDK** — `session.smart.search('Observation', {…})` builds the relative URL
  host-side and calls `#fhirRequest`.
- **Fetch facade** — the worker's `fetch` shim recognizes `https://<name>.internal/…`
  and routes it to the matching session handler (`fhir.internal → smart.request`,
  `llm.internal → ai`), so `fhirclient`/`openai` work unchanged.

Both paths reach the **same** `#fhirRequest` / `#llm*` handler, so URL validation,
scope checks, byte budgets, and audit are written once. There is no second code path
to keep in sync — the property the registry buys you.

## Adding a capability

1. Implement a private handler on the broker (`#x = async (input) => { validate;
   enforce; audit; return }`). Validate untrusted input with a zod schema in
   `protocol.ts`.
2. Add its namespace to `buildSession()` (`x: {do: this.#x}`) and its type to
   `Session`/`HostCapabilities` in `protocol.ts`.
3. (Optional) If it has a drop-in client ecosystem, give it an HTTP shape and route
   `https://x.internal/` to it in the runtime fetch shim.
4. If it renders, add a vetted component + a Safe DOM schema entry; the mutation
   firewall enforces it.
5. Add a hostile red-team case for the new path (`tests/security/hostile/*.entry.tsx`)
   and assert zero canary hits.

## Enforcement lives in the handlers

| Handler | Enforces |
| --- | --- |
| `#fhirRequest` | relative-URL only, no traversal/encoded separators, request-header allowlist, redirect rejection, response byte budget, read-only by default, bounded paging, per-call audit |
| `#llmComplete` / `#llmStream` | approved profile, message bounds, broker-side tool allowlist (the model never gets raw capabilities) |
| `#registerStylesheet` | CSS validator (no url/scheme/@import/escape-hatch), ShadowRoot-scoped install |
| `#audit` | closed code vocabulary, control-char-stripped + length-capped message, append-only |

Plus the always-on host-side firewall around the render path (mutation gateway +
Safe DOM firewall) and the CSP families described in **ARCHITECTURE.md**.
