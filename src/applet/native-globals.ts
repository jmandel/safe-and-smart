// Captured at first module evaluation, BEFORE the Remote DOM polyfills run.
// Remote DOM installs a synthetic `document`/`window` in the worker so React can
// render into a virtual tree whose mutations are serialized to the trusted host.
// To honestly report isolation we must record whether the worker had a *native*
// DOM (it does not — DedicatedWorkers have no document) separately from that
// synthetic rendering tree. This module must be imported before any polyfill.
export const nativeGlobals = {
  hadDocument: typeof (globalThis as {document?: unknown}).document !== 'undefined',
  hadWindow: typeof (globalThis as {window?: unknown}).window !== 'undefined',
};
