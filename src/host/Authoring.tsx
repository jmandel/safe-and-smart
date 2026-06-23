import React, {useEffect, useRef, useState} from 'react';
import {App, PREVIEW_CHROME} from './App';
import {compileProject, type ProjectFile} from './authoring/esbuild-compile';
import {EXAMPLES, type Example} from './authoring/examples';
import {LESSONS, lessonProject} from './authoring/lessons';
import {CodeEditor} from './authoring/CodeEditor';

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
        <p>Your applet gets one prop, <code>session</code>. Globals here: <code>React</code> hooks, <code>ui</code>, <code>runApplet</code>.</p>
        <dl>
          <dt>session.smart</dt>
          <dd><code>.patient .user .scopes</code> · <code>.search(type, params)</code> · <code>.read(type, id)</code> · <code>.request(url, init?)</code></dd>
          <dt>session.ai</dt>
          <dd><code>.complete(req)</code> · <code>.stream(req, (delta) =&gt; …)</code></dd>
          <dt>session.styles</dt>
          <dd><code>.add(css)</code> → <code>&lt;ui.Box className&gt;</code></dd>
          <dt>documents</dt>
          <dd>inline bytes → <code>&lt;ui.Image src=&#123;dataUrl&#125;&gt;</code> (data: only — no remote fetch)</dd>
          <dt>session.audit</dt>
          <dd><code>(&#123;code?, message&#125;)</code></dd>
          <dt>components</dt>
          <dd>Stack · Grid · Box · Inline · Card · Heading · Text · Badge · Alert · Stat · Button · Select · Slider · Input · Textarea · Table · Vega · Svg · Image · Code</dd>
        </dl>
      </aside>
    </div>
  );
}

type Mode = 'learn' | 'examples';

export function Authoring() {
  const shared = typeof window !== 'undefined' ? decodeProject(window.location.hash) : undefined;
  const [mode, setMode] = useState<Mode>(shared ? 'examples' : 'learn');
  const [lessonIdx, setLessonIdx] = useState(0);
  const [exampleId, setExampleId] = useState<string>(shared ? 'shared' : EXAMPLES[0].id);
  const [files, setFiles] = useState<ProjectFile[]>(shared ?? lessonProject(LESSONS[0]));
  const [active, setActive] = useState(0);
  const [sha, setSha] = useState<string>();
  const [packages, setPackages] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Double-buffered preview. Each layer is a mounted App (its own sandbox/worker).
  // A freshly compiled bundle boots in a hidden layer; once it signals onReady we
  // promote it (drop the older visible layer). So the previous output stays on
  // screen — no teardown flash — until the new one is actually rendered.
  type Layer = {key: number; source: string; ready: boolean};
  const [layers, setLayers] = useState<Layer[]>([]);
  const runKeyRef = useRef(0);
  const [showRef, setShowRef] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const filesRef = useRef(files);
  filesRef.current = files;

  const run = async (target: ProjectFile[] = filesRef.current) => {
    setBusy(true);
    setDiagnostics([]);
    try {
      const result = await compileProject(target);
      setDiagnostics(result.diagnostics);
      setPackages(result.fetchedPackages);
      if (result.ok && result.script) {
        setSha(result.sha256);
        const key = (runKeyRef.current += 1);
        const source = result.script;
        setLayers((ls) => {
          // Keep only the current visible layer as the baseline; discard any
          // still-booting layer from a previous keystroke (cap live Apps at two).
          const ready = ls.filter((l) => l.ready);
          const baseline = ready.length ? [ready[ready.length - 1]!] : [];
          return [...baseline, {key, source, ready: baseline.length === 0}];
        });
      }
    } catch (error) {
      setDiagnostics([(error as Error).message]);
    } finally {
      setBusy(false);
    }
  };

  // Promote a booted layer: mark it ready and drop every older layer (its App
  // unmounts, tearing down that sandbox). Same wrapper key → React keeps the
  // booted App instance mounted across the swap, so there's no re-handshake.
  const promote = (key: number) =>
    setLayers((ls) => {
      const idx = ls.findIndex((l) => l.key === key);
      if (idx < 0) return ls;
      const kept = ls.slice(idx);
      kept[0] = {...kept[0]!, ready: true};
      return kept;
    });

  // Debounced auto-run: compile ~400ms after the last edit (and on mount / lesson
  // switch). ⌘↵ still forces an immediate run.
  useEffect(() => {
    const t = setTimeout(() => void run(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const load = (next: ProjectFile[]) => {
    setFiles(next); // the debounced effect picks up the change and runs it
    setActive(0);
    setShareMsg('');
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  };
  const loadLesson = (i: number) => {
    setLessonIdx(i);
    setMode('learn');
    load(lessonProject(LESSONS[i]));
  };
  const loadExample = (ex: Example) => {
    setExampleId(ex.id);
    setMode('examples');
    load(clone(ex.files));
  };

  const updateActive = (content: string) =>
    setFiles((prev) => prev.map((f, i) => (i === active ? {...f, content} : f)));

  const onEditorKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void run();
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

  const lesson = LESSONS[lessonIdx]!;

  return (
    <div className="play">
      <header className="play-top">
        <div className="play-brand">
          <span className="shell-mark" aria-hidden>✚</span>
          <strong>Playground</strong>
          <div className="play-modes">
            <button className={mode === 'learn' ? 'active' : ''} onClick={() => setMode('learn')}>Learn</button>
            <button className={mode === 'examples' ? 'active' : ''} onClick={() => setMode('examples')}>Examples</button>
          </div>
        </div>
        <div className="play-actions">
          {sha ? <span className="play-tag">sha256:{sha.slice(0, 10)}</span> : null}
          {packages.length ? <span className="play-tag">npm: {packages.join(', ')}</span> : null}
          <button className="play-btn ghost" onClick={() => setShowRef(true)}>API</button>
          <button className="play-btn ghost" onClick={share}>{shareMsg || 'Share'}</button>
          <button className="play-btn primary" onClick={() => run()} disabled={busy}>
            {busy ? 'Compiling…' : '▶ Run'} <kbd>⌘↵</kbd>
          </button>
        </div>
      </header>

      <div className="play-body">
        <aside className="play-side">
          {mode === 'learn'
            ? LESSONS.map((l, i) => (
                <button
                  key={l.id}
                  className={`play-side-item${i === lessonIdx ? ' active' : ''}`}
                  onClick={() => loadLesson(i)}
                >
                  <span className="play-side-n">{i + 1}</span>
                  <span className="play-side-name">{l.title}</span>
                </button>
              ))
            : EXAMPLES.map((ex) => (
                <button
                  key={ex.id}
                  className={`play-side-item${exampleId === ex.id ? ' active' : ''}`}
                  onClick={() => loadExample(ex)}
                >
                  <span className="play-side-name">{ex.name}</span>
                  <span className="play-side-blurb">{ex.blurb}</span>
                </button>
              ))}
        </aside>

        <section className="play-editor">
          {mode === 'learn' ? (
            <div className="play-lesson">
              <div className="play-lesson-head">
                <span className="play-lesson-step">Lesson {lessonIdx + 1} of {LESSONS.length}</span>
                <div className="play-lesson-nav">
                  <button disabled={lessonIdx === 0} onClick={() => loadLesson(lessonIdx - 1)}>‹ Prev</button>
                  <button disabled={lessonIdx === LESSONS.length - 1} onClick={() => loadLesson(lessonIdx + 1)}>Next ›</button>
                </div>
              </div>
              <h2>{lesson.title}</h2>
              <p>{lesson.prose}</p>
              <span className="play-lesson-hint">Edit the code below and press ⌘↵ to re-run.</span>
            </div>
          ) : null}

          <div className="play-tabs">
            {files.map((file, i) => (
              <button key={file.path} className={`play-tab${i === active ? ' active' : ''}`} onClick={() => setActive(i)}>
                {file.path}
              </button>
            ))}
          </div>
          <div className="play-editor-wrap">
            <CodeEditor value={files[active]?.content ?? ''} onChange={updateActive} onKeyDown={onEditorKey} />
          </div>
          {diagnostics.length > 0 ? (
            <ul className="play-diagnostics">
              {diagnostics.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="play-preview">
          {layers.length === 0 ? (
            <div className="play-placeholder">{busy ? 'Compiling…' : 'Press Run.'}</div>
          ) : (
            layers.map((l) => (
              <div key={l.key} className={`play-buf${l.ready ? '' : ' play-buf--pending'}`} aria-hidden={!l.ready}>
                <App appletSourceOverride={l.source} config={PREVIEW_CHROME} onReady={() => promote(l.key)} />
              </div>
            ))
          )}
          {busy || layers.some((l) => !l.ready) ? (
            <div className="play-updating" role="status">
              <span className="play-updating-dot" aria-hidden />
              updating
            </div>
          ) : null}
        </section>
      </div>

      {showRef ? <ApiReference onClose={() => setShowRef(false)} /> : null}
    </div>
  );
}
