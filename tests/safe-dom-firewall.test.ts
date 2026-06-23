import {describe, expect, it} from 'bun:test';
import {createSafeDomFirewall, SafeDomViolation} from '../src/host/safe-dom-firewall';

// Mutation record + node-kind constants (mirror @remote-dom/core).
const INSERT = 0;
const UPDATE_TEXT = 2;
const UPDATE_PROPERTY = 3;
const PROP = 1;
const ATTRIBUTE = 2;
const EVENT = 3;
const ELEMENT = 1;
const TEXT = 3;

const el = (id: string, element: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: ELEMENT,
  element,
  children: [],
  ...extra,
});
const insert = (child: unknown) => [INSERT, '~', child, 0];

describe('createSafeDomFirewall', () => {
  it('accepts declared elements, properties, and events', () => {
    const fw = createSafeDomFirewall();
    expect(() =>
      fw.validateRecords([
        insert(el('a', 'ui-stack', {properties: {gap: 12, direction: 'column'}})),
        insert(el('b', 'ui-button', {properties: {variant: 'primary'}, eventListeners: {press: () => {}}})),
        insert({id: 't', type: TEXT, data: 'hello'}),
      ]),
    ).not.toThrow();
  });

  it('rejects an undeclared element', () => {
    const fw = createSafeDomFirewall();
    expect(() => fw.validateRecords([insert(el('x', 'evil-frame'))])).toThrow(SafeDomViolation);
    expect(() => fw.validateRecords([insert(el('x', 'img'))])).toThrow(/not in the Safe DOM schema/);
  });

  it('rejects an undeclared property even on a known element', () => {
    const fw = createSafeDomFirewall();
    expect(() =>
      fw.validateRecords([insert(el('x', 'ui-button', {properties: {onclick: 'steal()'}}))]),
    ).toThrow(/property "onclick" is not allowed/);
  });

  it('rejects raw attributes and undeclared events', () => {
    const fw = createSafeDomFirewall();
    expect(() =>
      fw.validateRecords([insert(el('x', 'ui-text', {attributes: {href: 'http://evil'}}))]),
    ).toThrow(/attributes are not allowed/);
    expect(() =>
      fw.validateRecords([insert(el('x', 'ui-button', {eventListeners: {auxclick: () => {}}}))]),
    ).toThrow(/event "auxclick" is not allowed/);
  });

  it('validates UPDATE_PROPERTY against the real tag of the inserted node', () => {
    const fw = createSafeDomFirewall();
    fw.validateRecords([insert(el('btn', 'ui-button'))]);
    expect(() => fw.validateRecords([[UPDATE_PROPERTY, 'btn', 'variant', 'primary', PROP]])).not.toThrow();
    expect(() => fw.validateRecords([[UPDATE_PROPERTY, 'btn', 'href', 'http://evil', PROP]])).toThrow(
      /property "href" is not allowed/,
    );
    expect(() => fw.validateRecords([[UPDATE_PROPERTY, 'btn', 'style', 'x', ATTRIBUTE]])).toThrow(
      /attribute updates are not allowed/,
    );
    expect(() => fw.validateRecords([[UPDATE_PROPERTY, 'btn', 'press', () => {}, EVENT]])).not.toThrow();
    expect(() => fw.validateRecords([[UPDATE_PROPERTY, 'btn', 'wheel', () => {}, EVENT]])).toThrow(
      /event "wheel" is not allowed/,
    );
  });

  it('rejects children on a leaf element', () => {
    const fw = createSafeDomFirewall();
    expect(() =>
      fw.validateRecords([insert(el('s', 'ui-stat', {children: [el('c', 'ui-text')]}))]),
    ).toThrow(/may not contain children/);
  });

  it('validates styleable props (style object + className token list)', () => {
    const fw = createSafeDomFirewall();
    // safe style + className pass
    expect(() =>
      fw.validateRecords([
        insert(el('a', 'ui-box', {properties: {style: {color: 'red', padding: 8}, className: 'tile warn'}})),
      ]),
    ).not.toThrow();
    // url() in a style value is rejected
    expect(() =>
      fw.validateRecords([insert(el('b', 'ui-box', {properties: {style: {backgroundImage: 'url(http://evil)'}}}))]),
    ).toThrow(/style on <ui-box> rejected/);
    // bad className token rejected
    expect(() =>
      fw.validateRecords([insert(el('c', 'ui-box', {properties: {className: 'ok bad}token'}}))]),
    ).toThrow(/className token/);
    // style/className still gated by the property allowlist on non-styleable tags
    expect(() =>
      fw.validateRecords([insert(el('d', 'ui-stat', {properties: {style: {color: 'red'}}}))]),
    ).toThrow(/property "style" is not allowed/);
    // UPDATE_PROPERTY style is validated against the inserted tag
    fw.validateRecords([insert(el('e', 'ui-box'))]);
    expect(() => fw.validateRecords([[UPDATE_PROPERTY, 'e', 'style', {background: 'url(//evil)'}, PROP]])).toThrow(
      /style on <ui-box> rejected/,
    );
  });

  it('allows a data:image/ src but rejects remote/relative/non-image src', () => {
    const fw = createSafeDomFirewall();
    expect(() =>
      fw.validateRecords([insert(el('a', 'ui-image', {properties: {src: 'data:image/png;base64,AAAA'}}))]),
    ).not.toThrow();
    expect(() =>
      fw.validateRecords([insert(el('s', 'ui-image', {properties: {src: 'data:image/svg+xml;base64,AAAA'}}))]),
    ).not.toThrow();
    expect(() =>
      fw.validateRecords([insert(el('b', 'ui-image', {properties: {src: 'http://evil/x'}}))]),
    ).toThrow(/src on <ui-image> must be a data:image\/ URL/);
    expect(() =>
      fw.validateRecords([insert(el('c', 'ui-image', {properties: {src: 'Binary/123'}}))]),
    ).toThrow(/data:image\/ URL/);
    // a data: URL that isn't an image (e.g. text/html) is rejected too
    expect(() =>
      fw.validateRecords([insert(el('d', 'ui-image', {properties: {src: 'data:text/html,<b>x</b>'}}))]),
    ).toThrow(/data:image\/ URL/);
  });

  it('enforces the text length quota', () => {
    const fw = createSafeDomFirewall();
    const huge = 'x'.repeat(100_001);
    expect(() => fw.validateRecords([[UPDATE_TEXT, 't', huge]])).toThrow(/length quota/);
  });

  it('allows the structural slot property and remote-root/fragment', () => {
    const fw = createSafeDomFirewall();
    expect(() =>
      fw.validateRecords([
        insert(el('r', 'remote-fragment')),
        insert(el('s', 'ui-stack', {properties: {slot: 'main'}})),
      ]),
    ).not.toThrow();
  });
});
