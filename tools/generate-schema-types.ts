// Generates TypeScript intrinsic JSX types from the Safe DOM schema, so applet
// authors get autocomplete + type-checking on the UI surface that the host will
// actually accept. Run: bun tools/generate-schema-types.ts
// Output: src/shared/safe-dom-intrinsics.d.ts (checked in; regenerate on schema change).
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SAFE_DOM_SCHEMA, SAFE_DOM_SCHEMA_VERSION, type SafePropType} from '../src/shared/safe-dom-schema';

const TS_TYPE: Record<SafePropType, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  array: 'readonly unknown[]',
  object: 'Record<string, unknown>',
};

function propsInterface(tag: string): string {
  const schema = SAFE_DOM_SCHEMA[tag]!;
  const lines: string[] = [];
  for (const [name, type] of Object.entries(schema.properties)) {
    lines.push(`    ${name}?: ${TS_TYPE[type]};`);
  }
  for (const prop of Object.keys(schema.eventProps ?? {})) {
    lines.push(`    ${prop}?: (event: unknown) => void;`);
  }
  if (schema.children) lines.push('    children?: unknown;');
  return lines.join('\n');
}

const blocks = Object.keys(SAFE_DOM_SCHEMA)
  .map((tag) => `  '${tag}': {\n${propsInterface(tag)}\n  };`)
  .join('\n');

const output = `// AUTO-GENERATED from src/shared/safe-dom-schema.ts (v${SAFE_DOM_SCHEMA_VERSION}).
// Do not edit by hand — run \`bun tools/generate-schema-types.ts\`.
// Declares the Safe DOM intrinsic elements so applet authors can write
// \`<ui-stack gap={12}>…</ui-stack>\` with full type-checking. The runtime binding
// for intrinsic JSX lands in Phase 2 (@safe-smart/react); these types describe the
// surface the host mutation firewall enforces today.
import type {} from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
${blocks}
    }
  }
}
`;

const target = join(import.meta.dir, '..', 'src', 'shared', 'safe-dom-intrinsics.d.ts');
writeFileSync(target, output);
console.log(`Wrote ${target} (${Object.keys(SAFE_DOM_SCHEMA).length} elements, schema v${SAFE_DOM_SCHEMA_VERSION}).`);
