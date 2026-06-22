# Architecture

## Three trust tiers

| Tier | Origin | Holds | Can it reach the network/DOM/token? |
|---|---|---|---|
| **Wrapper / shell** | real registrable origin | SMART token, broker, host components | Yes — this is the trusted tier you own |
| **Sandbox launcher** | a *different* origin, opaque via `sandbox="allow-scripts"` | nothing but a nonce + a MessagePort | No token; CSP-locked; only spawns the worker |
| **Applet** | inside a `blob:` DedicatedWorker (opaque) | the applet's own React code | No DOM, no `fetch` (`connect-src 'none'`), no usable storage |

The launcher iframe is a **policy boundary**, not where the app runs. The applet
runs one layer deeper, in a worker, so it has no `window`/`document` at all.

Use **different hostnames** for wrapper vs. sandbox (the dev server uses
`localhost` vs `127.0.0.1`; production should use different registrable domains).
This makes the sandbox a genuinely separate origin so it can't reach the
wrapper's storage/cookies even if the iframe sandbox were misconfigured.

## Message / handshake flow

```
wrapper (App.tsx)                 launcher (frame.ts)            worker (worker.tsx)
   |                                   |                              |
   | iframe src = sandbox/frame        |                              |
   |---------------------------------->| (loads, opaque origin)       |
   | postMessage(connect, [port2]) ----| (validates nonce + source)   |
   |                                   | new Worker(blobURL) ---------→| (classic worker boots)
   |                                   | postMessage(connect,[port])  →| (receives MessagePort)
   |                                   |                              | thread.connect(handshake)
   |←----------- connect() over MessagePort RPC (@quilted/threads) ---|
   | returns {remoteConnection, clinical caps, context} ------------→ | runs security probe
   |                                   |                              | renders <App/> via Remote DOM
   |←--------- Remote DOM mutations (tree ops) over the port ---------|
   | host renders real DOM + Vega-Lite |                              |
```

- The wrapper transfers a `MessagePort` to the launcher with a **128-bit nonce**;
  the launcher checks `event.source === window.parent` and the nonce before
  trusting it. Because the iframe is opaque-origin, the wrapper posts with `'*'`
  and relies on the nonce + source binding.
- All capability calls (`fhirRequest`, `llmComplete`, `audit`) and UI updates are
  RPC over that one `MessagePort` using `@quilted/threads`. There is no other
  channel out of the applet.

## Remote DOM (why the applet feels normal)

The applet renders with React into a **virtual** element tree. Shopify Remote DOM
serializes low-level tree mutations and event callbacks across the port; the
wrapper holds a `RemoteReceiver` + `RemoteRootRenderer` that maps virtual
elements to a vetted catalog of **host-rendered React components** (Card, Table,
Vega chart, controls, …).

Consequences:
- The applet uses hooks, state, composition, effects, event handlers — all normal.
  It is the **full React programming model**, not a JSON widget DSL.
- But "full React" does NOT mean "arbitrary DOM." The host realizes **only element
  names present in `remoteComponentMap`** (ui-card, ui-text, ui-table, ui-vega, …),
  and those renderers coerce every prop to text — there is no `src`/`href` sink
  (the Vega spec is sanitized to reject any url/href/src/external loader). So the
  **vetted component catalog is the rendering boundary**, and rendered-channel
  exfiltration (img beacons, link/form/iframe) is not available to the applet:
  `connect-src 'none'` covers fetch/XHR/WebSocket; the catalog covers the rendered
  surfaces. (A separate, lower-assurance "direct-DOM iframe" tier — arbitrary
  elements — is a documented higher-governance option, NOT this implementation.)
- **Failure contract for a disallowed element (verified against the code):** an
  element name not in the map is NOT silently stripped. `renderRemoteNode` throws
  `No component found for remote element: <name>`. With no error boundary around
  `RemoteRootRenderer`, that throw unmounts the **whole host render** — the bad
  element never reaches the DOM (so no exfil), but the applet's UI (and currently
  the wrapper chrome) fails closed entirely. A production wrapper should wrap the
  renderer in an **error boundary** so one unsupported element degrades to a
  per-applet error instead of blanking the wrapper.
- **Defense-in-depth:** the trusted host page also ships a CSP that locks the
  rendered-channel sinks (`img-src 'self' data: blob:`, `media-src/object-src
  'none'`, `form-action 'none'`, `base-uri 'none'`) so an off-origin beacon fails
  even if a URL-bearing component is added later or a host dependency is
  compromised. `connect-src`/`frame-src` stay broad (trusted broker + launcher);
  `script-src` keeps `'unsafe-eval'` for Vega's expression compiler.
- Libraries that manipulate `window`/`document`/CSSOM/canvas/portals directly need
  a host adapter; pure logic/state libraries work as-is (see `capabilities.md`).

## What this defends — and what it does not

Defends against: an applet exfiltrating the SMART token, making arbitrary network
calls, persisting tracking data, or reaching the wrapper's DOM/storage.

Does **not** defend against: a compromised browser/OS, a malicious wrapper
dependency, a clinician manually copying displayed data, a browser zero-day, or
the FHIR server returning data the clinician's scopes shouldn't allow (the FHIR
server remains the authorization authority). It is an architecture for
*containment of applet code*, not a proof of non-exfiltration.
