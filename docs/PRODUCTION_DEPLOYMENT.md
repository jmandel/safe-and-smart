# Production assurance & deployment

This document is the Phase-7 companion to `SECURITY_CLAIMS_AND_ASSUMPTIONS.md`. It
defines the supported deployment configurations and the operational processes a
health system needs to run the wrapper for real PHI, and it ties every security
claim to an exact, reproducible release artifact.

## 1. Reproducible release artifact (the gate)

`bun run release` builds the single-origin Pages variant and emits
`dist/RELEASE_MANIFEST.json`, which records:

- `schemaVersion` / `protocolVersion` — the Safe DOM surface and wire protocol.
- `dependencies` — exact pinned versions of the runtime TCB libraries.
- `tcbSources` — SHA-256 of each trusted-computing-base source file (the host
  validators + brokered capability boundary that a reviewer must audit).
- `artifacts` — SHA-256 of every built file actually served.

A reviewer reproduces a claim by: (1) checking out the tagged commit, (2) running
`bun install --frozen-lockfile && bun run release`, (3) confirming the manifest
hashes match the deployed files, and (4) auditing the named `tcbSources`. The
`verify` CI workflow runs the same unit + browser hostile-applet suite on every
push, so the claims are enforced continuously, not just asserted.

## 2. Supported deployment configurations

The isolation model is identical across configurations (opaque-origin
`sandbox=allow-scripts` iframe → classic blob worker → Safe DOM mutation firewall);
what differs is the strength of the network boundary around the trusted wrapper.

| Config | Wrapper / sandbox origin | CSP delivery | Egress | Use |
| --- | --- | --- | --- | --- |
| **A — Demo (GitHub Pages)** | single origin | `<meta>` only (Pages can't set headers) | applet has none (CSP-blocked); wrapper calls open FHIR | public demo, no PHI |
| **B — Production PHI** | **two registrable domains** (wrapper vs sandbox) | **server-set response headers** (HSTS, COOP/COEP, frame-ancestors, CSP) + meta | wrapper traffic through a **managed egress proxy** allowlisting the FHIR/LLM hosts | real launches |

Config B requirements:
- Wrapper and sandbox on **different registrable domains** so site-isolation puts
  them in separate processes (defense-in-depth against renderer compromise).
- All CSPs and framing controls delivered as **response headers** (not only meta),
  including `Content-Security-Policy`, `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Embedder-Policy`, and `frame-ancestors`.
- A **managed egress proxy** on the wrapper origin: the wrapper's FHIR/LLM calls
  exit only to an explicit host allowlist, so even a wrapper-side mistake cannot
  reach an arbitrary destination. (The applet already has no ambient network.)

## 3. Browser support matrix

Supported: current Chromium/Edge and Firefox; current Safari. The security model
relies only on widely-supported primitives (`sandbox` iframes, dedicated workers,
CSP `connect-src`, structured clone). A **managed production browser profile**
(pinned Chromium/Edge channel) is recommended for clinical workstations; other
engines are supported on a best-effort, regression-tested basis. The `verify`
workflow runs the red-team corpus on pinned Chromium; extend the matrix by adding
Playwright projects for Firefox/WebKit.

## 4. Dependency pinning & upgrade gates

- Runtime dependencies are pinned to exact versions in `package.json`;
  `bun install --frozen-lockfile` is used everywhere (CI + deploy).
- Upgrade gate: a dependency bump must pass `bun run verify` **and** the browser
  red-team (`bun run test:redteam`) before merge. Bumps to TCB libraries
  (`@remote-dom/*`, `vega-*`, `zod`, `fhirclient`) additionally require a manual
  re-audit of the affected validator/broker and a refreshed `RELEASE_MANIFEST`.

## 5. Applet signing & publisher identity (Config B)

The demo derives applet identity from the host-fetched artifact hash
(`load-applet.ts`); containment never depends on it. For production catalogs:

- Publishers sign the applet bundle; the wrapper verifies the signature and pins
  the **content hash** in a catalog manifest before load.
- The audit log records `publisher` + `sha256` per session, so any rendered applet
  is attributable to a signed, hash-pinned artifact.
- Revocation (see §6) removes a hash/publisher from the catalog; the wrapper
  refuses to load a non-allowlisted hash in Config B.

## 6. Security incident & revocation procedures

- **Detect:** the broker emits a structured audit event for every capability call
  and every host-side violation (`mutation.*`, denied FHIR, schema violations).
  Ship these to SIEM; alert on violation spikes or unexpected FHIR scopes. The
  independent canary harness is the offline analogue.
- **Contain:** the error boundary + mutation gateway already cut off a misbehaving
  applet without taking down the shell. Operators can additionally revoke a hash.
- **Revoke:** remove the offending applet hash/publisher from the catalog allowlist
  (Config B); in Config A, remove the artifact from the served origin. Rotate the
  SMART client secret if a wrapper-side credential is suspected.
- **Disclose:** record the artifact hash + TCB versions from `RELEASE_MANIFEST` in
  the incident report so the exact code path is reproducible.

## 7. Operational metrics & anomaly detection

- Per-session: capability-call counts/latency, mutation volume vs budget, FHIR
  byte budget usage, audit `outcome` distribution.
- Anomalies to alert on: any `outcome: denied` from the mutation firewall or FHIR
  broker, schema violations, mutation-budget cut-offs, repeated worker restarts.
- These derive from the existing in-shell audit stream; production wiring forwards
  them to the health system's monitoring stack.

## 8. Independent penetration testing

`SECURITY_CLAIMS_AND_ASSUMPTIONS.md` §4 is the verification checklist and §2 the
properties to attack. Engage an independent tester against a Config-B deployment of
a tagged release; new findings become hostile cases in `tests/security/hostile/`
(the corpus only grows). The red-team harness must remain **ALL CONTAINED** at
release.
