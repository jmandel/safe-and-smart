// Browser-only applet compiler. Transpiles authored TSX with the TypeScript
// compiler (pure JS — no wasm, no eval, no CSP relaxation), then concatenates the
// prebuilt authoring SDK (React + ui-* components + runApplet on a global) with the
// transpiled author code into ONE self-contained classic-worker script. The result
// is hash-addressed and runs under the identical hostile-app sandbox as any other
// applet — nothing the author writes gains new privilege.
import * as ts from 'typescript';
import {sha256Hex} from '../load-applet';

export interface CompileResult {
  ok: boolean;
  script?: string;
  sha256?: string;
  diagnostics: string[];
}

// Authored code runs against these globals (no imports / module resolution in the
// browser). Auto-prepended so the editor body is just the applet.
export const AUTHORING_PRELUDE =
  'const { React, runApplet, ui } = SafeSmart;\n' +
  'const { useState, useEffect, useMemo, useRef, useCallback } = React;\n';

let sdkSourcePromise: Promise<string> | undefined;
function loadSdkSource(): Promise<string> {
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

export async function compileApplet(tsxSource: string): Promise<CompileResult> {
  const source = AUTHORING_PRELUDE + tsxSource;
  let output: ts.TranspileOutput;
  try {
    output = ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.React, // classic: <ui.Card/> -> React.createElement(ui.Card, …)
        jsxFactory: 'React.createElement',
        jsxFragmentFactory: 'React.Fragment',
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        isolatedModules: true,
      },
      reportDiagnostics: true,
    });
  } catch (error) {
    return {ok: false, diagnostics: [(error as Error).message]};
  }

  const diagnostics = (output.diagnostics ?? []).map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  );

  let sdk: string;
  try {
    sdk = await loadSdkSource();
  } catch (error) {
    return {ok: false, diagnostics: [...diagnostics, (error as Error).message]};
  }

  const script = `${sdk}\n;(function(){\n${output.outputText}\n})();`;
  const sha256 = await sha256Hex(script);
  return {ok: true, script, sha256, diagnostics};
}
