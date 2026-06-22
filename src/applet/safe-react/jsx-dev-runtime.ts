// Dev variant of the @safe-smart/react runtime (see jsx-runtime.ts). Maps `ui-*`
// intrinsics to the bound components, then defers to React's jsxDEV.
import {jsxDEV as reactJsxDEV, Fragment} from 'react/jsx-dev-runtime';
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

export function jsxDEV(
  type: unknown,
  props: unknown,
  key: unknown,
  isStatic: boolean,
  source?: unknown,
  self?: unknown,
): unknown {
  return reactJsxDEV(resolve(type) as never, props as never, key as never, isStatic, source as never, self as never);
}
