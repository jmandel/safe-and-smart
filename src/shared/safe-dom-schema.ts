// Versioned Safe DOM schema — the single source of truth for the applet UI
// surface. The worker builds its remote custom elements from this (so an applet
// can only construct declared elements with declared props), and the host builds
// its mutation firewall from the SAME data (so raw, low-level mutations that
// bypass the worker element layer still cannot introduce an undeclared element,
// property, or event). Keeping both sides on one schema is what prevents drift
// between "what the applet can express" and "what the host will accept".
//
// Bump SAFE_DOM_SCHEMA_VERSION on any change; the handshake can use it to refuse
// an applet built against an incompatible surface.
export const SAFE_DOM_SCHEMA_VERSION = '1.7.0';

export type SafePropType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface SafeElementSchema {
  /** Allowed instance properties (name → declared value type). */
  readonly properties: Readonly<Record<string, SafePropType>>;
  /** Allowed event names (dispatched as event-listener properties). */
  readonly events: readonly string[];
  /** React-facing event prop bindings (onX → event name). */
  readonly eventProps?: Readonly<Record<string, string>>;
  /** Whether this element may contain children. */
  readonly children: boolean;
}

// Structural/host elements that are always part of the tree but carry no
// applet-author props. They must be accepted by the firewall.
export const STRUCTURAL_TAGS = ['remote-root', 'remote-fragment'] as const;

// Note on styling: `style` and `className` are validated by VALUE (not just by
// name) — `style` through validateStyleObject, `className` through a token check.
// That gating lives in safe-dom-firewall.ts (validateStyleableProp).

export const SAFE_DOM_SCHEMA: Readonly<Record<string, SafeElementSchema>> = {
  // Styleable layout/text primitives: the honest escape hatch from enumerated
  // props. They accept a validated `style` object and `className` (resolved against
  // an applet-registered, validated, scoped stylesheet).
  'ui-box': {
    properties: {style: 'object', className: 'string'},
    events: [],
    children: true,
  },
  'ui-inline': {
    properties: {style: 'object', className: 'string'},
    events: [],
    children: true,
  },
  'ui-stack': {
    properties: {gap: 'number', direction: 'string', align: 'string', justify: 'string'},
    events: [],
    children: true,
  },
  'ui-grid': {
    properties: {columns: 'number', minimumColumnWidth: 'number', gap: 'number'},
    events: [],
    children: true,
  },
  'ui-card': {
    properties: {tone: 'string', padding: 'number'},
    events: [],
    children: true,
  },
  'ui-heading': {
    properties: {level: 'number'},
    events: [],
    children: true,
  },
  'ui-text': {
    properties: {tone: 'string', weight: 'string', size: 'string'},
    events: [],
    children: true,
  },
  'ui-badge': {
    properties: {tone: 'string'},
    events: [],
    children: true,
  },
  'ui-alert': {
    properties: {tone: 'string', title: 'string'},
    events: [],
    children: true,
  },
  'ui-button': {
    properties: {variant: 'string', disabled: 'boolean'},
    events: ['press', 'keydown'],
    eventProps: {onPress: 'press', onKeyDown: 'keydown'},
    children: true,
  },
  'ui-select': {
    properties: {label: 'string', value: 'string', options: 'array', disabled: 'boolean'},
    events: ['change'],
    eventProps: {onChange: 'change'},
    children: false,
  },
  'ui-slider': {
    properties: {
      label: 'string',
      value: 'number',
      minimum: 'number',
      maximum: 'number',
      step: 'number',
    },
    events: ['change'],
    eventProps: {onChange: 'change'},
    children: false,
  },
  'ui-input': {
    properties: {
      label: 'string',
      value: 'string',
      placeholder: 'string',
      inputType: 'string', // text | number | search | tel | email | date
      disabled: 'boolean',
      autoFocus: 'boolean',
      invalid: 'boolean',
    },
    events: ['change', 'input', 'focus', 'blur', 'keydown'],
    eventProps: {
      onChange: 'change',
      onInput: 'input',
      onFocus: 'focus',
      onBlur: 'blur',
      onKeyDown: 'keydown',
    },
    children: false,
  },
  'ui-textarea': {
    properties: {
      label: 'string',
      value: 'string',
      placeholder: 'string',
      rows: 'number',
      disabled: 'boolean',
    },
    events: ['change', 'input', 'focus', 'blur', 'keydown'],
    eventProps: {
      onChange: 'change',
      onInput: 'input',
      onFocus: 'focus',
      onBlur: 'blur',
      onKeyDown: 'keydown',
    },
    children: false,
  },
  'ui-stat': {
    properties: {label: 'string', value: 'string', detail: 'string'},
    events: [],
    children: false,
  },
  'ui-table': {
    properties: {caption: 'string', columns: 'array', rows: 'array'},
    events: [],
    children: false,
  },
  'ui-vega': {
    properties: {spec: 'object', ariaLabel: 'string', minimumHeight: 'number'},
    events: [],
    children: false,
  },
  'ui-svg': {
    // `markup` is author SVG; the renderer parses + validates it against the safe
    // subset (no script/handlers/external refs) and re-serializes before render.
    properties: {markup: 'string', ariaLabel: 'string'},
    events: [],
    children: false,
  },
  'ui-image': {
    // `src` is a self-contained data: URL the applet already has (e.g. inline FHIR
    // Attachment.data). The firewall validates it to be `data:` only — a remote or
    // relative src is rejected, so an image can never make a network request. There
    // is deliberately no host-side "fetch this URL" path (that would be exfil).
    properties: {src: 'string', alt: 'string'},
    events: [],
    children: false,
  },
  'ui-code': {
    properties: {language: 'string'},
    events: [],
    children: true,
  },
};

// Resource quotas for a single applet render tree (defense against
// mutation-flood / deep-tree resource exhaustion). The total mutation budget is
// enforced separately by the connection gateway.
export const SAFE_DOM_QUOTAS = {
  maxNodes: 20_000,
  maxDepth: 100,
  maxTextLength: 100_000,
} as const;

export function isStructuralTag(tag: string): boolean {
  return (STRUCTURAL_TAGS as readonly string[]).includes(tag);
}
