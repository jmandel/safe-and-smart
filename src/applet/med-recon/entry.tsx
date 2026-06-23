// Standalone entry for the medication-reconciliation applet. Built by build.ts
// into dist/applets/med-recon.js (a self-contained classic worker script) and
// loadable at runtime via the wrapper's ?applet=<url>.
import {runApplet} from '../runtime';
import {App} from './App';

runApplet(App, {appletId: 'org.example.med-reconciliation', appletVersion: '0.1.0'});
