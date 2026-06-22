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

// Named bindings applets import. (Generated from the schema above.)
export const Stack = bind('ui-stack');
export const Grid = bind('ui-grid');
export const Card = bind('ui-card');
export const Heading = bind('ui-heading');
export const Text = bind('ui-text');
export const Badge = bind('ui-badge');
export const Alert = bind('ui-alert');
export const Button = bind('ui-button');
export const Select = bind('ui-select');
export const Slider = bind('ui-slider');
export const Stat = bind('ui-stat');
export const Table = bind('ui-table');
export const Vega = bind('ui-vega');
export const Code = bind('ui-code');
