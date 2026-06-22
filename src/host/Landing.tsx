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

const TUTORIAL_CODE = `// In the playground (/author) React hooks, \`ui\`, and \`runApplet\` are provided —
// just write a component. It receives clinical context + brokered capabilities.
function App({ context, clinical }) {
  const [count, setCount] = useState(0);

  // FHIR with no token: fetch a familiar-looking endpoint, get parsed resources.
  useEffect(() => {
    fetch(\`https://fhir.internal/Patient/\${context.patient.id}\`)
      .then(r => r.json())
      .then(p => clinical.audit({ kind: 'application', message: 'loaded ' + p.id }));
  }, []);

  return (
    <ui.Stack gap={12}>
      <ui.Heading level={2}>Hello, {context.patient.display}</ui.Heading>
      <ui.Text tone="muted">Sandboxed — no token, no DOM, no ambient network.</ui.Text>
      <ui.Button variant="primary" onPress={() => setCount(count + 1)}>
        Clicked {count} times
      </ui.Button>
    </ui.Stack>
  );
}

runApplet(App, { appletId: 'org.example.hello', appletVersion: '0.1.0' });`;

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

      <h2 className="landing-try">Write your own applet</h2>
      <section className="landing-tutorial">
        <div className="landing-tutorial-code">
          <pre className="landing-code">
            <code>{TUTORIAL_CODE}</code>
          </pre>
        </div>
        <div className="landing-tutorial-guide">
          <ol className="landing-steps">
            <li>
              <strong>Open the playground</strong> — go to <a href={asset('author/')}>/author</a>, edit
              the starter, and press <em>Compile&nbsp;&amp;&nbsp;Run</em>. It compiles in your browser
              (multi-file, real npm imports) and runs in the same locked sandbox.
            </li>
            <li>
              <strong>Build the UI</strong> from the safe component set — <code>ui.Stack</code>,{' '}
              <code>Grid</code>, <code>Card</code>, <code>Heading</code>, <code>Text</code>,{' '}
              <code>Button</code>, <code>Input</code>, <code>Select</code>, <code>Table</code>,{' '}
              <code>Vega</code>, <code>Svg</code>, <code>Image</code>, <code>Box</code> — with ordinary
              React hooks and <code>onPress</code>/<code>onChange</code> events.
            </li>
            <li>
              <strong>Use brokered capabilities</strong> (no token ever in the applet):
              <ul className="landing-caps">
                <li><code>fetch('https://fhir.internal/…')</code> — FHIR resources</li>
                <li><code>fetch('https://llm.internal/v1/chat/completions', {'{ stream: true }'})</code> — OpenAI-compatible LLM</li>
                <li><code>clinical.registerStylesheet({'{ css }'})</code> — your own validated CSS</li>
                <li><code>clinical.fetchAttachment(…)</code> → <code>&lt;Image handle/&gt;</code> — protected docs</li>
                <li><code>clinical.audit(…)</code> — write to the trusted audit log</li>
              </ul>
            </li>
            <li>
              <strong>Ship it</strong> — or build a self-contained bundle and load it from anywhere:{' '}
              <code>/run/?applet=https://your-host/applet.js</code>. Same sandbox, same rules.
            </li>
          </ol>
          <p className="landing-tutorial-more">
            The component props and events are fully typed; the host validates every element, style,
            and SVG, so unsafe code fails closed rather than escaping.
          </p>
        </div>
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
