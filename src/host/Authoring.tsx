import React, {useEffect, useRef, useState} from 'react';
import {App} from './App';
import {compileProject, type ProjectFile} from './authoring/esbuild-compile';
import {EXAMPLES, type Example} from './authoring/examples';

const clone = (files: ProjectFile[]): ProjectFile[] => files.map((f) => ({...f}));

function encodeProject(files: ProjectFile[]): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(files))));
}
function decodeProject(hash: string): ProjectFile[] | undefined {
  try {
    const m = hash.match(/[#&]p=([^&]+)/);
    if (!m) return undefined;
    const files = JSON.parse(decodeURIComponent(escape(atob(m[1]!))));
    return Array.isArray(files) && files.every((f) => typeof f?.path === 'string') ? files : undefined;
  } catch {
    return undefined;
  }
}

function ApiReference({onClose}: {onClose: () => void}) {
  return (
    <div className="play-ref-overlay" onClick={onClose}>
      <aside className="play-ref" onClick={(e) => e.stopPropagation()}>
        <div className="play-ref-head">
          <strong>session API</strong>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <p>Your applet receives one prop, <code>session</code>. Globals provided here: <code>React</code> hooks, <code>ui</code>, <code>runApplet</code>.</p>
        <dl>
          <dt>session.smart</dt>
          <dd><code>.patient</code> <code>.user</code> <code>.scopes</code><br />
            <code>.search(type, params)</code> · <code>.read(type, id)</code> · <code>.request(url, init?)</code></dd>
          <dt>session.ai</dt>
          <dd><code>.complete(&#123;profile, messages, responseSchema?&#125;)</code><br /><code>.stream(req, (delta) =&gt; …)</code></dd>
          <dt>session.styles</dt>
          <dd><code>.add(css)</code> → use via <code>&lt;ui.Box className&gt;</code></dd>
          <dt>session.files</dt>
          <dd><code>.open(&#123;url, title?&#125;)</code> → <code>&lt;ui.Image handle&gt;</code></dd>
          <dt>session.audit</dt>
          <dd><code>(&#123;code?, message, detail?&#125;)</code></dd>
          <dt>components</dt>
          <dd>Stack · Grid · Box · Inline · Card · Heading · Text · Badge · Alert · Stat · Button · Select · Slider · Input · Textarea · Table · Vega · Svg · Image · Code</dd>
          <dt>events</dt>
          <dd>read <code>e.detail</code> — e.g. <code>onChange=&#123;(e) =&gt; e.detail.value&#125;</code></dd>
        </dl>
        <p className="play-ref-foot">Full guide in <a href="../" onClick={onClose}>the tutorial on the landing page</a>.</p>
      </aside>
    </div>
  );
}

export function Authoring() {
  const fromHash = typeof window !== 'undefined' ? decodeProject(window.location.hash) : undefined;
  const [files, setFiles] = useState<ProjectFile[]>(fromHash ?? clone(EXAMPLES[0].files));
  const [currentExample, setCurrentExample] = useState(fromHash ? 'shared' : EXAMPLES[0].id);
  const [active, setActive] = useState(0);
  const [compiled, setCompiled] = useState<string>();
  const [sha, setSha] = useState<string>();
  const [packages, setPackages] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [showRef, setShowRef] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const filesRef = useRef(files);
  filesRef.current = files;

  const run = async () => {
    setBusy(true);
    setDiagnostics([]);
    try {
      const result = await compileProject(filesRef.current);
      setDiagnostics(result.diagnostics);
      setPackages(result.fetchedPackages);
      if (result.ok && result.script) {
        setCompiled(result.script);
        setSha(result.sha256);
        setRunKey((k) => k + 1);
      }
    } catch (error) {
      setDiagnostics([(error as Error).message]);
    } finally {
      setBusy(false);
    }
  };

  // Auto-run once on first load.
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadExample = (ex: Example) => {
    setFiles(clone(ex.files));
    setActive(0);
    setCurrentExample(ex.id);
    setShareMsg('');
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  };

  const updateActive = (content: string) =>
    setFiles((prev) => prev.map((file, i) => (i === active ? {...file, content} : file)));

  const onEditorKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void run();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const el = event.currentTarget;
      const {selectionStart: s, selectionEnd: e, value} = el;
      const next = value.slice(0, s) + '  ' + value.slice(e);
      updateActive(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = s + 2;
      });
    }
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#p=${encodeProject(files)}`;
    window.history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg('Link copied');
    } catch {
      setShareMsg('Link in address bar');
    }
    setTimeout(() => setShareMsg(''), 2500);
  };

  return (
    <div className="play">
      <header className="play-top">
        <div className="play-brand">
          <span className="shell-mark" aria-hidden>✚</span>
          <div>
            <strong>Applet playground</strong>
            <span className="play-sub">edit · compile in-browser · run in the sandbox</span>
          </div>
        </div>
        <div className="play-actions">
          {sha ? <span className="play-tag">sha256:{sha.slice(0, 10)}</span> : null}
          {packages.length ? <span className="play-tag">npm: {packages.join(', ')}</span> : null}
          <button className="play-btn ghost" onClick={() => setShowRef(true)}>API reference</button>
          <button className="play-btn ghost" onClick={share}>{shareMsg || 'Share'}</button>
          <button className="play-btn primary" onClick={run} disabled={busy}>
            {busy ? 'Compiling…' : '▶ Run'} <kbd>⌘↵</kbd>
          </button>
        </div>
      </header>

      <div className="play-body">
        <aside className="play-examples">
          <div className="play-examples-head">Examples</div>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              className={`play-example${currentExample === ex.id ? ' active' : ''}`}
              onClick={() => loadExample(ex)}
            >
              <span className="play-example-name">{ex.name}</span>
              <span className="play-example-blurb">{ex.blurb}</span>
            </button>
          ))}
        </aside>

        <section className="play-editor">
          <div className="play-tabs">
            {files.map((file, i) => (
              <button
                key={file.path}
                className={`play-tab${i === active ? ' active' : ''}`}
                onClick={() => setActive(i)}
              >
                {file.path}
              </button>
            ))}
          </div>
          <textarea
            className="play-textarea"
            spellCheck={false}
            value={files[active]?.content ?? ''}
            onChange={(e) => updateActive(e.target.value)}
            onKeyDown={onEditorKey}
          />
          {diagnostics.length > 0 ? (
            <ul className="play-diagnostics">
              {diagnostics.map((message, i) => (
                <li key={i}>{message}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="play-preview">
          {compiled ? (
            <App key={runKey} appletSourceOverride={compiled} />
          ) : (
            <div className="play-placeholder">{busy ? 'Compiling…' : 'Press Run to build and run.'}</div>
          )}
        </section>
      </div>

      {showRef ? <ApiReference onClose={() => setShowRef(false)} /> : null}
    </div>
  );
}
