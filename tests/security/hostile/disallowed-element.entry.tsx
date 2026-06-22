import React from 'react';
import {runApplet} from '../../../src/applet/runtime';
// Raw intrinsic element not in the host component map → RemoteRootRenderer throws.
function App() {
  return React.createElement('img', {src: '//localhost:4399/disallowed-img?d=SECRET'});
}
runApplet(App as unknown as React.ComponentType<never>, {appletId: 'hostile.disallowed', appletVersion: '0'});
