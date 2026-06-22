import {
  RemoteFragmentElement,
  RemoteRootElement,
  createRemoteElement,
} from '@remote-dom/core/elements';
import {createRemoteComponent} from '@remote-dom/react';
import type {ComponentType} from 'react';
import {
  SAFE_DOM_SCHEMA,
  type SafePropType,
} from '../shared/safe-dom-schema';

export const RootElement = RemoteRootElement;

// Worker remote elements are GENERATED from the Safe DOM schema (the same data the
// host firewall validates against), so the applet-constructible surface and the
// host-accepted surface cannot drift apart.
const PROP_CONSTRUCTOR: Record<SafePropType, unknown> = {
  string: String,
  number: Number,
  boolean: Boolean,
  array: Array,
  object: Object,
};

function buildElement(schemaProps: Record<string, SafePropType>, events: readonly string[]) {
  const properties: Record<string, {type: unknown}> = {};
  for (const [name, type] of Object.entries(schemaProps)) {
    properties[name] = {type: PROP_CONSTRUCTOR[type]};
  }
  return createRemoteElement({properties, events: [...events]} as never);
}

const elementConstructors = new Map<string, CustomElementConstructor>();
for (const [tag, schema] of Object.entries(SAFE_DOM_SCHEMA)) {
  elementConstructors.set(tag, buildElement(schema.properties, schema.events) as CustomElementConstructor);
}

const definitions: Array<[string, CustomElementConstructor]> = [
  ['remote-root', RootElement],
  ['remote-fragment', RemoteFragmentElement],
  ...[...elementConstructors.entries()],
];

for (const [name, constructor] of definitions) {
  if (!customElements.get(name)) customElements.define(name, constructor);
}

const remoteComponent = createRemoteComponent as unknown as (
  name: string,
  element: CustomElementConstructor,
  options?: unknown,
) => ComponentType<any>;

function bind(tag: string): ComponentType<any> {
  const schema = SAFE_DOM_SCHEMA[tag]!;
  const element = elementConstructors.get(tag)!;
  const options = schema.eventProps
    ? {
        eventProps: Object.fromEntries(
          Object.entries(schema.eventProps).map(([prop, event]) => [prop, {event}]),
        ),
      }
    : undefined;
  return remoteComponent(tag, element, options);
}

// Tag → bound component map, consumed by the @safe-smart/react JSX runtime so
// applets can write intrinsic <ui-stack> JSX (no Remote DOM imports) and still get
// the event-wired bindings.
export const TAG_TO_COMPONENT: Record<string, ComponentType<any>> = {};
for (const tag of Object.keys(SAFE_DOM_SCHEMA)) TAG_TO_COMPONENT[tag] = bind(tag);

// Named bindings applets import (same instances as TAG_TO_COMPONENT).
export const Box = TAG_TO_COMPONENT['ui-box']!;
export const Inline = TAG_TO_COMPONENT['ui-inline']!;
export const Stack = TAG_TO_COMPONENT['ui-stack']!;
export const Grid = TAG_TO_COMPONENT['ui-grid']!;
export const Card = TAG_TO_COMPONENT['ui-card']!;
export const Heading = TAG_TO_COMPONENT['ui-heading']!;
export const Text = TAG_TO_COMPONENT['ui-text']!;
export const Badge = TAG_TO_COMPONENT['ui-badge']!;
export const Alert = TAG_TO_COMPONENT['ui-alert']!;
export const Button = TAG_TO_COMPONENT['ui-button']!;
export const Select = TAG_TO_COMPONENT['ui-select']!;
export const Slider = TAG_TO_COMPONENT['ui-slider']!;
export const Stat = TAG_TO_COMPONENT['ui-stat']!;
export const Table = TAG_TO_COMPONENT['ui-table']!;
export const Vega = TAG_TO_COMPONENT['ui-vega']!;
export const Code = TAG_TO_COMPONENT['ui-code']!;
