// Standalone applet entry. This is what an external applet author ships: their
// React app (here, the growth explorer, which uses Zustand + Vega via host
// components) wrapped by the runtime. Built by build.ts into a
// single self-contained CLASSIC worker script (dist/applets/growth-remote.js)
// that can be hosted anywhere and loaded at runtime by a wrapper. Identical to
// worker.tsx except it is built as its own bundle rather than inlined.
import {runApplet} from './runtime';
import {App} from './App';

runApplet(App, {appletId: 'org.example.growth-explorer', appletVersion: '0.1.0-remote'});
