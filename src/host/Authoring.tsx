import React, {useState} from 'react';
import {App} from './App';
import {compileProject, type ProjectFile} from './authoring/esbuild-compile';

// A multi-file starter project: imports a real npm package (date-fns) from esm.sh,
// a CSS Module (validated + installed via registerStylesheet), and a local
// component file — compiled in the browser with esbuild-wasm and run in the same
// locked sandbox.
const STARTER: ProjectFile[] = [
  {
    path: 'App.tsx',
    content: `import { format } from 'date-fns';
import styles from './app.css';
import { VitalTile } from './VitalTile';

// React hooks + ui + runApplet are provided by the sandbox SDK (no import needed).
function App({ context, clinical }) {
  useEffect(() => { clinical.registerStylesheet({ css: styles }); }, []);
  const today = format(new Date(), 'EEEE, MMMM d');
  return (
    <ui.Stack gap={16}>
      <ui.Heading level={2}>Multi-file applet</ui.Heading>
      <ui.Text tone="muted">Patient: {context.patient.display} · {today}</ui.Text>
      <ui.Box className="row">
        <VitalTile label="Heart rate" value="72 bpm" />
        <VitalTile label="Blood pressure" value="118/76" />
        <VitalTile label="SpO2" value="98%" />
      </ui.Box>
    </ui.Stack>
  );
}

runApplet(App, { appletId: 'authored.multi-file', appletVersion: '0.1.0' });
`,
  },
  {
    path: 'VitalTile.tsx',
    content: `// A separate component file — bundled into the applet.
export function VitalTile({ label, value }) {
  return (
    <ui.Box className="tile">
      <ui.Inline className="t-label">{label}</ui.Inline>
      <ui.Box className="t-value">{value}</ui.Box>
    </ui.Box>
  );
}
`,
  },
  {
    path: 'app.css',
    content: `.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.tile { display: block; padding: 16px; border-radius: 12px;
  background: linear-gradient(135deg, #0ea5e9, #2563eb); color: #fff; }
.t-label { display: block; font-size: 12px; letter-spacing: .05em; text-transform: uppercase; opacity: .85; }
.t-value { display: block; font-size: 22px; font-weight: 800; margin-top: 4px; }
`,
  },
];

export function Authoring() {
  const [files, setFiles] = useState<ProjectFile[]>(STARTER);
  const [active, setActive] = useState(0);
  const [compiled, setCompiled] = useState<string>();
  const [sha, setSha] = useState<string>();
  const [packages, setPackages] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [runKey, setRunKey] = useState(0);

  const updateActive = (content: string) =>
    setFiles((prev) => prev.map((f, i) => (i === active ? {...f, content} : f)));

  const run = async () => {
    setBusy(true);
    setDiagnostics([]);
    try {
      const result = await compileProject(files);
      setDiagnostics(result.diagnostics);
      setPackages(result.fetchedPackages);
      if (result.ok && result.script) {
        setCompiled(result.script);
        setSha(result.sha256);
        setRunKey((k) => k + 1);
      } else {
        setCompiled(undefined);
      }
    } catch (error) {
      setDiagnostics([(error as Error).message]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authoring">
      <div className="authoring-editor">
        <div className="authoring-toolbar">
          <strong>Browser applet authoring</strong>
          <button type="button" onClick={run} disabled={busy} className="authoring-run">
            {busy ? 'Compiling…' : 'Compile & Run'}
          </button>
          {sha ? <span className="authoring-hash">sha256:{sha.slice(0, 12)}</span> : null}
          {packages.length ? <span className="authoring-hash">npm: {packages.join(', ')}</span> : null}
        </div>
        <div className="authoring-tabs">
          {files.map((f, i) => (
            <button
              type="button"
              key={f.path}
              className={`authoring-tab${i === active ? ' active' : ''}`}
              onClick={() => setActive(i)}
            >
              {f.path}
            </button>
          ))}
        </div>
        <textarea
          className="authoring-textarea"
          spellCheck={false}
          value={files[active]!.content}
          onChange={(event) => updateActive(event.target.value)}
        />
        {diagnostics.length > 0 ? (
          <ul className="authoring-diagnostics">
            {diagnostics.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="authoring-preview">
        {compiled ? (
          <App key={runKey} appletSourceOverride={compiled} />
        ) : (
          <div className="authoring-placeholder">
            Compile to bundle this multi-file project (with its npm import) and run it in the sandbox.
          </div>
        )}
      </div>
    </div>
  );
}
