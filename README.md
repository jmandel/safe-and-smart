# safe-and-smart

**One trusted wrapper that does the SMART-on-FHIR launch once and safely runs many
interchangeable applets inside it** — so a health system can enable a single
wrapper and let clinicians build, install, or experiment with applets (including
third-party or LLM-written ones) without any of them being able to leak the token,
call home, or touch storage. Safety is a property of the wrapper, not a promise
each app has to keep.

> Live demo: **https://joshuamandel.com/safe-and-smart/**
>
> All data is synthetic (SMART sandbox / fabricated). This is an architecture
> demonstration, not a clinical product.

## The idea

Most "SMART on FHIR app" designs hand each app the clinician's OAuth token and
full browser network authority, then trust it. This inverts that: the wrapper
holds the token and hands the applet a single **`session`** of brokered
capabilities — `session.smart` (FHIR), `session.ai` (the model), `session.styles`,
`session.audit` — never the token, never raw `fetch`. Every capability reaches only a
fixed trusted origin; none lets the applet pick a URL to fetch. See
[docs/APPLET_API.md](docs/APPLET_API.md).

Each applet is **untrusted code by construction**, contained in an opaque-origin
iframe → DedicatedWorker:

- no token, no network (CSP `connect-src 'none'`), no DOM, no storage;
- it's a **real React app** (hooks, state, your libraries) rendered via Shopify
  **Remote DOM** — not a JSON widget DSL;
- it can therefore be loaded from anywhere, even a URL at runtime, and still stay
  contained.

```
Trusted wrapper (real origin, has token)
  ├─ SMART client + OAuth token            never leaves this tier
  ├─ handler registry → session.smart / ai / styles / files / audit
  ├─ host-rendered components (React, Vega-Lite, tables…)
  └─ opaque <iframe sandbox="allow-scripts">      ← policy boundary
        └─ DedicatedWorker (classic blob worker)   ← the applet
             ├─ real React + your libs (Zustand, …)
             ├─ no DOM / no fetch / no storage
             └─ talks to the wrapper only over a MessagePort
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the model: containment stack,
  Remote DOM, the handler registry, the two-CSP design.
- [docs/APPLET_API.md](docs/APPLET_API.md) — the `session.*` surface for applet
  authors (+ components and events).
- [docs/HOST_API.md](docs/HOST_API.md) — the wrapper's capability registry and how
  to add a capability.
- [docs/WRAPPER_CONFIG.md](docs/WRAPPER_CONFIG.md) — the wrapper's chrome
  configuration (header/picker/audit) and presets.
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) — boundaries, the CSS/CSP guarantee,
  the attachment model.
- [docs/SECURITY_CLAIMS_AND_ASSUMPTIONS.md](docs/SECURITY_CLAIMS_AND_ASSUMPTIONS.md)
  — claims to attack + the reproduction harness.
- [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md) — two-domain
  deployment, signing, incident/revocation. ([archive/](docs/archive/) holds
  superseded planning notes.)

## What's in here

- A **landing page** (`/`) with distinct wrapper entry points: **`/run`**
  (open-endpoint demo; `/run?applet=<url>` for a custom applet) and **`/fhir`**
  (real SMART standalone launch).
- Two applets in different domains, behind a picker, equally sandboxed:
  - **Growth Explorer** — React + Zustand + Vega-Lite growth chart.
  - **Medication Reconciliation** — sends the structured med list + notes to an
    LLM (via an OpenAI-compatible bridge) which reconciles them and proposes
    clinician review actions.
- A **real SMART standalone launch** (`/fhir`) against the SMART App Launcher,
  plus an open-endpoint demo mode (no login).
- **Runtime URL-loaded applets**: a standalone bun/ts/react app compiled to one
  classic bundle, hosted anywhere, loaded via `?applet=<url>`.
- Bundled with **Bun** (`build.ts`, no Vite). Deploys to **GitHub Pages**.

## Run locally

```bash
bun install
bun run build.ts          # or: bun run start  (build + serve)
node tools/serve.mjs      # wrapper http://localhost:4173 · sandbox http://127.0.0.1:4174
```

Open http://localhost:4173. The two origins are intentional — a production
deployment should use different registrable domains.

```bash
bun run typecheck
bun test tests/*.test.ts
```

## Deploy to GitHub Pages

`.github/workflows/deploy.yml` builds the single-origin variant and deploys on
push to `main`. Enable Pages → Source: **GitHub Actions**. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the single-origin isolation details
(launcher CSP moves to a `<meta>` tag; Pages' `ACAO: *` lets the opaque iframe
load its launcher).

## Building applets / new wrappers

The [`skills/clinical-sandbox-applet/`](skills/clinical-sandbox-applet/) directory
is an AI Skill (SKILL.md + references + a scaffold script) that teaches the
architecture, the build invariants, the capability model, and how to author
standalone or URL-loaded applets. It is the distilled, reusable version of
everything in this repo.

## What this does and does not defend

Defends against an applet exfiltrating the token, making arbitrary network calls,
persisting tracking data, or reaching the wrapper's DOM/storage. Does **not**
defend against a compromised browser/OS, a malicious wrapper dependency, a browser
zero-day, or an authorized clinician copying displayed data; and the FHIR server
remains the authorization authority. See `SECURITY.md` and the threat model in
`docs/`.

## License

Apache-2.0. Third-party dependencies retain their own licenses.
