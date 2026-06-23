import React from 'react';

// Base-aware links into the distinct wrapper entry points (/run, /fhir). Trailing
// slashes avoid a Pages 301. asset() builds an absolute URL under the base.
const base = import.meta.env.BASE_URL;
const asset = (path: string) => `${base}${path}`;

interface Entry {
  title: string;
  blurb: string;
  href: string;
  cta: string;
  accent?: boolean;
}

const ENTRIES: Entry[] = [
  {
    title: 'SMART standalone launch',
    blurb:
      'Authenticate against the SMART App Launcher, pick a patient, and run an applet against that real, token-secured context. The applet never sees the token.',
    href: asset('fhir/'),
    cta: 'Launch with SMART →',
    accent: true,
  },
  {
    title: 'Growth Explorer (demo data)',
    blurb:
      'No login. Opens a synthetic-but-live FHIR patient and renders an interactive growth chart entirely inside the sandbox.',
    href: asset('run/'),
    cta: 'Open Growth Explorer →',
  },
  {
    title: 'Medication Reconciliation (demo data)',
    blurb:
      'A different applet, same wrapper. Pulls the structured med list, hands it with recent notes to an LLM, and shows proposed reconciliation actions.',
    href: asset('run/?applet=' + encodeURIComponent(asset('applets/med-recon.js'))),
    cta: 'Open Med Reconciliation →',
  },
  {
    title: 'Encounter Cockpit — the full surface',
    blurb:
      'One applet exercising everything at once: author CSS, the FHIR fetch bridge, a chart + table, a streaming LLM with a brokered tool, a validated SVG, and a protected attachment — all sandboxed.',
    href: asset('run/?applet=' + encodeURIComponent(asset('applets/encounter-cockpit.js'))),
    cta: 'Open Encounter Cockpit →',
  },
  {
    title: 'Author in the browser',
    blurb:
      'Write a TSX applet, compile it in your browser (no server, no install), and run the self-contained, hash-addressed artifact in the very same locked sandbox.',
    href: asset('author/'),
    cta: 'Open the authoring playground →',
  },
];

interface TutorialStep {
  n: string;
  title: string;
  prose: string;
  code: string;
}

// A linear, top-to-bottom tutorial over the whole `session.*` surface. Each step is
// prose + a runnable snippet. (In the playground, React hooks, `ui`, and `runApplet`
// are provided as globals — no imports needed.)
const TUTORIAL: TutorialStep[] = [
  {
    n: '1',
    title: 'An applet is a sandboxed React component',
    prose:
      'You write an ordinary React component. It receives one prop — `session` — and renders with a curated component set. It has no network, no DOM, and no storage: every side effect goes through `session`. `runApplet` hands your component to the wrapper.',
    code: `function App({ session }) {
  return (
    <ui.Stack gap={12}>
      <ui.Heading level={2}>Hello, {session.smart.patient.display}</ui.Heading>
      <ui.Text tone="muted">Sandboxed — no token, no DOM, no ambient network.</ui.Text>
      <ui.Button onPress={() => session.audit({ message: 'said hi' })}>Log an event</ui.Button>
    </ui.Stack>
  );
}

runApplet(App, { appletId: 'org.example.hello', appletVersion: '0.1.0' });`,
  },
  {
    n: '2',
    title: 'Patient context & FHIR — session.smart',
    prose:
      '`session.smart` is your SMART client: the launch context you read (`patient`, `user`, `scopes`) and scoped FHIR you call (`search` / `read` / `request`). No token, no absolute URL — the wrapper attaches the credential and validates the request. (Prefer a drop-in client? Point `fhirclient` at https://fhir.internal/.)',
    code: `const vitals = await session.smart.search('Observation', {
  patient: session.smart.patient.id,
  category: 'vital-signs',
  _count: 200,
});
const patient = await session.smart.read('Patient', session.smart.patient.id);`,
  },
  {
    n: '3',
    title: 'The model — session.ai',
    prose:
      'OpenAI-compatible. `profile` selects an approved model (no API key in the applet). Use `complete` for a single response (optionally structured via `responseSchema`), or `stream` for token-by-token deltas through a callback. The `openai` SDK pointed at https://llm.internal/v1 also works.',
    code: `// streaming
await session.ai.stream(
  { profile: 'summarizer', messages: [{ role: 'user', content: note }] },
  (delta) => setText((t) => t + delta),
);

// or structured JSON
const res = await session.ai.complete({
  profile: 'clinical-summary',
  messages: [{ role: 'user', content: JSON.stringify(evidence) }],
  responseSchema: { type: 'object', properties: { summary: { type: 'string' } } },
});`,
  },
  {
    n: '4',
    title: 'Your own CSS — session.styles',
    prose:
      'Real design beyond the component props: grids, @media, @keyframes, gradients. You hand over CSS; the wrapper validates it (no external references) and installs it scoped to your surface — it cannot touch the host chrome. Reference your classes via <ui.Box className>.',
    code: `const css = \`.grid { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); }
.tile { padding:16px; border-radius:12px; background:linear-gradient(135deg,#0ea5e9,#2563eb); color:#fff; }
@keyframes rise { from { opacity:0; transform:translateY(8px) } to { opacity:1 } }\`;

useEffect(() => { session.styles.add(css); }, []);
// ...
<ui.Box className="grid"><ui.Box className="tile">72 bpm</ui.Box></ui.Box>`,
  },
  {
    n: '5',
    title: 'Protected documents — session.files',
    prose:
      'Display a token-protected attachment without ever holding its URL or token. `open` returns an opaque handle; <ui.Image handle> renders it. The applet can only pass a handle — never a raw src — so an image can never point at an external URL.',
    code: `const r = await session.files.open({ url: 'Binary/123', title: 'Discharge summary' });
if (r.ok) setHandle(r.handle);
// ...
{handle ? <ui.Image handle={handle} alt="Discharge summary" /> : null}`,
  },
  {
    n: '6',
    title: 'Accountability — session.audit',
    prose:
      'Record clinician actions to the trusted, append-only log (production: forwarded to the EHR audit trail). The wrapper already audits every brokered call; this adds your own semantic events. Prefer a `code` + minimal `detail` over PHI in the message.',
    code: `session.audit({
  code: 'applet.review-accepted',
  message: \`accepted reconciliation for \${med}\`,
});`,
  },
  {
    n: '7',
    title: 'Components & events',
    prose:
      'You render with a curated set (no raw HTML — there is no DOM in the worker). Layout/text: Stack, Grid, Box, Card, Heading, Text, Badge, Alert, Stat. Interactive: Button, Select, Slider, Input, Textarea. Data/graphics: Table, Vega, Svg, Image. Events arrive as bounded snapshots — read `e.detail`.',
    code: `<ui.Input label="Dose" onChange={(e) => setDose(e.detail.value)}
  onKeyDown={(e) => { if (e.detail.key === 'Enter') submit(); }} />

<ui.Select options={options} onChange={(e) => setMetric(e.detail.value)} />

<ui.Vega spec={{ data: { values: rows }, mark: 'line',
  encoding: { x: { field: 'date', type: 'temporal' }, y: { field: 'value', type: 'quantitative' } } }} />`,
  },
  {
    n: '8',
    title: 'Run it',
    prose:
      'Fastest path: open the playground, edit, and press Compile & Run — it compiles in your browser (multi-file, real npm imports) and runs in the same locked sandbox. Or build a self-contained bundle and load it from anywhere: /run/?applet=https://your-host/applet.js. Same sandbox, same rules.',
    code: `// host a bundle anywhere CORS-enabled, then:
//   https://<this-wrapper>/run/?applet=https://your-host/applet.js`,
  },
];

export function Landing() {
  return (
    <div className="landing">
      <header className="landing-hero">
        <div className="shell-mark">C</div>
        <h1>Clinical Applet Sandbox</h1>
        <p className="landing-tagline">
          One trusted wrapper that does the SMART&nbsp;on&nbsp;FHIR launch once and safely runs many
          interchangeable applets inside it — so a health system can enable a single wrapper and let
          clinicians experiment freely, but safely.
        </p>
      </header>

      <section className="landing-how">
        <div className="landing-card">
          <h3>Rich, not a widget DSL</h3>
          <p>Applets are real React apps (hooks, state, your libraries), rendered via Remote DOM.</p>
        </div>
        <div className="landing-card">
          <h3>Contained by construction</h3>
          <p>
            Each applet runs in an opaque-origin worker: no token, no network, no DOM, no storage —
            only brokered <code>fhirRequest</code> / <code>llmComplete</code> / <code>audit</code>.
          </p>
        </div>
        <div className="landing-card">
          <h3>Safe for any code</h3>
          <p>Because applets are untrusted by design, the wrapper can run third-party or even LLM-written applets — including from a URL.</p>
        </div>
      </section>

      <h2 className="landing-try">Try it</h2>
      <section className="landing-entries">
        {ENTRIES.map((entry) => (
          <a key={entry.title} className={`landing-entry${entry.accent ? ' accent' : ''}`} href={entry.href}>
            <h3>{entry.title}</h3>
            <p>{entry.blurb}</p>
            <span className="landing-cta">{entry.cta}</span>
          </a>
        ))}
      </section>

      <h2 className="landing-try" id="tutorial">Write an applet — a walkthrough</h2>
      <p className="tut-intro">
        The whole API an applet sees is one prop, <code>session</code>, plus a component set. Read
        top to bottom; each step is runnable. When you&rsquo;re ready, paste any of it into the{' '}
        <a href={asset('author/')}>playground</a>.
      </p>
      <section className="tutorial">
        {TUTORIAL.map((step) => (
          <article className="tut-step" key={step.n}>
            <div className="tut-head">
              <span className="tut-n">{step.n}</span>
              <h3>{step.title}</h3>
            </div>
            <p className="tut-prose">{step.prose}</p>
            <pre className="landing-code">
              <code>{step.code}</code>
            </pre>
          </article>
        ))}
        <p className="tut-foot">
          Everything is typed, and the wrapper validates every element, style, FHIR call, and SVG —
          unsafe code fails closed rather than escaping. There is no token, no DOM, and no ambient
          network inside an applet, whoever wrote it.
        </p>
      </section>

      <footer className="landing-foot">
        <p>
          All data is synthetic (SMART sandbox / fabricated). This is an architecture demonstration,
          not a clinical product. The applet picker in the top bar switches applets at any time.
        </p>
      </footer>
    </div>
  );
}
