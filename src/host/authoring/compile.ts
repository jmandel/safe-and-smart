// Browser-only authoring helpers: the prebuilt authoring SDK source plus the
// prelude that the in-browser compiler prepends to authored code. The actual
// transpile is done by esbuild-wasm (see esbuild-compile.ts) — the old TypeScript
// `transpileModule` path was removed, since it dragged the whole ~6 MB tsc into the
// /author bundle for no added capability.

// Authored code runs against these globals (no imports / module resolution in the
// browser). Auto-prepended so the editor body is just the applet.
export const AUTHORING_PRELUDE =
  'const { React, runApplet, ui } = SafeSmart;\n' +
  'const { useState, useEffect, useMemo, useRef, useCallback } = React;\n';

let sdkSourcePromise: Promise<string> | undefined;
export function loadSdkSource(): Promise<string> {
  if (!sdkSourcePromise) {
    sdkSourcePromise = fetch(`${import.meta.env.BASE_URL}applets/_sdk/authoring-sdk.js`, {
      cache: 'no-store',
    }).then((r) => {
      if (!r.ok) throw new Error(`authoring SDK unavailable (${r.status})`);
      return r.text();
    });
  }
  return sdkSourcePromise;
}
