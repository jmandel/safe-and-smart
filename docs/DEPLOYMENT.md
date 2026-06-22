# Deployment

## Local (two origins, recommended posture)

```bash
bun install
bun run build.ts
node tools/serve.mjs
```

`tools/serve.mjs` serves the build on two origins — the trusted wrapper
(`localhost:4173`) and the opaque sandbox launcher (`127.0.0.1:4174`) — and sets
the launcher's CSP and `Access-Control-Allow-Origin: *` via response headers. Two
different hostnames make the sandbox a genuinely separate origin. A production
deployment should use two different **registrable domains**.

## GitHub Pages (single origin)

GitHub Pages is one static origin and cannot set custom response headers. Two
adaptations make the same security model hold; both are already in the repo and
the workflow:

1. **Same-origin launcher.** Build with `VITE_SANDBOX_ORIGIN=self` so the wrapper
   loads `sandbox.html` from the same origin (under the Vite `base`). Isolation
   does not require a second origin — it comes from `sandbox="allow-scripts"`
   (which gives the iframe an **opaque** origin regardless of where it's served)
   plus the worker boundary.

2. **CSP in a `<meta>` tag.** `sandbox.html` carries
   `<meta http-equiv="Content-Security-Policy" content="… connect-src 'none'; worker-src blob:; …">`.
   Verified empirically: this meta-CSP **propagates to the blob worker** and
   blocks all applet network (a `securitypolicyviolation` fires on
   `connect-src`), even though Pages sends no CSP header. `frame-ancestors` is
   header-only and omitted (defense-in-depth, not core containment).

Why the opaque iframe can still load its (module) launcher on Pages: GitHub Pages
sends `access-control-allow-origin: *`, which satisfies the CORS requirement for a
module script loaded into a null-origin document. (A plain static server that does
not send ACAO would fail here — Pages specifically does send it.)

### The workflow

`.github/workflows/deploy.yml` runs on push to `main`:

```
bun install --frozen-lockfile
bun run typecheck
VITE_BASE=/<repo>/ VITE_SANDBOX_ORIGIN=self bun run build.ts
upload-pages-artifact (dist) -> deploy-pages
```

Enable it once: repo **Settings → Pages → Build and deployment → Source: GitHub
Actions**. `VITE_BASE` is derived from the repository name so asset/runtime URLs
resolve under `https://<user>.github.io/<repo>/`.

## Caveat

The single-origin Pages build collapses the wrapper and sandbox onto one origin.
Applet code is still fully contained (opaque iframe + worker + meta-CSP), but a
production deployment handling real PHI should use the two-registrable-domain
posture and real server headers, not Pages.
