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
- The **security boundary is the host component catalog**, not a JSON schema. The
  applet can only cause UI that the wrapper's components can express.
- Libraries that manipulate `window`/`document`/CSSOM/canvas/portals directly need
  a host adapter; pure logic/state libraries work as-is (see
  `capabilities.md`).

## What this defends — and what it does not

Defends against: an applet exfiltrating the SMART token, making arbitrary network
calls, persisting tracking data, or reaching the wrapper's DOM/storage.

Does **not** defend against: a compromised browser/OS, a malicious wrapper
dependency, a clinician manually copying displayed data, a browser zero-day, or
the FHIR server returning data the clinician's scopes shouldn't allow (the FHIR
server remains the authorization authority). It is an architecture for
*containment of applet code*, not a proof of non-exfiltration.
