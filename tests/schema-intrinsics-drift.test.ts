import {describe, expect, it} from 'bun:test';
import {readFileSync} from 'node:fs';
import {renderIntrinsics, INTRINSICS_PATH} from '../tools/generate-schema-types';

// safe-dom-intrinsics.d.ts is generated from SAFE_DOM_SCHEMA and checked in. If the
// schema changes (or SAFE_DOM_SCHEMA_VERSION bumps) without regenerating, applet
// authors get types that disagree with what the firewall enforces. Guard the sync:
// run `bun run gen:types` to fix a failure here.
describe('safe-dom intrinsic types', () => {
  it('the checked-in safe-dom-intrinsics.d.ts matches the generator output', () => {
    const committed = readFileSync(INTRINSICS_PATH, 'utf8');
    expect(committed).toBe(renderIntrinsics());
  });
});
