// Safe SVG subset validator. SVG is a notorious script/exfil surface (inline
// <script>, on* handlers, <image>/<use>/<a> with external href, foreignObject
// escaping into HTML). Author-supplied SVG (e.g. a custom diagram) is restricted
// to a presentational subset: an element allowlist, no event handlers, no external
// references — only internal url(#fragment) refs and inline presentation styles
// (validated through the CSS validator) are permitted.
//
// Operates on a parsed element tree (DOM Element / @xmldom Element) so strings,
// entities, and namespaces are handled by a real parser, not regex.
import {normalizeCssValue, validateStylesheet, CssViolation} from './css-validator';

export class SvgViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SvgViolation';
  }
}

const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'metadata',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan',
  'lineargradient', 'radialgradient', 'stop',
  'clippath', 'mask', 'pattern', 'marker', 'symbol',
]);

// Attributes that take a URL/reference. They may only point at an internal
// fragment (#id); anything else is an external reference and is rejected.
const REFERENCE_ATTRIBUTES = new Set(['href', 'xlink:href', 'fill', 'stroke', 'clip-path', 'mask', 'marker-start', 'marker-mid', 'marker-end', 'filter']);

interface ElementLike {
  readonly nodeType?: number;
  readonly tagName?: string | null;
  readonly localName?: string | null;
  readonly attributes?: ArrayLike<{name: string; value: string}> | null;
  readonly childNodes?: ArrayLike<ElementLike> | null;
}

const ELEMENT_NODE = 1;

function tagOf(element: ElementLike): string {
  return (element.localName ?? element.tagName ?? '').toLowerCase();
}

function assertSafeReference(attr: string, value: string): void {
  const normalized = normalizeCssValue(value).trim().toLowerCase();
  // bare internal fragment, or url(#fragment) — safe (no network).
  if (/^#[a-z0-9_-]+$/i.test(normalized)) return;
  const urlMatch = normalized.match(/^url\(\s*['"]?([^'")]*)['"]?\s*\)$/);
  if (urlMatch) {
    if (urlMatch[1]!.startsWith('#')) return; // internal fragment ref
    throw new SvgViolation(`SVG attribute "${attr}" references an external url().`);
  }
  // plain presentational values (colors, none, currentColor, numbers) — allowed
  if (/[a-z][a-z0-9+.-]*:/.test(normalized) || normalized.includes('//') || normalized.includes('url(')) {
    throw new SvgViolation(`SVG attribute "${attr}" references an external resource.`);
  }
}

function validateElement(element: ElementLike): void {
  const tag = tagOf(element);
  if (!ALLOWED_ELEMENTS.has(tag)) {
    throw new SvgViolation(`SVG element <${tag || '?'}> is not in the safe subset.`);
  }
  const attributes = element.attributes ?? [];
  for (let i = 0; i < attributes.length; i++) {
    const {name, value} = attributes[i]!;
    const attr = name.toLowerCase();
    if (attr.startsWith('on')) {
      throw new SvgViolation(`SVG event-handler attribute "${name}" is not allowed.`);
    }
    if (attr === 'style') {
      // reuse the CSS pipeline for inline presentation styles
      // (throws CssViolation, which we surface as an SVG violation)
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        validateInlineStyle(value);
      } catch (error) {
        throw new SvgViolation(`SVG style attribute rejected: ${(error as Error).message}`);
      }
      continue;
    }
    if (REFERENCE_ATTRIBUTES.has(attr)) assertSafeReference(name, value);
  }
  const children = element.childNodes ?? [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child.nodeType === ELEMENT_NODE || child.tagName) validateElement(child);
  }
}

// Lazy import to avoid a cycle at module load; validateStylesheet lives in
// css-validator and throws CssViolation on any url/scheme construct.
function validateInlineStyle(styleText: string): void {
  // Deferred require keeps this file importable in isolation/tests.
  const {validateStylesheet} = require('./css-validator') as typeof import('./css-validator');
  validateStylesheet(`svg{${styleText}}`);
}

export function validateSvgDocument(root: ElementLike): void {
  if (tagOf(root) !== 'svg') {
    throw new SvgViolation('Root element must be <svg>.');
  }
  validateElement(root);
}

const MAX_SVG_BYTES = 256_000;

// Browser-side sanitizer used by the ui-svg renderer: parse author markup, validate
// it against the safe subset, and return the RE-SERIALIZED validated tree (so what
// renders is exactly what was validated). Returns null if rejected — the renderer
// then shows a fallback instead of any author markup.
export function sanitizeSvgMarkup(markup: string): string | null {
  if (typeof markup !== 'string' || markup.length === 0 || markup.length > MAX_SVG_BYTES) return null;
  try {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const root = doc.documentElement as unknown as ElementLike & {getElementsByTagName?: (n: string) => ArrayLike<unknown>};
    // DOMParser reports XML errors as a <parsererror> element rather than throwing.
    if (!root || tagOf(root) === 'parsererror') return null;
    if (root.getElementsByTagName && root.getElementsByTagName('parsererror').length > 0) return null;
    validateSvgDocument(root);
    return new XMLSerializer().serializeToString(root as unknown as Node);
  } catch {
    return null;
  }
}

export {CssViolation};
