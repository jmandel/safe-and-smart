import {describe, expect, it} from 'bun:test';
import {
  toSafeValueEvent,
  toSafeNumberEvent,
  toSafeKeyboardEvent,
  toSafePointerEvent,
  toSafeFocusEvent,
} from '../src/shared/safe-events';

// A hostile "DOM event" that tries to smuggle a live node, a function, and a huge
// string back into the worker through the event payload.
function hostileEvent(extra: Record<string, unknown> = {}) {
  return {
    type: 'change',
    currentTarget: {
      value: 'x'.repeat(1_000_000),
      checked: true,
      ownerDocument: {cookie: 'SECRET'}, // a real DOM node would expose this
      evil() {
        return 'pwned';
      },
    },
    ...extra,
  } as never;
}

describe('safe event snapshots', () => {
  it('emits only primitive fields (no DOM nodes, no functions)', () => {
    const safe = toSafeValueEvent(hostileEvent());
    expect(Object.keys(safe).sort()).toEqual(['checked', 'type', 'value']);
    for (const v of Object.values(safe)) {
      expect(['string', 'number', 'boolean']).toContain(typeof v);
    }
    // structured-clone must succeed (proves it can cross the MessagePort).
    expect(() => structuredClone(safe)).not.toThrow();
  });

  it('bounds string lengths', () => {
    const safe = toSafeValueEvent(hostileEvent());
    expect(safe.value.length).toBeLessThanOrEqual(8_192);
    const key = toSafeKeyboardEvent({type: 'keydown', key: 'a'.repeat(500), code: 'b'.repeat(500)} as never);
    expect(key.key.length).toBeLessThanOrEqual(64);
    expect(key.code.length).toBeLessThanOrEqual(64);
  });

  it('coerces numeric and boolean fields safely', () => {
    expect(toSafeNumberEvent({type: 'change', currentTarget: {value: '42'}} as never).value).toBe(42);
    expect(toSafeNumberEvent({type: 'change', currentTarget: {value: 'NaN'}} as never).value).toBe(0);
    const ptr = toSafePointerEvent({type: 'press', button: 1, shiftKey: true} as never);
    expect(ptr.button).toBe(1);
    expect(ptr.shiftKey).toBe(true);
    expect(ptr.altKey).toBe(false);
  });

  it('keyboard snapshot carries modifiers and repeat as booleans', () => {
    const key = toSafeKeyboardEvent({type: 'keydown', key: 'Enter', code: 'Enter', ctrlKey: true, repeat: true} as never);
    expect(key).toMatchObject({type: 'keydown', key: 'Enter', code: 'Enter', ctrlKey: true, repeat: true, altKey: false});
    // non-boolean modifiers coerce to false (fail-safe), never leak the raw value
    const coerced = toSafeKeyboardEvent({type: 'keydown', key: 'a', code: 'KeyA', shiftKey: 1 as never} as never);
    expect(coerced.shiftKey).toBe(false);
  });

  it('focus snapshot clips the value', () => {
    const focus = toSafeFocusEvent({type: 'focus', target: {value: 'y'.repeat(100_000)}} as never);
    expect(focus.value.length).toBeLessThanOrEqual(8_192);
  });
});
