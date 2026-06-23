// Playground example gallery — one runnable template per capability. Authored
// applets receive `session`; React hooks, `ui`, and `runApplet` are SDK globals.
import type {ProjectFile} from './esbuild-compile';

export interface Example {
  id: string;
  name: string;
  blurb: string;
  files: ProjectFile[];
}

const f = (path: string, content: string): ProjectFile => ({path, content});

export const EXAMPLES: Example[] = [
  {
    id: 'hello',
    name: 'Hello',
    blurb: 'The smallest applet — context + a button + audit.',
    files: [
      f(
        'App.tsx',
        `function App({ session }) {
  const [n, setN] = useState(0);
  return (
    <ui.Stack gap={12}>
      <ui.Heading level={2}>Hello, {session.smart.patient.display}</ui.Heading>
      <ui.Text tone="muted">Sandboxed — no token, no DOM, no network.</ui.Text>
      <ui.Button variant="primary" onPress={() => {
        setN(n + 1);
        session.audit({ message: 'clicked ' + (n + 1) });
      }}>Clicked {n} times</ui.Button>
    </ui.Stack>
  );
}

runApplet(App, { appletId: 'play.hello', appletVersion: '0.1.0' });
`,
      ),
    ],
  },
  {
    id: 'fhir-chart',
    name: 'FHIR + chart',
    blurb: 'session.smart.search → Vega weight trend + table.',
    files: [
      f(
        'App.tsx',
        `function App({ session }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    session.smart.search('Observation', {
      patient: session.smart.patient.id,
      code: 'http://loinc.org|29463-7', // body weight
      _count: 12, _sort: 'date',
    }).then((bundle) => {
      setRows((bundle.entry || [])
        .map((e) => e.resource)
        .filter((r) => r && r.valueQuantity && r.effectiveDateTime)
        .map((r) => ({ when: r.effectiveDateTime.slice(0, 10), value: r.valueQuantity.value })));
    });
  }, []);

  const spec = {
    width: 'container', height: 200, data: { values: rows },
    mark: { type: 'line', point: true, tooltip: true },
    encoding: {
      x: { field: 'when', type: 'temporal', title: 'Date' },
      y: { field: 'value', type: 'quantitative', title: 'Weight (kg)', scale: { zero: false } },
    },
  };

  return (
    <ui.Stack gap={12}>
      <ui.Heading level={2}>Weight trend</ui.Heading>
      {rows.length
        ? <ui.Vega spec={spec} ariaLabel="Weight trend" minimumHeight={220} />
        : <ui.Text tone="muted">Loading observations…</ui.Text>}
      <ui.Table caption="Observations"
        columns={[{ key: 'when', label: 'Date' }, { key: 'value', label: 'Weight' }]}
        rows={rows} />
    </ui.Stack>
  );
}

runApplet(App, { appletId: 'play.fhir-chart', appletVersion: '0.1.0' });
`,
      ),
    ],
  },
  {
    id: 'streaming-ai',
    name: 'Streaming AI',
    blurb: 'session.ai.stream — render tokens as they arrive.',
    files: [
      f(
        'App.tsx',
        `function App({ session }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true); setText('');
    await session.ai.stream(
      { profile: 'summarizer', messages: [
        { role: 'user', content: 'Summarize the encounter for ' + session.smart.patient.display },
      ] },
      (delta) => setText((t) => t + delta),
    );
    setBusy(false);
  };

  return (
    <ui.Stack gap={12}>
      <ui.Heading level={2}>AI summary</ui.Heading>
      <ui.Button variant="primary" disabled={busy} onPress={run}>
        {busy ? 'Streaming…' : 'Summarize'}
      </ui.Button>
      <ui.Card padding={16}><ui.Text>{text || 'Press Summarize.'}</ui.Text></ui.Card>
    </ui.Stack>
  );
}

runApplet(App, { appletId: 'play.streaming-ai', appletVersion: '0.1.0' });
`,
      ),
    ],
  },
  {
    id: 'styled',
    name: 'Styled dashboard',
    blurb: 'session.styles.add — real CSS (grid, gradients) scoped to you.',
    files: [
      f(
        'App.tsx',
        `import styles from './app.css';

const TILES = [
  { label: 'Heart rate', value: '72 bpm' },
  { label: 'BP', value: '118/76' },
  { label: 'SpO2', value: '98%' },
];

function App({ session }) {
  useEffect(() => { session.styles.add(styles); }, []);
  return (
    <ui.Stack gap={12}>
      <ui.Heading level={2}>Vitals</ui.Heading>
      <ui.Box className="grid">
        {TILES.map((t) => (
          <ui.Box key={t.label} className="tile">
            <ui.Inline className="label">{t.label}</ui.Inline>
            <ui.Box className="value">{t.value}</ui.Box>
          </ui.Box>
        ))}
      </ui.Box>
    </ui.Stack>
  );
}

runApplet(App, { appletId: 'play.styled', appletVersion: '0.1.0' });
`,
      ),
      f(
        'app.css',
        `.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.tile { padding: 16px; border-radius: 14px; color: #fff;
  background: linear-gradient(135deg, #0ea5e9, #22c55e);
  animation: rise .4s ease both; }
.label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; opacity: .85; }
.value { display: block; font-size: 24px; font-weight: 800; margin-top: 4px; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; } }
`,
      ),
    ],
  },
  {
    id: 'form',
    name: 'Form',
    blurb: 'Inputs, validation, keyboard, audit.',
    files: [
      f(
        'App.tsx',
        `function App({ session }) {
  const [med, setMed] = useState('');
  const [dose, setDose] = useState('');
  const [done, setDone] = useState(false);
  const valid = med.trim().length > 1 && /\\d/.test(dose);

  const submit = () => {
    if (!valid) return;
    setDone(true);
    session.audit({ code: 'applet.user-action', message: 'ordered ' + med });
  };

  return (
    <ui.Stack gap={12}>
      <ui.Heading level={2}>New order</ui.Heading>
      <ui.Input label="Medication" autoFocus placeholder="Lisinopril"
        onChange={(e) => setMed(e.detail.value)}
        onKeyDown={(e) => { if (e.detail.key === 'Enter') submit(); }} />
      <ui.Input label="Dose" placeholder="10 mg"
        onChange={(e) => setDose(e.detail.value)} />
      {done ? <ui.Alert tone="success" title="Queued">Order for {med} queued.</ui.Alert> : null}
      <ui.Button variant="primary" disabled={!valid} onPress={submit}>Submit</ui.Button>
    </ui.Stack>
  );
}

runApplet(App, { appletId: 'play.form', appletVersion: '0.1.0' });
`,
      ),
    ],
  },
  {
    id: 'svg',
    name: 'SVG diagram',
    blurb: 'Custom author SVG, validated to a safe subset.',
    files: [
      f(
        'App.tsx',
        `const DIAGRAM = \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 70" width="100%">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs>
  <line x1="40" y1="35" x2="320" y2="35" stroke="url(#g)" stroke-width="5" stroke-linecap="round"/>
  <circle cx="40" cy="35" r="16" fill="#0ea5e9"/><circle cx="180" cy="35" r="16" fill="#14b8a6"/><circle cx="320" cy="35" r="16" fill="#22c55e"/>
</svg>\`;

function App({ session }) {
  return (
    <ui.Stack gap={12}>
      <ui.Heading level={2}>Care pathway</ui.Heading>
      <ui.Svg markup={DIAGRAM} ariaLabel="Care pathway" />
    </ui.Stack>
  );
}

runApplet(App, { appletId: 'play.svg', appletVersion: '0.1.0' });
`,
      ),
    ],
  },
  {
    id: 'document',
    name: 'Inline document',
    blurb: 'Attachment bytes → a self-contained data: URL → <Image>.',
    files: [
      f(
        'App.tsx',
        `function App({ session }) {
  // A FHIR Attachment usually carries its bytes inline as base64 \`data\` plus a
  // \`contentType\`. You already hold the bytes, so build a self-contained data: URL
  // and show it — no fetch, nothing the wrapper has to reach out for, nothing to
  // leak. (<Image src> accepts data: URLs only; a remote src is rejected.)
  const contentType = 'image/svg+xml';
  const data = btoa(
    "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='150'>" +
    "<rect width='300' height='150' rx='10' fill='#0f172a'/>" +
    "<text x='20' y='60' fill='#e2e8f0' font-family='sans-serif' font-size='15'>Discharge summary</text>" +
    "<text x='20' y='92' fill='#94a3b8' font-family='sans-serif' font-size='11'>Inline attachment bytes - no fetch.</text></svg>"
  );
  const dataUrl = 'data:' + contentType + ';base64,' + data;
  return (
    <ui.Stack gap={12}>
      <ui.Heading level={2}>Inline document</ui.Heading>
      <ui.Text tone="muted">Attachment bytes shown directly — no URL, no token, no network.</ui.Text>
      <ui.Image src={dataUrl} alt="Discharge summary" />
    </ui.Stack>
  );
}

runApplet(App, { appletId: 'play.document', appletVersion: '0.1.0' });
`,
      ),
    ],
  },
  {
    id: 'npm',
    name: 'Multi-file + npm',
    blurb: 'Import a real npm package (date-fns); split across files.',
    files: [
      f(
        'App.tsx',
        `import { format } from 'date-fns';
import { VitalTile } from './VitalTile';

function App({ session }) {
  const today = format(new Date(), 'EEEE, MMMM d');
  return (
    <ui.Stack gap={12}>
      <ui.Heading level={2}>Multi-file applet</ui.Heading>
      <ui.Text tone="muted">Patient: {session.smart.patient.display} · {today}</ui.Text>
      <ui.Stack gap={8} direction="row">
        <VitalTile label="Heart rate" value="72 bpm" />
        <VitalTile label="BP" value="118/76" />
      </ui.Stack>
    </ui.Stack>
  );
}

runApplet(App, { appletId: 'play.npm', appletVersion: '0.1.0' });
`,
      ),
      f(
        'VitalTile.tsx',
        `export function VitalTile({ label, value }) {
  return (
    <ui.Stat label={label} value={value} />
  );
}
`,
      ),
    ],
  },
];
