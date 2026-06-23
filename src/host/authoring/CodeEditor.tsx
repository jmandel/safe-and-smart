import React from 'react';
import * as SimpleEditor from 'react-simple-code-editor';
import Prism from 'prismjs';

// react-simple-code-editor is CJS (exports.default) and the component is a
// forwardRef — i.e. an OBJECT with $$typeof, not a function. Bun's interop also
// nests it under .default(.default). Descend the .default chain until we hit a
// renderable React type (function OR a $$typeof exotic component).
function isReactType(v: unknown): boolean {
  return (
    typeof v === 'function' ||
    (typeof v === 'object' && v !== null && '$$typeof' in (v as Record<string, unknown>))
  );
}
function resolveComponent(mod: unknown): unknown {
  let cur: unknown = mod;
  for (let i = 0; i < 5; i++) {
    if (isReactType(cur)) return cur;
    if (cur && typeof cur === 'object' && 'default' in (cur as Record<string, unknown>)) {
      cur = (cur as {default: unknown}).default;
    } else break;
  }
  return cur;
}
const Editor = resolveComponent(SimpleEditor) as React.ComponentType<{
  value: string;
  onValueChange: (next: string) => void;
  highlight: (code: string) => string;
  padding?: number;
  tabSize?: number;
  insertSpaces?: boolean;
  textareaClassName?: string;
  preClassName?: string;
  style?: React.CSSProperties;
}>;
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/themes/prism-tomorrow.css';

// A real syntax-highlighted code editor (Prism, dark) with Tab support (handled by
// the library) and a caller-supplied keydown (for ⌘/Ctrl+Enter to run).
export function CodeEditor({
  value,
  onChange,
  onKeyDown,
}: {
  value: string;
  onChange: (next: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="code-editor" onKeyDown={onKeyDown}>
      <Editor
        value={value}
        onValueChange={onChange}
        highlight={(code) => Prism.highlight(code, Prism.languages.tsx!, 'tsx')}
        padding={14}
        tabSize={2}
        insertSpaces
        textareaClassName="code-editor-ta"
        preClassName="code-editor-pre"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
          lineHeight: 1.55,
          minHeight: '100%',
        }}
      />
    </div>
  );
}
