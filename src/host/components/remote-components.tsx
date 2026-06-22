import React, {useEffect, useMemo, useRef, useState} from 'react';
import vegaEmbed, {type VisualizationSpec} from 'vega-embed';
import {expressionInterpreter} from 'vega-interpreter';
import {
  RemoteFragmentRenderer,
  createRemoteComponentRenderer,
  type RemoteComponentRendererMap,
} from '@remote-dom/react/host';
import {sanitizeVegaSpec} from './vega-sanitizer';
import {
  toSafeNumberEvent,
  toSafePointerEvent,
  toSafeValueEvent,
  toSafeKeyboardEvent,
} from '../../shared/safe-events';

function clampNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const StackRenderer = createRemoteComponentRenderer(function StackRenderer({
  gap,
  direction,
  align,
  justify,
  children,
}: any) {
  const safeDirection = enumValue(direction, ['row', 'column'] as const, 'column');
  const safeAlign = enumValue(
    align,
    ['stretch', 'start', 'center', 'end'] as const,
    'stretch',
  );
  const safeJustify = enumValue(
    justify,
    ['start', 'center', 'end', 'space-between'] as const,
    'start',
  );
  return (
    <div
      className="remote-stack"
      style={{
        gap: clampNumber(gap, 12, 0, 48),
        flexDirection: safeDirection,
        alignItems: safeAlign === 'start' ? 'flex-start' : safeAlign === 'end' ? 'flex-end' : safeAlign,
        justifyContent:
          safeJustify === 'start'
            ? 'flex-start'
            : safeJustify === 'end'
              ? 'flex-end'
              : safeJustify,
      }}
    >
      {children}
    </div>
  );
});

const GridRenderer = createRemoteComponentRenderer(function GridRenderer({
  columns,
  minimumColumnWidth,
  gap,
  children,
}: any) {
  const safeColumns = Math.round(clampNumber(columns, 3, 1, 6));
  const minimum = clampNumber(minimumColumnWidth, 180, 120, 420);
  return (
    <div
      className="remote-grid"
      style={{
        gap: clampNumber(gap, 12, 0, 48),
        gridTemplateColumns: `repeat(${safeColumns}, minmax(min(${minimum}px, 100%), 1fr))`,
      }}
    >
      {children}
    </div>
  );
});

const CardRenderer = createRemoteComponentRenderer(function CardRenderer({
  tone,
  padding,
  children,
}: any) {
  const safeTone = enumValue(tone, ['default', 'subtle', 'accent'] as const, 'default');
  return (
    <section
      className={`remote-card remote-card--${safeTone}`}
      style={{padding: clampNumber(padding, 18, 8, 36)}}
    >
      {children}
    </section>
  );
});

const HeadingRenderer = createRemoteComponentRenderer(function HeadingRenderer({
  level,
  children,
}: any) {
  const safeLevel = Math.round(clampNumber(level, 2, 1, 4));
  if (safeLevel === 1) return <h1 className="remote-heading remote-heading--1">{children}</h1>;
  if (safeLevel === 3) return <h3 className="remote-heading remote-heading--3">{children}</h3>;
  if (safeLevel === 4) return <h4 className="remote-heading remote-heading--4">{children}</h4>;
  return <h2 className="remote-heading remote-heading--2">{children}</h2>;
});

const TextRenderer = createRemoteComponentRenderer(function TextRenderer({
  tone,
  weight,
  size,
  children,
}: any) {
  const safeTone = enumValue(tone, ['default', 'muted', 'positive', 'warning'] as const, 'default');
  const safeWeight = enumValue(weight, ['normal', 'medium', 'bold'] as const, 'normal');
  const safeSize = enumValue(size, ['small', 'normal', 'large'] as const, 'normal');
  return (
    <span className={`remote-text remote-text--${safeTone} remote-text--${safeWeight} remote-text--${safeSize}`}>
      {children}
    </span>
  );
});

const BadgeRenderer = createRemoteComponentRenderer(function BadgeRenderer({tone, children}: any) {
  const safeTone = enumValue(tone, ['neutral', 'positive', 'warning', 'info'] as const, 'neutral');
  return <span className={`remote-badge remote-badge--${safeTone}`}>{children}</span>;
});

const AlertRenderer = createRemoteComponentRenderer(function AlertRenderer({
  tone,
  title,
  children,
}: any) {
  const safeTone = enumValue(tone, ['info', 'success', 'warning', 'danger'] as const, 'info');
  return (
    <aside className={`remote-alert remote-alert--${safeTone}`} role="status">
      {title ? <strong>{String(title).slice(0, 200)}</strong> : null}
      <div>{children}</div>
    </aside>
  );
});

const ButtonRenderer = createRemoteComponentRenderer(function ButtonRenderer({
  variant,
  disabled,
  onPress,
  onKeyDown,
  children,
}: any) {
  const safeVariant = enumValue(variant, ['primary', 'secondary', 'quiet'] as const, 'secondary');
  return (
    <button
      type="button"
      className={`remote-button remote-button--${safeVariant}`}
      disabled={Boolean(disabled)}
      onClick={(event) => onPress?.(toSafePointerEvent(event.nativeEvent as never))}
      onKeyDown={(event) => onKeyDown?.(toSafeKeyboardEvent(event.nativeEvent as never))}
    >
      {children}
    </button>
  );
});

type SelectOption = {label: string; value: string};

const SelectRenderer = createRemoteComponentRenderer(function SelectRenderer({
  label,
  value,
  options,
  disabled,
  onChange,
}: any) {
  const safeOptions: SelectOption[] = Array.isArray(options)
    ? options.slice(0, 100).map((option) => ({
        label: String(option?.label ?? option?.value ?? '').slice(0, 120),
        value: String(option?.value ?? '').slice(0, 120),
      }))
    : [];
  const inputId = React.useId();
  return (
    <label className="remote-field" htmlFor={inputId}>
      <span>{String(label ?? '').slice(0, 120)}</span>
      <select
        id={inputId}
        value={String(value ?? '')}
        disabled={Boolean(disabled)}
        onChange={(event) => onChange?.(toSafeValueEvent(event.nativeEvent as never))}
      >
        {safeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
});

const SliderRenderer = createRemoteComponentRenderer(function SliderRenderer({
  label,
  value,
  minimum,
  maximum,
  step,
  onChange,
}: any) {
  const safeMinimum = clampNumber(minimum, 0, -10_000, 10_000);
  const safeMaximum = Math.max(safeMinimum, clampNumber(maximum, 100, -10_000, 10_000));
  const safeValue = clampNumber(value, safeMinimum, safeMinimum, safeMaximum);
  const inputId = React.useId();
  return (
    <label className="remote-field remote-field--slider" htmlFor={inputId}>
      <span>
        {String(label ?? '').slice(0, 120)} <output>{safeValue}</output>
      </span>
      <input
        id={inputId}
        type="range"
        min={safeMinimum}
        max={safeMaximum}
        step={clampNumber(step, 1, 0.01, 1000)}
        value={safeValue}
        onChange={(event) => onChange?.(toSafeNumberEvent(event.nativeEvent as never))}
      />
    </label>
  );
});

const StatRenderer = createRemoteComponentRenderer(function StatRenderer({label, value, detail}: any) {
  return (
    <div className="remote-stat">
      <span>{String(label ?? '').slice(0, 120)}</span>
      <strong>{String(value ?? '').slice(0, 120)}</strong>
      {detail ? <small>{String(detail).slice(0, 200)}</small> : null}
    </div>
  );
});

const TableRenderer = createRemoteComponentRenderer(function TableRenderer({
  caption,
  columns,
  rows,
}: any) {
  const safeColumns = Array.isArray(columns)
    ? columns.slice(0, 20).map((column) => ({
        key: String(column?.key ?? '').slice(0, 80),
        label: String(column?.label ?? column?.key ?? '').slice(0, 100),
      }))
    : [];
  const safeRows = Array.isArray(rows) ? rows.slice(0, 500) : [];
  return (
    <div className="remote-table-wrap">
      <table className="remote-table">
        {caption ? <caption>{String(caption).slice(0, 200)}</caption> : null}
        <thead>
          <tr>
            {safeColumns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {safeColumns.map((column) => (
                <td key={column.key}>{String(row?.[column.key] ?? '').slice(0, 1_000)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

// Defense-in-depth: even if a loadable reference survives the sanitizer, the
// Vega view cannot fetch anything.
const REJECTING_VEGA_LOADER = {
  load: () => Promise.reject(new Error('Vega network access is disabled in the sandbox.')),
  sanitize: () => Promise.reject(new Error('Vega network access is disabled in the sandbox.')),
  http: () => Promise.reject(new Error('Vega network access is disabled in the sandbox.')),
  file: () => Promise.reject(new Error('Vega file access is disabled in the sandbox.')),
} as unknown as undefined;

const VegaRenderer = createRemoteComponentRenderer(function VegaRenderer({
  spec,
  ariaLabel,
  minimumHeight,
}: any) {
  const container = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string>();
  const parsed = useMemo(() => {
    try {
      return {spec: sanitizeVegaSpec(spec) as VisualizationSpec};
    } catch (caught) {
      return {
        error: caught instanceof Error ? caught.message : 'Chart specification rejected.',
      };
    }
  }, [spec]);

  useEffect(() => {
    if (!container.current || !parsed.spec) return;
    setRenderError(undefined);
    let disposed = false;
    let finalize: (() => void) | undefined;

    void vegaEmbed(container.current, parsed.spec, {
      actions: false,
      renderer: 'canvas',
      ast: true,
      tooltip: true,
      loader: REJECTING_VEGA_LOADER,
      expr: expressionInterpreter, // CSP-safe: no Function/eval (paired with ast:true above)
    })
      .then((result) => {
        if (disposed) result.finalize();
        else finalize = () => result.finalize();
      })
      .catch((caught) => {
        setRenderError(caught instanceof Error ? caught.message : 'Unable to render chart.');
      });

    return () => {
      disposed = true;
      finalize?.();
      if (container.current) container.current.replaceChildren();
    };
  }, [parsed.spec]);

  const error = parsed.error ?? renderError;
  if (error) {
    return <div className="remote-chart-error">Chart rejected: {error}</div>;
  }

  return (
    <div
      ref={container}
      className="remote-chart"
      role="img"
      aria-label={String(ariaLabel ?? 'Clinical visualization').slice(0, 300)}
      style={{minHeight: clampNumber(minimumHeight, 360, 120, 900)}}
    />
  );
});

const CodeRenderer = createRemoteComponentRenderer(function CodeRenderer({language, children}: any) {
  return (
    <pre className="remote-code" data-language={String(language ?? 'text').slice(0, 30)}>
      <code>{children}</code>
    </pre>
  );
});

export const remoteComponentMap: RemoteComponentRendererMap = new Map([
  ['remote-fragment', RemoteFragmentRenderer],
  ['ui-stack', StackRenderer],
  ['ui-grid', GridRenderer],
  ['ui-card', CardRenderer],
  ['ui-heading', HeadingRenderer],
  ['ui-text', TextRenderer],
  ['ui-badge', BadgeRenderer],
  ['ui-alert', AlertRenderer],
  ['ui-button', ButtonRenderer],
  ['ui-select', SelectRenderer],
  ['ui-slider', SliderRenderer],
  ['ui-stat', StatRenderer],
  ['ui-table', TableRenderer],
  ['ui-vega', VegaRenderer],
  ['ui-code', CodeRenderer],
]);
