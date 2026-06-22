import {MessageChannel} from 'node:worker_threads';
import {describe, expect, it} from 'vitest';
import {ThreadMessagePort} from '@quilted/threads';

interface SideA {
  connect(): Promise<{nested: {multiply(a: number, b: number): Promise<number>}}>;
}
interface SideB {
  ping(): Promise<string>;
}

describe('@quilted/threads MessagePort RPC', () => {
  it('preserves nested callable capabilities returned by a handshake', async () => {
    const channel = new MessageChannel();
    channel.port1.start();
    channel.port2.start();
    const a = new ThreadMessagePort<SideB, SideA>(channel.port1 as never, {
      exports: {
        async connect() {
          return {
            nested: {
              async multiply(left: number, right: number) {
                return left * right;
              },
            },
          };
        },
      },
    });
    const b = new ThreadMessagePort<SideA, SideB>(channel.port2 as never, {
      exports: {async ping() { return 'pong'; }},
    });

    const handshake = await b.imports.connect();
    await expect(handshake.nested.multiply(6, 7)).resolves.toBe(42);
    await expect(a.imports.ping()).resolves.toBe('pong');
    a.close();
    b.close();
  });
});
