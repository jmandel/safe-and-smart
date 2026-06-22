import React, {useState} from 'react';
import {App} from './App';
import {compileApplet} from './authoring/compile';

const STARTER = `// Edit, then press Compile & Run. This compiles in your browser and runs in the
// same locked sandbox as any other applet — no server, no extra privilege.
function App({ context, clinical }) {
  const [count, setCount] = useState(0);
  return (
    <ui.Stack gap={16}>
      <ui.Card padding={20}>
        <ui.Stack gap={8}>
          <ui.Heading level={2}>Hello from a browser-authored applet</ui.Heading>
          <ui.Text tone="muted">Patient: {context.patient.display}</ui.Text>
          <ui.Badge tone="positive">compiled in-browser, hash-addressed</ui.Badge>
        </ui.Stack>
      </ui.Card>
      <ui.Card padding={20}>
        <ui.Stack gap={12} direction="row" align="center">
          <ui.Stat label="Clicks" value={String(count)} />
          <ui.Button variant="primary" onPress={() => {
            setCount(c => c + 1);
            clinical.audit({ kind: 'application', code: 'applet.user-action', message: 'authored: bump' });
          }}>
            Increment
          </ui.Button>
        </ui.Stack>
      </ui.Card>
    </ui.Stack>
  );
}

runApplet(App, { appletId: 'authored.in-browser', appletVersion: '0.1.0' });
`;

export function Authoring() {
  const [source, setSource] = useState(STARTER);
  const [compiled, setCompiled] = useState<string>();
  const [sha, setSha] = useState<string>();
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [runKey, setRunKey] = useState(0);

  const run = async () => {
    setBusy(true);
    try {
      const result = await compileApplet(source);
      setDiagnostics(result.diagnostics);
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

  return (
    <div className="authoring">
      <div className="authoring-editor">
        <div className="authoring-toolbar">
          <strong>Browser applet authoring</strong>
          <button type="button" onClick={run} disabled={busy} className="authoring-run">
            {busy ? 'Compiling…' : 'Compile & Run'}
          </button>
          {sha ? <span className="authoring-hash">sha256:{sha.slice(0, 12)}</span> : null}
        </div>
        <textarea
          className="authoring-textarea"
          spellCheck={false}
          value={source}
          onChange={(event) => setSource(event.target.value)}
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
          <div className="authoring-placeholder">Compile to run your applet in the sandbox.</div>
        )}
      </div>
    </div>
  );
}
