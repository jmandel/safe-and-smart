// AUTO-GENERATED from src/shared/safe-dom-schema.ts (v1.0.0).
// Do not edit by hand — run `bun tools/generate-schema-types.ts`.
// Declares the Safe DOM intrinsic elements so applet authors can write
// `<ui-stack gap={12}>…</ui-stack>` with full type-checking. The runtime binding
// for intrinsic JSX lands in Phase 2 (@safe-smart/react); these types describe the
// surface the host mutation firewall enforces today.
import type {} from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
  'ui-stack': {
    gap?: number;
    direction?: string;
    align?: string;
    justify?: string;
    children?: unknown;
  };
  'ui-grid': {
    columns?: number;
    minimumColumnWidth?: number;
    gap?: number;
    children?: unknown;
  };
  'ui-card': {
    tone?: string;
    padding?: number;
    children?: unknown;
  };
  'ui-heading': {
    level?: number;
    children?: unknown;
  };
  'ui-text': {
    tone?: string;
    weight?: string;
    size?: string;
    children?: unknown;
  };
  'ui-badge': {
    tone?: string;
    children?: unknown;
  };
  'ui-alert': {
    tone?: string;
    title?: string;
    children?: unknown;
  };
  'ui-button': {
    variant?: string;
    disabled?: boolean;
    onPress?: (event: unknown) => void;
    children?: unknown;
  };
  'ui-select': {
    label?: string;
    value?: string;
    options?: readonly unknown[];
    disabled?: boolean;
    onChange?: (event: unknown) => void;
  };
  'ui-slider': {
    label?: string;
    value?: number;
    minimum?: number;
    maximum?: number;
    step?: number;
    onChange?: (event: unknown) => void;
  };
  'ui-stat': {
    label?: string;
    value?: string;
    detail?: string;
  };
  'ui-table': {
    caption?: string;
    columns?: readonly unknown[];
    rows?: readonly unknown[];
  };
  'ui-vega': {
    spec?: Record<string, unknown>;
    ariaLabel?: string;
    minimumHeight?: number;
  };
  'ui-code': {
    language?: string;
    children?: unknown;
  };
    }
  }
}
