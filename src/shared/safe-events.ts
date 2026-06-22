// Safe event snapshots. Host DOM events are reduced to plain, bounded,
// structured-clonable data BEFORE they cross the MessagePort to the worker applet.
// This is a security property, not just ergonomics: an event handler must never
// be able to pull a live host DOM node, a function, or an unbounded payload back
// into the sandbox. Every field below is a primitive; strings are length-capped.
//
// These shapes are the SyntheticEvent surface applets see; the host renderers call
// the matching builder so no renderer hand-rolls (and forgets to bound) a payload.

const MAX_VALUE_LENGTH = 8_192;

function clip(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_VALUE_LENGTH) : '';
}

export interface SafeEventBase {
  readonly type: string;
}

export interface SafeValueEvent extends SafeEventBase {
  readonly value: string;
  readonly checked: boolean;
}

export interface SafeNumberEvent extends SafeEventBase {
  readonly value: number;
}

export interface SafeKeyboardEvent extends SafeEventBase {
  readonly key: string;
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat: boolean;
}

export interface SafePointerEvent extends SafeEventBase {
  readonly button: number;
  readonly buttons: number;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

export interface SafeFocusEvent extends SafeEventBase {
  readonly value: string;
}

// Minimal structural typing so these builders work against React SyntheticEvents
// and native events alike without importing React's DOM types here.
interface DomLikeTarget {
  value?: unknown;
  checked?: unknown;
}
interface DomLikeEvent {
  type?: string;
  currentTarget?: DomLikeTarget | null;
  target?: DomLikeTarget | null;
  key?: string;
  code?: string;
  button?: number;
  buttons?: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
}

function targetOf(event: DomLikeEvent): DomLikeTarget {
  return event.currentTarget ?? event.target ?? {};
}

export function toSafeValueEvent(event: DomLikeEvent): SafeValueEvent {
  const target = targetOf(event);
  return {type: event.type ?? 'change', value: clip(target.value), checked: target.checked === true};
}

export function toSafeNumberEvent(event: DomLikeEvent): SafeNumberEvent {
  const raw = Number(targetOf(event).value);
  return {type: event.type ?? 'change', value: Number.isFinite(raw) ? raw : 0};
}

export function toSafeKeyboardEvent(event: DomLikeEvent): SafeKeyboardEvent {
  return {
    type: event.type ?? 'keydown',
    key: clip(event.key).slice(0, 64),
    code: clip(event.code).slice(0, 64),
    altKey: event.altKey === true,
    ctrlKey: event.ctrlKey === true,
    metaKey: event.metaKey === true,
    shiftKey: event.shiftKey === true,
    repeat: event.repeat === true,
  };
}

export function toSafePointerEvent(event: DomLikeEvent): SafePointerEvent {
  return {
    type: event.type ?? 'press',
    button: Number.isFinite(event.button) ? Number(event.button) : 0,
    buttons: Number.isFinite(event.buttons) ? Number(event.buttons) : 0,
    altKey: event.altKey === true,
    ctrlKey: event.ctrlKey === true,
    metaKey: event.metaKey === true,
    shiftKey: event.shiftKey === true,
  };
}

export function toSafeFocusEvent(event: DomLikeEvent): SafeFocusEvent {
  return {type: event.type ?? 'focus', value: clip(targetOf(event).value)};
}
