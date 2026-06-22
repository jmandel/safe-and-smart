// CSS validator for author-supplied styles (CSS Modules / inline style objects).
// The sandbox allows NO author-controlled external references in CSS — every
// resource an applet renders comes from a vetted host component, never from a
// stylesheet. So this rejects every URL-bearing or root-escaping construct, and
// defeats the classic obfuscations (inline comments, CSS escapes, custom-property
// indirection) by normalizing values before matching. Parsing uses postcss so
// strings/comments/at-rules are handled structurally rather than by raw regex.
import postcss from 'postcss';

export class CssViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CssViolation';
  }
}

// Only layout/animation at-rules are permitted; @import/@font-face/@charset/etc.
// (resource-bearing or document-affecting) are rejected.
const ALLOWED_AT_RULES = new Set(['media', 'container', 'supports', 'keyframes', '-webkit-keyframes']);

// Functions that fetch or reference a resource / evaluate script.
const FORBIDDEN_FUNCTIONS = [
  'url',
  'image-set',
  '-webkit-image-set',
  'image',
  'cross-fade',
  '-webkit-cross-fade',
  'element',
  '-moz-element',
  '-moz-image-rect',
  'expression',
  'paint',
];

const FORBIDDEN_PROPERTIES = ['behavior', '-moz-binding', '-ms-behavior', '-o-link', '-o-link-source'];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Strip CSS comments and decode CSS escapes, so `ur/**/l(...)` and `\75 rl(...)`
// both normalize to `url(...)` before we match against the denylist.
export function normalizeCssValue(value: string): string {
  const withoutComments = value.replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutComments.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([\s\S])/g, (_match, hex, char) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : char,
  );
}

function assertSafeValue(property: string, rawValue: string): void {
  const value = normalizeCssValue(rawValue).toLowerCase();
  for (const fn of FORBIDDEN_FUNCTIONS) {
    if (new RegExp(`(^|[^a-z0-9-])${escapeRegExp(fn)}\\s*\\(`).test(value)) {
      throw new CssViolation(`CSS value for "${property}" uses the forbidden function ${fn}().`);
    }
  }
  // Any URL scheme, protocol-relative reference, or known dangerous scheme.
  if (
    /\b[a-z][a-z0-9+.-]*:\/\//.test(value) ||
    /(^|[\s:,(])\/\//.test(value) ||
    /(javascript|data|vbscript|blob|file|filesystem|about):/.test(value)
  ) {
    throw new CssViolation(`CSS value for "${property}" appears to reference an external resource.`);
  }
}

export function validateStylesheet(css: string): void {
  let root: postcss.Root;
  try {
    root = postcss.parse(css);
  } catch (error) {
    throw new CssViolation(`CSS failed to parse: ${(error as Error).message}`);
  }
  root.walkAtRules((atRule) => {
    if (!ALLOWED_AT_RULES.has(atRule.name.toLowerCase())) {
      throw new CssViolation(`@${atRule.name} rules are not allowed in applet CSS.`);
    }
  });
  root.walkDecls((decl) => {
    const property = decl.prop.toLowerCase();
    if (FORBIDDEN_PROPERTIES.includes(property) || property.includes('binding')) {
      throw new CssViolation(`CSS property "${decl.prop}" is not allowed.`);
    }
    assertSafeValue(decl.prop, decl.value);
  });
}

// Validator for React inline style objects (style={{ … }}). Custom-property keys
// (--x) are validated too, since a later `var(--x)` could re-introduce the value.
export function validateStyleObject(style: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(style)) {
    if (key.toLowerCase().includes('binding')) {
      throw new CssViolation(`style key "${key}" is not allowed.`);
    }
    if (typeof value === 'string') assertSafeValue(key, value);
  }
}
