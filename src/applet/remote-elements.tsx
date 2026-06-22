import {
  RemoteFragmentElement,
  RemoteRootElement,
  createRemoteElement,
} from '@remote-dom/core/elements';
import {createRemoteComponent} from '@remote-dom/react';
import type {ComponentType} from 'react';

export const RootElement = RemoteRootElement;

export const StackElement = createRemoteElement({
  properties: {
    gap: {type: Number},
    direction: {type: String},
    align: {type: String},
    justify: {type: String},
  },
});

export const GridElement = createRemoteElement({
  properties: {
    columns: {type: Number},
    minimumColumnWidth: {type: Number},
    gap: {type: Number},
  },
});

export const CardElement = createRemoteElement({
  properties: {
    tone: {type: String},
    padding: {type: Number},
  },
});

export const HeadingElement = createRemoteElement({
  properties: {level: {type: Number}},
});

export const TextElement = createRemoteElement({
  properties: {
    tone: {type: String},
    weight: {type: String},
    size: {type: String},
  },
});

export const BadgeElement = createRemoteElement({
  properties: {tone: {type: String}},
});

export const AlertElement = createRemoteElement({
  properties: {tone: {type: String}, title: {type: String}},
});

export const ButtonElement = createRemoteElement({
  properties: {
    variant: {type: String},
    disabled: {type: Boolean},
  },
  events: ['press'],
});

export const SelectElement = createRemoteElement({
  properties: {
    label: {type: String},
    value: {type: String},
    options: {type: Array},
    disabled: {type: Boolean},
  },
  events: ['change'],
});

export const SliderElement = createRemoteElement({
  properties: {
    label: {type: String},
    value: {type: Number},
    minimum: {type: Number},
    maximum: {type: Number},
    step: {type: Number},
  },
  events: ['change'],
});

export const StatElement = createRemoteElement({
  properties: {
    label: {type: String},
    value: {type: String},
    detail: {type: String},
  },
});

export const TableElement = createRemoteElement({
  properties: {
    caption: {type: String},
    columns: {type: Array},
    rows: {type: Array},
  },
});

export const VegaElement = createRemoteElement({
  properties: {
    spec: {type: Object},
    ariaLabel: {type: String},
    minimumHeight: {type: Number},
  },
});

export const CodeElement = createRemoteElement({
  properties: {language: {type: String}},
});

const definitions: Array<[string, CustomElementConstructor]> = [
  ['remote-root', RootElement],
  ['remote-fragment', RemoteFragmentElement],
  ['ui-stack', StackElement],
  ['ui-grid', GridElement],
  ['ui-card', CardElement],
  ['ui-heading', HeadingElement],
  ['ui-text', TextElement],
  ['ui-badge', BadgeElement],
  ['ui-alert', AlertElement],
  ['ui-button', ButtonElement],
  ['ui-select', SelectElement],
  ['ui-slider', SliderElement],
  ['ui-stat', StatElement],
  ['ui-table', TableElement],
  ['ui-vega', VegaElement],
  ['ui-code', CodeElement],
];

for (const [name, constructor] of definitions) {
  if (!customElements.get(name)) customElements.define(name, constructor);
}

const remoteComponent = createRemoteComponent as unknown as (
  name: string,
  element: CustomElementConstructor,
  options?: unknown,
) => ComponentType<any>;

export const Stack = remoteComponent('ui-stack', StackElement);
export const Grid = remoteComponent('ui-grid', GridElement);
export const Card = remoteComponent('ui-card', CardElement);
export const Heading = remoteComponent('ui-heading', HeadingElement);
export const Text = remoteComponent('ui-text', TextElement);
export const Badge = remoteComponent('ui-badge', BadgeElement);
export const Alert = remoteComponent('ui-alert', AlertElement);
export const Button = remoteComponent('ui-button', ButtonElement, {
  eventProps: {onPress: {event: 'press'}},
});
export const Select = remoteComponent('ui-select', SelectElement, {
  eventProps: {onChange: {event: 'change'}},
});
export const Slider = remoteComponent('ui-slider', SliderElement, {
  eventProps: {onChange: {event: 'change'}},
});
export const Stat = remoteComponent('ui-stat', StatElement);
export const Table = remoteComponent('ui-table', TableElement);
export const Vega = remoteComponent('ui-vega', VegaElement);
export const Code = remoteComponent('ui-code', CodeElement);
