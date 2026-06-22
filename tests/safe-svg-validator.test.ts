import {describe, expect, it} from 'bun:test';
import {DOMParser} from '@xmldom/xmldom';
import {validateSvgDocument, SvgViolation} from '../src/host/safe-svg-validator';

function parse(svg: string) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  return doc.documentElement as unknown as Parameters<typeof validateSvgDocument>[0];
}
const check = (svg: string) => validateSvgDocument(parse(svg));

describe('Safe SVG subset — legitimate diagrams pass', () => {
  it('accepts presentational shapes, gradients, internal refs, and inline styles', () => {
    expect(() =>
      check(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs><linearGradient id="g"><stop offset="0" stop-color="#06f"/><stop offset="1" stop-color="#0c0"/></linearGradient></defs>
        <g transform="translate(5,5)">
          <rect x="0" y="0" width="80" height="40" rx="6" fill="url(#g)" stroke="#333"/>
          <circle cx="20" cy="60" r="10" fill="#e33"/>
          <text x="4" y="20" style="font-size:12px;fill:#fff">Hi</text>
          <path d="M0 0 L10 10" stroke="currentColor"/>
        </g>
      </svg>`),
    ).not.toThrow();
  });
});

describe('Safe SVG subset — hostile corpus', () => {
  const hostile: Array<[string, string]> = [
    ['inline script', '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("http://evil")</script></svg>'],
    ['onload handler', '<svg xmlns="http://www.w3.org/2000/svg" onload="fetch(1)"></svg>'],
    ['onclick on shape', '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>'],
    ['image external href', '<svg xmlns="http://www.w3.org/2000/svg"><image href="http://evil/c"/></svg>'],
    ['use external href', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="http://evil/c"/></svg>'],
    ['anchor href', '<svg xmlns="http://www.w3.org/2000/svg"><a href="http://evil">x</a></svg>'],
    ['foreignObject escape', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body/></foreignObject></svg>'],
    ['fill external url', '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(http://evil/c)"/></svg>'],
    ['style url exfil', '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(http://evil/c)"/></svg>'],
    ['filter external', '<svg xmlns="http://www.w3.org/2000/svg"><rect filter="url(http://evil/c)"/></svg>'],
    ['non-svg root', '<div xmlns="http://www.w3.org/1999/xhtml"></div>'],
  ];
  for (const [name, svg] of hostile) {
    it(`rejects: ${name}`, () => {
      expect(() => check(svg)).toThrow(SvgViolation);
    });
  }

  it('allows internal fragment refs but not external ones', () => {
    expect(() => check('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#grad)"/></svg>')).not.toThrow();
    expect(() => check('<svg xmlns="http://www.w3.org/2000/svg"><rect clip-path="url(//evil)"/></svg>')).toThrow(SvgViolation);
  });
});
