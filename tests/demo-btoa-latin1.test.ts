import {describe, expect, it} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

// btoa() throws on any code point > 0xFF ("Latin1 range"). Our demo applets,
// playground examples, and tutorial lessons build data: URLs by btoa-ing an inline
// SVG string. A stray em dash / arrow / smart-quote in that string is a RUNTIME
// crash that tsc, the bundler, and the unit/red-team suites do not catch — they
// never execute the applet UI. We shipped exactly that bug (an em dash inside a
// module-level btoa) and blanked two demo applets. This guard scans the source.
const FILES = [
  'src/host/authoring/examples.ts',
  'src/host/authoring/lessons.ts',
  'src/applet/document-viewer/entry.tsx',
  'src/applet/encounter-cockpit/entry.tsx',
];

// Extract each btoa( ... ) argument span via balanced-paren matching.
function btoaSpans(src: string): string[] {
  const spans: string[] = [];
  let i = 0;
  while ((i = src.indexOf('btoa(', i)) !== -1) {
    let depth = 0;
    let j = i + 'btoa'.length; // points at the '('
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '(') depth++;
      else if (c === ')' && --depth === 0) {
        j++;
        break;
      }
    }
    spans.push(src.slice(i, j));
    i = j;
  }
  return spans;
}

describe('demo/example/lesson btoa payloads are Latin1-safe', () => {
  for (const rel of FILES) {
    it(`${rel}: no code point > 0xFF inside btoa(...)`, () => {
      const src = readFileSync(join(import.meta.dir, '..', rel), 'utf8');
      for (const span of btoaSpans(src)) {
        const bad = [...span].find((ch) => ch.codePointAt(0)! > 0xff);
        expect(
          bad,
          `non-Latin1 char ${JSON.stringify(bad)} inside btoa(...) in ${rel} — btoa would throw at runtime`,
        ).toBeUndefined();
      }
    });
  }
});
