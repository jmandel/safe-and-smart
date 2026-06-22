import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';

export default defineConfig({
  // GitHub Pages serves under /<repo>/. Set VITE_BASE=/<repo>/ for that deploy.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  build: {
    target: 'es2022',
    // 'hidden' still emits maps for manual debugging but omits the
    // //# sourceMappingURL comment, so DevTools does not auto-fetch ~5 MB of
    // maps on every load (the worker map is also CSP-blocked, which DevTools
    // retries). Use true while actively debugging. This is the served build.
    sourcemap: false,
    // The inline applet worker runs from a blob: URL in an opaque-origin frame.
    // The module-preload polyfill injects a relative `import` that cannot resolve
    // under blob:null, so disable it and keep the worker fully self-contained.
    modulePreload: {polyfill: false},
    rollupOptions: {
      input: {
        landing: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app.html'),
        sandbox: resolve(import.meta.dirname, 'sandbox.html'),
      },
    },
  },
  worker: {
    // Classic (IIFE) worker, not an ES module. Module workers cannot be loaded
    // from a blob: URL inside an opaque-origin (allow-scripts only) iframe in
    // Chromium, which silently kills the applet. A classic blob worker works.
    format: 'iife',
    rollupOptions: {
      output: {inlineDynamicImports: true},
    },
  },
});
