// Authoring SDK runtime. This is prebuilt into a single classic-worker IIFE and
// PREPENDED to browser-compiled applet code. It puts the applet SDK on a global
// (`SafeSmart`) so authored code — transpiled in the browser by the TypeScript
// compiler, NOT bundled — can use React + the ui-* components + runApplet without
// any import/module resolution. The concatenation [this SDK] + [transpiled author
// code] is a self-contained worker script that runs under the identical sandbox
// (opaque iframe → blob worker → mutation firewall) as any other applet.
import React from 'react';
import {runApplet, type AppletProps} from './runtime';
import {TAG_TO_COMPONENT} from './remote-elements';
import {jsx, jsxs, Fragment} from './safe-react/jsx-runtime';

// Capitalised aliases for authors who prefer components over intrinsic tags.
const ui = {
  Box: TAG_TO_COMPONENT['ui-box'],
  Inline: TAG_TO_COMPONENT['ui-inline'],
  Stack: TAG_TO_COMPONENT['ui-stack'],
  Grid: TAG_TO_COMPONENT['ui-grid'],
  Card: TAG_TO_COMPONENT['ui-card'],
  Heading: TAG_TO_COMPONENT['ui-heading'],
  Text: TAG_TO_COMPONENT['ui-text'],
  Badge: TAG_TO_COMPONENT['ui-badge'],
  Alert: TAG_TO_COMPONENT['ui-alert'],
  Button: TAG_TO_COMPONENT['ui-button'],
  Select: TAG_TO_COMPONENT['ui-select'],
  Slider: TAG_TO_COMPONENT['ui-slider'],
  Input: TAG_TO_COMPONENT['ui-input'],
  Textarea: TAG_TO_COMPONENT['ui-textarea'],
  Stat: TAG_TO_COMPONENT['ui-stat'],
  Table: TAG_TO_COMPONENT['ui-table'],
  Vega: TAG_TO_COMPONENT['ui-vega'],
  Svg: TAG_TO_COMPONENT['ui-svg'],
  Image: TAG_TO_COMPONENT['ui-image'],
  Code: TAG_TO_COMPONENT['ui-code'],
};

const SafeSmart = {React, runApplet, ui, jsx, jsxs, jsxDEV: jsx, Fragment};

(globalThis as unknown as {SafeSmart: typeof SafeSmart}).SafeSmart = SafeSmart;

export type {AppletProps};
export {SafeSmart};
