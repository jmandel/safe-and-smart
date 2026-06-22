// @safe-smart/react — the applet-facing JSX runtime. It lets applet authors write
// ordinary intrinsic TSX (`<ui-stack gap={12}><ui-button onPress={…}/>`) with NO
// Remote DOM imports: for any `ui-*` string tag it substitutes the event-wired
// bound component from TAG_TO_COMPONENT; every other tag/type defers to React's
// own runtime. An undeclared `ui-*` tag throws here (fail-closed) rather than
// reaching the host as an unknown element.
//
// Use via the automatic runtime: set `jsxImportSource` to this package, or add a
// per-file pragma `/** @jsxImportSource ../safe-react */`.
import {jsx as reactJsx, jsxs as reactJsxs, Fragment} from 'react/jsx-runtime';
import {TAG_TO_COMPONENT} from '../remote-elements';

export {Fragment};

function resolve(type: unknown): unknown {
  if (typeof type !== 'string') return type;
  if (type.startsWith('ui-')) {
    const component = TAG_TO_COMPONENT[type];
    if (!component) {
      throw new Error(`<${type}> is not a Safe DOM element. See safe-dom-intrinsics.d.ts for the allowed surface.`);
    }
    return component;
  }
  return type;
}

export function jsx(type: unknown, props: unknown, key?: unknown): unknown {
  return reactJsx(resolve(type) as never, props as never, key as never);
}

export function jsxs(type: unknown, props: unknown, key?: unknown): unknown {
  return reactJsxs(resolve(type) as never, props as never, key as never);
}
