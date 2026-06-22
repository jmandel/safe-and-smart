// Built-in (build-time inlined) applet worker. This is the default applet the
// wrapper runs when no external applet URL is supplied. It uses the same runtime
// that a standalone, URL-loaded applet would — see ./standalone-entry.tsx and
// tools/build-applet.ts for the externally hostable build.
import {runApplet} from './runtime';
import {App} from './App';

runApplet(App, {appletId: 'org.example.growth-explorer', appletVersion: '0.1.0'});
