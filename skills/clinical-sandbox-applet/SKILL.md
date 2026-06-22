---
name: clinical-sandbox-applet
description: >-
  Build and host browser-only clinical "applets" that get rich SMART-on-FHIR data
  access and approved LLM access WITHOUT ever holding the OAuth token, network
  authority, or DOM. The model is one trusted wrapper that does the SMART launch
  once and safely runs many interchangeable, equally-sandboxed applets inside it —
  so a hospital CIO can enable a single wrapper and let clinicians experiment
  freely but safely. Use this skill whenever the user wants to: build a SMART on
  FHIR app or dashboard; run untrusted, third-party, or LLM-generated UI code that
  still needs patient data; sandbox/isolate a web app so it can't exfiltrate a
  token or phone home; create a clinician-facing applet platform or "app store";
  add another applet to such a wrapper; or load applet code dynamically from a URL
  safely. Reach for this even if the user just says "let clinicians build their
  own tools safely," "I have an LLM that writes patient-facing widgets," or "I
  need a SMART app but I don't trust the app with the token."
---

# Clinical Sandbox Applet Platform

## The one idea

Most "SMART on FHIR app" designs hand each app the clinician's OAuth bearer token
and full browser network authority, then trust the app not to misuse them. That
trust has to be re-established for **every** app, and it does not survive
third-party code, marketplace apps, or LLM-generated UI.

This architecture inverts that. There is **one trusted wrapper** (the "shell" /
runtime). The wrapper:

- performs the SMART App Launch **once, for itself**, and holds the token;
- exposes a small set of **brokered capabilities** to applets — `fhirRequest()`,
  `llmComplete()`, `audit()` — never the token, never raw `fetch`;
- runs each applet as **untrusted code** inside a hard sandbox (opaque-origin
  iframe → DedicatedWorker → no DOM, no network, no storage);
- lets you pick which applet to run, and makes adding another applet trivial
  because **every applet is equally contained by construction.**

The pitch to a health-system CISO/CIO is: *"Enable this one wrapper, and
clinicians can build, install, or experiment with any applet — including ones
written by an LLM five minutes ago — and none of them can leak the token, call
home, or touch storage. Safety is a property of the wrapper, not a promise each
app has to keep."*

Because applets are untrusted **by design**, the wrapper can safely run applet
code from anywhere — bundled, user-authored, or fetched from a URL at runtime.
That late-binding is a feature of the model, not a hole in it.

**This skill ships INSIDE its reference implementation** (the repo root, two
levels up from this file at `skills/clinical-sandbox-applet/`). That repo is the
source of truth — read its files when you need exact, current code. It is bundled
with **Bun** (`build.ts`, no Vite), serves two applets (Growth Explorer + Med
Reconciliation) behind an applet picker, supports a real SMART standalone launch,
and deploys to GitHub Pages. This skill teaches the model behind it and how to
build new applets and new wrappers without re-discovering the sharp edges.

## How safety is achieved (the trust tiers)

```
Trusted wrapper (real origin, has token)          ← you write/own this once
  ├─ SMART client + OAuth token                    never leaves this tier
  ├─ capability broker: fhirRequest / llmComplete / audit
  ├─ host-rendered component catalog (React, Vega-Lite, tables, …)
  └─ opaque-origin <iframe sandbox="allow-scripts">  ← policy boundary
        └─ DedicatedWorker (classic blob worker)      ← the applet lives here
             ├─ real React app (hooks, state, your libs)
             ├─ NO real DOM, NO fetch/WebSocket (CSP connect-src 'none')
             ├─ NO usable storage (opaque origin)
             └─ talks to the wrapper only over a MessagePort
```

The applet is a **real React program** — it just renders through Shopify
**Remote DOM** (it builds a virtual UI tree; the trusted wrapper owns the actual
DOM and heavy components like Vega-Lite). So applet authors keep normal
ergonomics (components, hooks, state libraries, async) while the security
boundary stays in the wrapper's component implementations, not in a brittle JSON
DSL.

Read `references/architecture.md` for the message flow and why each boundary
exists.

## When you're asked to do something, figure out which job it is

1. **Add an applet to an existing wrapper** (most common). The wrapper and its
   safety are done; you're writing a React applet against the capability API.
   Go to "Building an applet" below. You almost never touch security here — that's
   the point.
2. **Stand up a new wrapper / platform** (e.g., a different EHR, a demo, a new
   product). Use `scripts/new-project.sh` to scaffold, then wire the real SMART
   launch. Read `references/build-and-gotchas.md` BEFORE building — the build
   configuration is security- and correctness-critical and has non-obvious
   requirements.
3. **Enable dynamic / URL-loaded applets** (late binding, an applet "store").
   The reference impl **implements this**: a standalone bun/ts/react/zustand app
   compiled to a classic bundle, hosted anywhere, loaded at runtime via
   `?applet=<url>`. Read `references/standalone-applets.md` for the SDK contract,
   the Bun build, hosting/CORS (incl. GitHub Pages), and the safe load flow.
4. **Extend the wrapper's capabilities** (a new host component, a new broker
   method). Read `references/capabilities.md`.

If the user's framing is platform-level ("let clinicians build their own tools"),
lead with the platform story and pattern (1)+(3); don't make them think about
tokens or CSP.

## Building an applet

An applet is a React component that receives brokered capabilities and renders
through Remote DOM host components. Minimal shape:

```tsx
import {useEffect, useState} from 'react';
import {Card, Heading, Text, Table} from './remote-elements';

export function App({clinical, context}) {
  const [obs, setObs] = useState([]);
  useEffect(() => {
    // No token, no URL host — just a relative FHIR path. The wrapper performs
    // the authenticated request and returns the parsed body.
    clinical.fhirRequest({
      url: `Observation?patient=${context.patient.id}&category=vital-signs&_count=200`,
    }).then((bundle) => setObs(bundle.entry?.map((e) => e.resource) ?? []));
  }, []);
  return (
    <Card>
      <Heading level={1}>My applet</Heading>
      <Text>{obs.length} observations, no token in sight.</Text>
    </Card>
  );
}
```

Key facts that make this pleasant:

- **Use ordinary libraries that are pure JS + React.** Zustand, immer, date-fns,
  XState, etc. work unchanged in the worker — they need no DOM/network/storage.
  The reference impl uses Zustand for the growth view state as a worked example.
  The one caveat: anything that reaches for `window`/`document`/`localStorage`/
  `canvas`/portals needs a host adapter or a brokered capability. (E.g. Zustand's
  `persist` middleware must be backed by a host capability, not localStorage.)
  See `references/capabilities.md`.
- **`fhirRequest` is broad, not a fixed profile.** Any relative FHIR URL the
  clinician's scopes allow. The FHIR server remains the authorization boundary.
- **You get audit for free.** Every brokered call is recorded by the wrapper.

Develop against the reference impl: edit `src/applet/App.tsx`, run
`node tools/serve.mjs`, open the host origin. To verify an applet renders and
stays contained, drive it headless — see `references/build-and-gotchas.md`
("Verifying").

## The non-negotiable build invariants

The runtime security comes from the server + iframe + CSP + broker, NOT the
bundler — so you can build with Vite, Bun, or anything else. But the build MUST
preserve two invariants, or the applet either breaks or leaks:

1. **The applet worker ships as ONE self-contained classic (IIFE) script.** It
   runs as a `blob:` worker inside an opaque origin, where Chromium **cannot load
   an ES-module worker or any external chunk**. So: classic/IIFE format, no code
   splitting, no module preload, everything inlined.
2. **Trust tiers stay in separate bundles.** Token-handling / host-only code must
   never be bundled into the sandbox-launcher or worker outputs.

`references/build-and-gotchas.md` has the repo's `build.ts` (Bun) plus the
equivalent Vite config, and the full list of sharp edges discovered the hard way
(the classic-worker requirement, a ~2–5s-per-load `Clear-Site-Data` perf trap, FHIR datetime
parsing, CORS, the opaque-origin module-worker failure). **Read it before
changing any build or server config.**

## Bootstrapping a new wrapper

```bash
scripts/new-project.sh <target-dir> [--name my-wrapper] [--host-port 5173] [--sandbox-port 5174]
```

This derives a minimal, known-good wrapper from the reference implementation
(correct CSP, two-origin dev server, classic-worker build, broker, and a
hello-world applet plus a stub applet registry), and rewrites ports/names. Then:
`cd <target-dir> && bun install && bun run build.ts && node tools/serve.mjs`. Wire a real
SMART launch by following `references/capabilities.md` ("Real SMART launch").

## Reuse patterns

`references/patterns.md` describes the spectrum, so you can match the user's
situation:

- **Platform / host (default, lead with this):** one wrapper, an applet registry,
  pick-an-applet. Easiest to add applets; all equally safe.
- **Dynamic / late-bound applets:** the wrapper fetches an applet bundle from a
  URL (or accepts user-pasted code) and runs it in the same sandbox. Safe because
  applets are already untrusted; the doc covers integrity, the trusted-fetch path,
  and the self-contained-classic-bundle requirement.
- **Library / embedded:** a single app vendors the runtime to sandbox one risky
  surface (e.g. an LLM-generated panel) inside an otherwise normal app.

## Reference files

- `references/architecture.md` — trust tiers, message/handshake flow, Remote DOM, why each boundary exists.
- `references/build-and-gotchas.md` — the repo's Bun `build.ts` (and equivalent Vite config), the two invariants, GitHub Pages single-origin + `<meta>` CSP, and every hard-won gotcha (classic worker, Clear-Site-Data perf, opaque-origin module workers, FHIR dates, CORS, verifying headless).
- `references/capabilities.md` — using and extending `fhirRequest`/`llmComplete`/`audit`, adding a host-rendered Remote DOM component, using third-party libraries (Zustand worked example), and wiring a real SMART launch.
- `references/patterns.md` — platform vs. dynamic/URL-loaded vs. library reuse patterns, with the security argument for each (incl. containment vs. provenance).
- `references/standalone-applets.md` — compile a standalone bun/ts/react/zustand applet into a classic bundle, host it anywhere, and load it at runtime via the wrapper's `?applet=<url>` (implemented in the reference impl; verified cross-origin).
