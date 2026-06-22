// Runs FIRST in the applet worker, before any applet (or library) code. The CSP
// (connect-src 'none', no external script-src, no 'unsafe-eval') is the real
// boundary; this prelude additionally neutralizes ambient constructors the applet
// never needs, so importScripts can't even attempt a same-origin request (whose
// URL could encode data into the host's own access logs), and nested workers
// can't be spawned for escape/resource-exhaustion. Because it runs before applet
// code and the worker has no eval, the applet cannot capture the originals.
function disable(target: object, name: string): void {
  try {
    Object.defineProperty(target, name, {
      configurable: false,
      writable: false,
      enumerable: false,
      value: () => {
        throw new Error(`${name} is disabled in the applet sandbox.`);
      },
    });
  } catch {
    // already locked / non-configurable — fine
  }
}

const globalScope = self as unknown as Record<string, unknown> & object;
const prototype = Object.getPrototypeOf(globalScope) as object;

// importScripts lives on the worker global's prototype; lock it there and on self.
disable(prototype, 'importScripts');
disable(globalScope, 'importScripts');

// Nested worker constructors — neutralize (defense-in-depth; the applet never
// needs them, and they are an escape / resource-exhaustion surface).
for (const ctor of ['Worker', 'SharedWorker'] as const) {
  try {
    Object.defineProperty(globalScope, ctor, {
      configurable: false,
      writable: false,
      value: class {
        constructor() {
          throw new Error(`${ctor} is disabled in the applet sandbox.`);
        }
      },
    });
  } catch {
    // ignore
  }
}

export {};
