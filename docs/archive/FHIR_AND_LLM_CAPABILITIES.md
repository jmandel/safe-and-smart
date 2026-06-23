# FHIR and LLM capability design

## Broad FHIR access without a bearer token

The user's requirement is best represented as a **SMART-client capability** rather than a set of resource-specific capabilities.

```ts
interface ClinicalClient {
  request(input: {
    url: string;                 // relative to active FHIR base
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    body?: unknown;
    page?: {
      limit?: number;
      flatten?: boolean;
    };
    response?: 'json' | 'text' | 'arrayBuffer';
  }): Promise<unknown>;
}
```

The practical authority is close to giving the applet the clinician's SMART token, but the credential itself remains non-transferable.

## Why not expose the raw token

A raw bearer token creates an unnecessary capability multiplication:

- it can be copied into logs or error messages;
- it can be sent to a different origin;
- it can be retained after the applet session;
- it can be used by an applet dependency without the host observing the request;
- its audience, scope, and expiry become visible to code that does not need them;
- a refresh token would be even more damaging.

A request proxy preserves useful operations while keeping destination binding, audit, and revocation in the shell.

## Request semantics

A production broker should support the useful breadth of `fhirclient.request()`:

- arbitrary relative resource and operation URLs;
- search parameters and `_include` / `_revinclude`;
- history and versioned reads;
- paging with explicit page/byte limits;
- optional reference resolution;
- FHIR JSON, text, and binary responses with separate policies;
- conditional creates/updates and transactions when write mode is enabled;
- abort signals and deadlines;
- ETag / `If-Match` for safe writes;
- response headers needed for paging and concurrency, but never authorization headers.

Do not silently rewrite every request into a patient-scoped request if the product promise is “all data this clinician's SMART grant can access.” Instead, make patient-compartment restriction an explicit launch policy that the institution can select.

## Destination binding

The spike requires relative URLs. The trusted shell resolves them against the active `serverUrl` and verifies both origin and base path. It never accepts a caller-selected hostname.

FHIR references returned in resources may contain absolute URLs. The SDK should provide a helper that resolves a reference only when it is inside the active FHIR base or an institutionally approved related endpoint. It must not turn returned references into a generic fetch facility.

## Read and write modes

The spike defaults to `GET` only because write-back changes the clinical safety and governance profile, not because the architecture cannot support writes.

Recommended launch modes:

```text
read-all-granted       Any read/search allowed by SMART token
write-all-granted      Any method allowed by SMART token, with full audit
confirm-write          Applet proposes a write; trusted shell shows diff and asks clinician
restricted-write       Only selected FHIR operations/resources
```

For clinician-built experimental applets, `confirm-write` is a strong compromise. The applet can generate sophisticated transactions, but the trusted shell owns the final commit and presents the exact target resources.

## Context and revocation

The applet should receive context values for usability:

```ts
{
  user: { id, display, practitioner },
  patient: { id, display },
  encounter: { id },
  fhirBaseUrl,
  grantedScopes,
  applet: { id, version }
}
```

These values are informative, not authorization proof. Every broker call must be associated with the live host session. When patient, encounter, user, SMART token, or applet version changes, the shell should terminate the worker and mint a new channel rather than trying to mutate authority in place.

## Auditing without duplicating PHI

Record:

- time, user, patient/encounter session handle;
- applet ID, exact bundle hash, and version;
- method, resource/operation path, and names of search parameters;
- request/response byte counts and duration;
- result status and denial reason;
- write resource types and identifiers;
- LLM profile, model, token counts, and tool operations.

Do not put full FHIR query values, resources, prompts, or model outputs in routine application logs. Some search values and paths may themselves contain PHI. Use a protected clinical audit store for the limited events that must retain content.

## LLM capability

The applet interface should be provider-independent:

```ts
const result = await clinical.llmComplete({
  profile: 'longitudinal-note-analysis-v4',
  messages: [...],
  responseSchema: {...},
});
```

A profile binds all security-relevant provider choices:

- covered provider, product, account, and BAA status;
- model and allowed version policy;
- region and data residency;
- retention, training, abuse-monitoring, and human-review settings;
- prompt caching behavior;
- allowed file/vector/thread persistence;
- maximum input and output;
- approved tools;
- logging and trace policy;
- whether provider-hosted code execution is disabled.

The applet never supplies a provider URL, API key, arbitrary tool server, remote MCP endpoint, or web-search destination.

## Browser-only requirement

There are two deployment interpretations:

1. **Strict direct-browser transport:** the trusted shell calls the FHIR and model endpoints directly using CORS. All computation and transport originate in the browser.
2. **Browser-only applet computation:** a hospital-controlled gateway may relay FHIR or LLM HTTP calls because of CORS, private networking, or credential policy, but it never executes applet code or performs applet-selected general computation.

The spike implements direct in-browser brokering with synthetic services. The architectural promise that matters is that clinician/LLM-generated application code is never uploaded for server execution.

## Handling large records

Broad SMART access can produce large resources. Avoid passing entire longitudinal charts into React state when a streaming pattern is possible.

Recommended API additions:

```ts
const query = await clinical.fhir.openQuery({...});
for await (const page of query.pages()) {
  // Incremental browser processing
}
await query.close();
```

Because asynchronous iterator proxies can complicate RPC, an initial implementation can use explicit handles:

```ts
const handle = await clinical.fhir.begin({url, pageSize: 200});
const page1 = await clinical.fhir.next(handle);
await clinical.fhir.cancel(handle);
```

The handle is scoped to the applet session and cannot designate an external resource.

## Free-text notes and local processing

Since all applet computation remains in the browser, a clinician applet can:

- retrieve document/note resources through broad FHIR calls;
- normalize and section them locally;
- search with literal, token, or bounded regex algorithms;
- build evidence sets for an LLM call;
- render matched passages with source references.

For untrusted or LLM-generated regex, use a linear-time engine compiled to WebAssembly or impose input/pattern/time limits. The native JavaScript regex engine can exhibit expensive backtracking on adversarial patterns.

PHI remains in browser memory. The application should clear references on patient switch and terminate the worker. Browser crash dumps, developer tools, endpoint telemetry, and source-map handling require hospital policy review.
