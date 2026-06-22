# Validation record

Assembly date: 2026-06-21.

## Completed

The following commands passed in the assembly environment:

```text
npm run typecheck
npm test
npm run build
```

Unit-test result at packaging time:

```text
4 test files passed
10 tests passed
```

The tests cover:

- broad relative FHIR searches;
- rejection of absolute FHIR destinations;
- FHIR base-path traversal prevention;
- read-only default behavior;
- Vega inline-spec acceptance;
- Vega URL and executable-protocol rejection;
- growth-model transformations;
- nested callable capability behavior through `@quilted/threads`.

The production Vite build generated separate host and sandbox entry points, an inline worker, source maps, and static assets in `dist/`.

The two-origin static server was also checked with HTTP requests to verify that host and sandbox pages are reachable with their distinct header sets.

## Browser test limitation

`tests/browser/spike.spec.ts` is included and intended to verify:

- the growth app renders;
- the isolation probes report blocked/unavailable DOM, network, and storage;
- Vega renders to canvas;
- the LLM capability works;
- FHIR and LLM audit events appear.

It could not be executed in the environment used to build this ZIP. The installed Chromium was controlled by an enterprise machine policy with:

```text
URLBlocklist: ["*"]
```

A Playwright-managed Chromium download was also unavailable in that environment because external package-host DNS resolution failed. This is an environment limitation, not a passing browser-test result.

Run locally with:

```bash
npm ci
npx playwright install chromium
npm run test:browser
```

Do not use real PHI until the test succeeds in the exact managed-browser configuration intended for deployment and the full security plan has been run with network capture.
