// Multi-file + npm in-browser bundler (W4). Uses esbuild-wasm to bundle a virtual
// project (multiple TSX/CSS files) and resolve bare npm imports from esm.sh, then
// concatenates the prebuilt authoring SDK to produce ONE self-contained,
// hash-addressed classic-worker script that runs in the identical sandbox. esbuild
// needs 'wasm-unsafe-eval' — granted only on the /author page; the compiled applet
// still runs under the locked sandbox CSP.
import * as esbuild from 'esbuild-wasm';
import {sha256Hex} from '../load-applet';
import {AUTHORING_PRELUDE, loadSdkSource} from './compile';

let initPromise: Promise<void> | undefined;
function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = esbuild.initialize({
      wasmURL: `${import.meta.env.BASE_URL}esbuild.wasm`,
    });
  }
  return initPromise;
}

export interface ProjectFile {
  path: string;
  content: string;
}

export interface CompileResult {
  ok: boolean;
  script?: string;
  sha256?: string;
  diagnostics: string[];
  fetchedPackages: string[];
}

const normalize = (path: string) => path.replace(/^\.?\//, '');

function loaderFor(path: string): esbuild.Loader {
  if (path.endsWith('.css')) return 'text'; // import as string → clinical.registerStylesheet
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.js')) return 'js';
  return 'tsx';
}

function resolveInVfs(path: string, vfs: Map<string, string>): string {
  const candidates = [path, `${path}.tsx`, `${path}.ts`, `${path}.jsx`, `${path}.js`, `${path}/index.tsx`];
  return candidates.find((c) => vfs.has(normalize(c))) ?? path;
}

// In-memory package cache (the "package cache" — survives within a session).
const httpCache = new Map<string, string>();
async function fetchText(url: string): Promise<string> {
  const cached = httpCache.get(url);
  if (cached != null) return cached;
  const response = await fetch(url, {redirect: 'follow'});
  if (!response.ok) throw new Error(`fetch ${url} → ${response.status}`);
  const text = await response.text();
  httpCache.set(url, text);
  return text;
}

export async function compileProject(
  files: ProjectFile[],
  entry = 'App.tsx',
): Promise<CompileResult> {
  await ensureInitialized();
  const vfs = new Map(files.map((f) => [normalize(f.path), f.content]));
  const fetched = new Set<string>();

  const plugin: esbuild.Plugin = {
    name: 'safe-smart-vfs',
    setup(build) {
      build.onResolve({filter: /.*/}, (args) => {
        if (args.kind === 'entry-point') return {path: normalize(args.path), namespace: 'vfs'};
        // already-remote, or relative import from a remote module
        if (args.namespace === 'http' || /^https?:\/\//.test(args.path)) {
          const url = /^https?:\/\//.test(args.path)
            ? args.path
            : new URL(args.path, args.importer).href;
          return {path: url, namespace: 'http'};
        }
        // relative import inside the project
        if (args.path.startsWith('.')) {
          const rel = new URL(args.path, `file:///${args.importer}`).pathname.replace(/^\//, '');
          return {path: resolveInVfs(rel, vfs), namespace: 'vfs'};
        }
        // bare specifier → esm.sh (bundled so peer-less packages are self-contained)
        fetched.add(args.path);
        return {path: `https://esm.sh/${args.path}?bundle&target=es2020`, namespace: 'http'};
      });
      build.onLoad({filter: /.*/, namespace: 'vfs'}, (args) => {
        const contents = vfs.get(normalize(args.path));
        if (contents == null) return {errors: [{text: `file not found in project: ${args.path}`}]};
        return {contents, loader: loaderFor(args.path)};
      });
      build.onLoad({filter: /.*/, namespace: 'http'}, async (args) => {
        const contents = await fetchText(args.path);
        return {contents, loader: 'js'};
      });
    },
  };

  let bundled: string;
  let diagnostics: string[];
  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'iife',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      banner: {js: AUTHORING_PRELUDE},
      target: 'es2020',
      logLevel: 'silent',
      plugins: [plugin],
    });
    diagnostics = result.warnings.map((w) => w.text);
    bundled = result.outputFiles![0]!.text;
  } catch (error) {
    const errs = (error as {errors?: Array<{text: string}>}).errors;
    return {
      ok: false,
      diagnostics: errs ? errs.map((e) => e.text) : [(error as Error).message],
      fetchedPackages: [...fetched],
    };
  }

  const sdk = await loadSdkSource();
  const script = `${sdk}\n;${bundled}`;
  const sha256 = await sha256Hex(script);
  return {ok: true, script, sha256, diagnostics, fetchedPackages: [...fetched]};
}
