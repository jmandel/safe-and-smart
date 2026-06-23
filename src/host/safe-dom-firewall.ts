// Host-side mutation firewall — the Safe DOM kernel. Every Remote DOM mutation
// record is validated against SAFE_DOM_SCHEMA *before* it reaches the receiver, so
// an applet that bypasses the worker element layer and drives the raw connection
// directly still cannot introduce an undeclared element, property, attribute, or
// event, nor blow past tree/text quotas. This is what makes the gate property
// "raw low-level mutations cannot bypass host policy" true rather than reliant on
// each host renderer being individually careful with the props it consumes.
import {
  SAFE_DOM_SCHEMA,
  SAFE_DOM_QUOTAS,
  isStructuralTag,
  type SafeElementSchema,
} from '../shared/safe-dom-schema';
import {validateStyleObject, CssViolation} from './css-validator';

// Styled props are validated by VALUE here, not just by name. `style` runs through
// the CSS value validator; `className` must be a bounded list of safe tokens.
const CLASSNAME_TOKEN = /^[A-Za-z0-9_-]+$/;

function validateStyleableProp(tag: string, property: string, value: unknown): void {
  if (property === 'style') {
    if (value == null) return;
    if (typeof value !== 'object') {
      throw new SafeDomViolation(`style on <${tag}> must be an object.`);
    }
    try {
      validateStyleObject(value as Record<string, unknown>);
    } catch (error) {
      if (error instanceof CssViolation) {
        throw new SafeDomViolation(`style on <${tag}> rejected: ${error.message}`);
      }
      throw error;
    }
  } else if (property === 'className') {
    if (value == null) return;
    if (typeof value !== 'string' || value.length > 2_000) {
      throw new SafeDomViolation(`className on <${tag}> must be a short string.`);
    }
    for (const token of value.split(/\s+/).filter(Boolean)) {
      if (!CLASSNAME_TOKEN.test(token)) {
        throw new SafeDomViolation(`className token "${token}" on <${tag}> is not allowed.`);
      }
    }
  } else if (property === 'src') {
    // Only self-contained data:image/ URLs (no network, no exfil). A remote/relative
    // URL would be an applet-controlled image source — exactly what we forbid. The
    // image/ MIME prefix is required too: an <img> won't execute a non-image data:
    // URL, but pinning it to image/ keeps the surface to what an image legitimately
    // is and removes any ambiguity. SVG carried this way renders in the browser's
    // image mode (no script, no external resource loads), so even a hostile SVG
    // payload can't phone home.
    if (value == null) return;
    if (typeof value !== 'string' || !/^data:image\//i.test(value)) {
      throw new SafeDomViolation(`src on <${tag}> must be a data:image/ URL.`);
    }
    if (value.length > 16_000_000) {
      throw new SafeDomViolation(`src on <${tag}> exceeds the data: URL size limit.`);
    }
  }
}

// Mutation record + node-kind constants (mirror @remote-dom/core; kept local so
// the firewall has no structural dependency on the library internals).
const MUTATION_TYPE_INSERT_CHILD = 0;
const MUTATION_TYPE_UPDATE_TEXT = 2;
const MUTATION_TYPE_UPDATE_PROPERTY = 3;
const UPDATE_PROPERTY_TYPE_PROPERTY = 1;
const UPDATE_PROPERTY_TYPE_ATTRIBUTE = 2;
const UPDATE_PROPERTY_TYPE_EVENT_LISTENER = 3;
const NODE_TYPE_ELEMENT = 1;

// Remote DOM uses `slot` to position a node in a named slot; it is structural and
// always permitted regardless of element.
const ALWAYS_ALLOWED_PROPERTIES = new Set(['slot']);

export class SafeDomViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeDomViolation';
  }
}

interface SerializedNode {
  id?: string;
  type?: number;
  element?: string;
  properties?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  eventListeners?: Record<string, unknown>;
  children?: readonly SerializedNode[];
  data?: unknown;
}

export interface SafeDomFirewall {
  validateRecords(records: readonly unknown[]): void;
}

export function createSafeDomFirewall(): SafeDomFirewall {
  // Authoritative id → tag map, built from accepted inserts. UPDATE_PROPERTY then
  // validates against the element's real tag, not anything the applet asserts.
  const idToTag = new Map<string, string>();
  let nodeCount = 0;

  function schemaFor(tag: string): SafeElementSchema | undefined {
    return SAFE_DOM_SCHEMA[tag];
  }

  function validateElement(node: SerializedNode, depth: number): void {
    if (depth > SAFE_DOM_QUOTAS.maxDepth) {
      throw new SafeDomViolation(`tree depth exceeds quota (${SAFE_DOM_QUOTAS.maxDepth}).`);
    }
    const tag = node.element ?? '';
    const structural = isStructuralTag(tag);
    const schema = schemaFor(tag);
    if (!structural && !schema) {
      throw new SafeDomViolation(`element <${tag}> is not in the Safe DOM schema.`);
    }

    // Properties: only schema-declared names (structural elements declare none).
    for (const [name, value] of Object.entries(node.properties ?? {})) {
      if (ALWAYS_ALLOWED_PROPERTIES.has(name)) continue;
      if (!schema || !(name in schema.properties)) {
        throw new SafeDomViolation(`property "${name}" is not allowed on <${tag}>.`);
      }
      validateStyleableProp(tag, name, value);
    }
    // Attributes are not part of the Safe DOM surface at all — reject any.
    if (node.attributes && Object.keys(node.attributes).length > 0) {
      throw new SafeDomViolation(`raw attributes are not allowed (on <${tag}>).`);
    }
    // Event listeners: only schema-declared events.
    for (const event of Object.keys(node.eventListeners ?? {})) {
      if (!schema || !schema.events.includes(event)) {
        throw new SafeDomViolation(`event "${event}" is not allowed on <${tag}>.`);
      }
    }

    if (node.id != null) idToTag.set(node.id, tag);
    if (++nodeCount > SAFE_DOM_QUOTAS.maxNodes) {
      throw new SafeDomViolation(`node count exceeds quota (${SAFE_DOM_QUOTAS.maxNodes}).`);
    }

    const children = node.children ?? [];
    if (schema && !schema.children && children.length > 0) {
      throw new SafeDomViolation(`<${tag}> may not contain children.`);
    }
    for (const child of children) validateNode(child, depth + 1);
  }

  function validateNode(node: SerializedNode, depth: number): void {
    if (node?.type === NODE_TYPE_ELEMENT) {
      validateElement(node, depth);
      return;
    }
    // Text / comment node.
    if (typeof node?.data === 'string' && node.data.length > SAFE_DOM_QUOTAS.maxTextLength) {
      throw new SafeDomViolation(`text node exceeds length quota (${SAFE_DOM_QUOTAS.maxTextLength}).`);
    }
    if (++nodeCount > SAFE_DOM_QUOTAS.maxNodes) {
      throw new SafeDomViolation(`node count exceeds quota (${SAFE_DOM_QUOTAS.maxNodes}).`);
    }
  }

  function validateRecord(record: readonly unknown[]): void {
    const type = record[0];
    switch (type) {
      case MUTATION_TYPE_INSERT_CHILD: {
        // [type, parentId, child, index]
        validateNode(record[2] as SerializedNode, 0);
        return;
      }
      case MUTATION_TYPE_UPDATE_PROPERTY: {
        // [type, id, property, value, propertyType?]
        const id = record[1] as string;
        const property = record[2] as string;
        const propertyType = (record[4] as number) ?? UPDATE_PROPERTY_TYPE_PROPERTY;
        const tag = idToTag.get(id);
        // Unknown id → the receiver itself will drop the late mutation; nothing to gate.
        if (tag == null) return;
        const schema = schemaFor(tag);
        if (propertyType === UPDATE_PROPERTY_TYPE_ATTRIBUTE) {
          throw new SafeDomViolation(`attribute updates are not allowed (on <${tag}>).`);
        }
        if (propertyType === UPDATE_PROPERTY_TYPE_EVENT_LISTENER) {
          if (!schema || !schema.events.includes(property)) {
            throw new SafeDomViolation(`event "${property}" is not allowed on <${tag}>.`);
          }
          return;
        }
        // UPDATE_PROPERTY_TYPE_PROPERTY
        if (ALWAYS_ALLOWED_PROPERTIES.has(property)) return;
        if (!schema || !(property in schema.properties)) {
          throw new SafeDomViolation(`property "${property}" is not allowed on <${tag}>.`);
        }
        validateStyleableProp(tag, property, record[3]);
        return;
      }
      case MUTATION_TYPE_UPDATE_TEXT: {
        const text = record[2];
        if (typeof text === 'string' && text.length > SAFE_DOM_QUOTAS.maxTextLength) {
          throw new SafeDomViolation(`text update exceeds length quota (${SAFE_DOM_QUOTAS.maxTextLength}).`);
        }
        return;
      }
      // MUTATION_TYPE_REMOVE_CHILD and any other record: structurally safe.
    }
  }

  return {
    validateRecords(records) {
      for (const record of records) {
        if (Array.isArray(record)) validateRecord(record);
      }
    },
  };
}
