# Security test plan

Use synthetic sentinel strings such as `PHI-SENTINEL-<random>` and capture browser console, DevTools protocol network events, DNS/proxy logs, static-server logs, and approved capability audit events.

## Expected invariant

The sentinel may appear only in:

- applet worker memory;
- Remote DOM mutation payloads required to display it;
- trusted host DOM when intentionally rendered;
- approved FHIR/LLM capability calls when intentionally supplied;
- protected test instrumentation.

It must not appear in any unapproved request, navigation, report, log, crash URL, package fetch, or browser storage location.

## Automated browser cases

### Network APIs

Attempt:

- `fetch`;
- `XMLHttpRequest`;
- WebSocket;
- EventSource;
- `navigator.sendBeacon` where present;
- `RTCPeerConnection` and ICE gathering;
- WebTransport;
- dynamic `import()` from HTTP, data, and blob sources;
- `importScripts()`;
- DNS-prefetch/preconnect APIs if exposed;
- Reporting API and CSP report manipulation.

Expected: unavailable or blocked; packet capture shows no destination request containing the sentinel.

### DOM and browsing context

Confirm the applet worker cannot access `window`, a real `document`, parent/top frames, or host DOM nodes.

In the iframe bootstrap attack harness, attempt:

- self-navigation and redirects;
- links, forms, popups, downloads, and custom protocols;
- images, SVG, CSS URLs, fonts, media, objects, manifests, nested frames;
- clipboard, print, drag/drop, share, fullscreen, pointer lock, camera, microphone, screen capture, USB, serial, HID, Bluetooth, geolocation.

Expected: denied by sandbox, CSP, Permissions Policy, or network policy. Treat any self-navigation request to the sandbox static server as a finding, even if it cannot reach the Internet.

### Storage and cross-context communication

Attempt:

- cookies;
- localStorage and sessionStorage;
- IndexedDB;
- Cache API;
- service workers;
- shared workers;
- BroadcastChannel;
- SharedArrayBuffer;
- origin-private file system;
- Web Locks;
- storage-access APIs.

Expected: unavailable, opaque/ephemeral, or explicitly denied. Verify no sentinel remains after worker/frame restart.

### Protocol attacks

Test:

- wrong nonce and wrong `event.source`;
- second connection attempt;
- wrong applet ID/version/protocol;
- huge strings, arrays, depth, object keys, and cyclic data;
- unexpected transferables;
- duplicate/replayed request IDs after production IDs are added;
- callback retention flood;
- capability call after patient switch or worker teardown;
- malformed errors and stack traces;
- prototype-polluting property names.

Expected: reject, audit, and preserve host availability.

### FHIR broker

Test URL inputs:

```text
https://attacker.example/x
//attacker.example/x
../admin
%2e%2e/admin
Observation?x=https://attacker.example
Observation#https://attacker.example
Patient/demo/../../outside
```

Also test forbidden headers, method casing, content types, huge bodies, response budgets, timeout, cancellation, paging loops, redirects, and absolute `Bundle.link.next` values.

Expected: only active-base requests proceed. Query values may contain URLs as clinical search data, but must never be dereferenced by the broker.

### Renderer and Remote DOM

Attempt:

- undeclared remote element names;
- arbitrary attributes and event names;
- oversized strings/arrays/tables;
- `dangerouslySetInnerHTML`-like properties;
- CSS, class, style, URL, SVG, and HTML payloads;
- function/callback churn;
- malformed Vega specs and expression bombs;
- Vega data URLs, image marks, hrefs, loaders, editor and export actions;
- accessibility/focus traps and spoofed trusted-shell UI.

Expected: reject, clamp, or render inert text. The applet surface should be visually labeled so it cannot convincingly impersonate trusted confirmation UI.

### Denial of service

Attempt:

- `while(true)`;
- recursive Promise/microtask loops;
- multi-gigabyte allocation attempts;
- Remote DOM mutation storms;
- chart specs with extreme rows/transforms;
- thousands of simultaneous FHIR/LLM calls;
- unresolved callbacks and timers.

Expected: watchdog terminates worker, broker enforces quotas, host remains responsive, and restart clears state.

## Manual browser matrix

Test current stable and hospital-supported extended releases of:

- Chrome / managed Chrome;
- Microsoft Edge / managed Edge;
- Firefox ESR;
- Safari on supported macOS, if part of deployment.

Repeat after browser security updates because CSP, opaque-origin, worker, and storage behavior can regress or differ.

## Network verification

Browser assertions are not enough. Use an outbound proxy or packet capture to confirm:

- no direct IP traffic;
- no DNS query encoding the sentinel;
- no unexpected QUIC/UDP;
- no PAC/proxy bypass;
- no browser reporting endpoint receives applet-controlled text;
- static asset requests do not carry applet-controlled query/path/header content;
- approved FHIR/LLM destinations receive only intentional capability traffic.

## CI release gate

A production runtime release should be blocked unless:

- all unit and cross-browser tests pass;
- renderer fuzz corpus passes;
- dependency vulnerability and license checks pass;
- browser policy configuration is validated;
- CSP and Permissions Policy headers match a checked-in expected snapshot;
- packet-capture exfiltration suite passes;
- bundle hashes and source maps are reviewed;
- a security owner signs the result.
