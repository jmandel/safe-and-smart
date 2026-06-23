// The teaching narrative — one source of truth for the landing tutorial (read) and
// the playground Learn mode (run + edit). Each lesson builds the mental model on the
// previous one; the code is a complete, runnable applet. The goal is understanding,
// not an API tour: motivate every capability before showing it.
import type {ProjectFile} from './esbuild-compile';

export interface Lesson {
  id: string;
  title: string;
  /** 2–4 sentences that teach the idea and motivate the code. Plain text. */
  prose: string;
  /** A complete, runnable single-file applet that demonstrates the idea. */
  code: string;
}

const app = (body: string) => `${body}\n\nrunApplet(App, { appletId: 'tutorial', appletVersion: '0.1.0' });\n`;

export const LESSONS: Lesson[] = [
  {
    id: 'sandbox',
    title: 'Your applet runs in a sealed sandbox',
    prose:
      "An applet here isn't a normal web app. The trusted wrapper holds the clinician's login and runs your code in a jail — a worker with no DOM, no network, and no storage. So `document`, `fetch('https://…')`, and `localStorage` simply don't work. That sounds limiting, but it's exactly what lets the wrapper run untrusted code — yours, a vendor's, even an LLM's — without it being able to leak data or call home. Your job is to build inside that jail.",
    code: app(`function App({ session }) {
  // The applet proves its own isolation at startup; you can read the result.
  const p = session.probe;
  return (
    <ui.Stack gap={8}>
      <ui.Heading level={2}>Inside the sandbox</ui.Heading>
      <ui.Text tone="muted">What this applet is NOT allowed to do:</ui.Text>
      <ui.Badge tone={p.directNetworkBlocked ? 'positive' : 'critical'}>network blocked</ui.Badge>
      <ui.Badge tone={p.directDomUnavailable ? 'positive' : 'critical'}>no real DOM</ui.Badge>
      <ui.Badge tone={p.persistentStorageBlocked ? 'positive' : 'critical'}>no storage</ui.Badge>
    </ui.Stack>
  );
}`),
  },
  {
    id: 'session',
    title: 'Everything you can do arrives in one prop: session',
    prose:
      "If you can't touch the network or the token, how do you do anything? The wrapper hands your component a single prop, `session`. You don't perform privileged actions — you state intent, and the trusted wrapper performs them for you and hands back the result. You never see the token. That one idea — say what you want, the wrapper does the privileged part — is the whole model. Start with `session.smart.patient`, the patient the clinician launched on.",
    code: app(`function App({ session }) {
  const [n, setN] = useState(0);
  return (
    <ui.Stack gap={10}>
      <ui.Heading level={2}>Hello, {session.smart.patient.display}</ui.Heading>
      <ui.Button variant="primary" onPress={() => {
        setN(n + 1);
        // 'audit' is a capability too — it writes to the wrapper's trusted log.
        session.audit({ message: 'clicked ' + (n + 1) });
      }}>Clicked {n} times</ui.Button>
    </ui.Stack>
  );
}`),
  },
  {
    id: 'ui',
    title: 'Your UI is a description, not the DOM',
    prose:
      "You write real React — hooks, state, props — but there's no DOM in your world, so it can't draw pixels. Instead your React produces a *description* that crosses to the wrapper, which renders it with its own vetted components. That's why you compose with `<Stack>`, `<Card>`, `<Text>`, `<Button>` and not `<div>`/`<span>`: raw HTML has nothing to render into here, and the curated set is what the wrapper knows how to draw safely. Events come back to you as small data snapshots — read `e.detail`.",
    code: app(`function App({ session }) {
  const [name, setName] = useState('');
  return (
    <ui.Stack gap={12}>
      <ui.Card padding={16}>
        <ui.Stack gap={8}>
          <ui.Heading level={3}>A tiny form</ui.Heading>
          <ui.Input label="Your name" onChange={(e) => setName(e.detail.value)} />
          <ui.Text>{name ? 'Hi, ' + name : 'Type above — state and events are plain React.'}</ui.Text>
        </ui.Stack>
      </ui.Card>
    </ui.Stack>
  );
}`),
  },
  {
    id: 'fhir',
    title: 'Reading patient data — session.smart',
    prose:
      "Now the capabilities make sense. To read FHIR you don't `fetch` a server — you ask `session.smart`, which is your SMART context (the patient, the granted scopes) plus scoped FHIR calls. You pass a resource type and search params; the wrapper builds the URL, attaches the token, enforces the scopes, and returns parsed resources. Same bargain: you ask, it does the privileged call.",
    code: app(`function App({ session }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    session.smart.search('Observation', {
      patient: session.smart.patient.id,
      code: 'http://loinc.org|29463-7', // body weight
      _count: 8, _sort: 'date',
    }).then((bundle) => setRows(
      (bundle.entry || []).map((e) => e.resource)
        .filter((r) => r && r.valueQuantity)
        .map((r) => ({ when: (r.effectiveDateTime || '').slice(0, 10), value: r.valueQuantity.value + ' kg' }))
    ));
  }, []);
  return (
    <ui.Stack gap={10}>
      <ui.Heading level={2}>Recent weights</ui.Heading>
      <ui.Table columns={[{ key: 'when', label: 'Date' }, { key: 'value', label: 'Weight' }]} rows={rows} />
    </ui.Stack>
  );
}`),
  },
  {
    id: 'ai',
    title: 'Calling the model — session.ai',
    prose:
      "The model is just another capability. `session.ai` is OpenAI-shaped, but `profile` (not an API key) selects an approved model — there's no key in your applet. Use `stream` to render tokens as they arrive. Behind the scenes the wrapper can let the model call its own broker-side tools (like a scoped FHIR read), so the model gets facts without your applet handing it any new power.",
    code: app(`function App({ session }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setText('');
    await session.ai.stream(
      { profile: 'summarizer', messages: [{ role: 'user', content: 'Summarize the encounter.' }] },
      (delta) => setText((t) => t + delta),
    );
    setBusy(false);
  };
  return (
    <ui.Stack gap={10}>
      <ui.Button variant="primary" disabled={busy} onPress={run}>{busy ? 'Streaming…' : 'Summarize'}</ui.Button>
      <ui.Card padding={14}><ui.Text>{text || 'Press Summarize — tokens stream in.'}</ui.Text></ui.Card>
    </ui.Stack>
  );
}`),
  },
  {
    id: 'styles',
    title: 'Styling — session.styles',
    prose:
      "The component props cover the basics, but for real design you write CSS — and it goes through the same bargain. You hand the wrapper a stylesheet; it validates that the CSS can't reach the network or escape your surface, then installs it scoped to your applet only. You get grids, gradients, @media and @keyframes; you can't restyle the clinician's chrome or leak data through a background image.",
    code: app(`const CSS = \`.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; }
.tile { padding:14px; border-radius:12px; color:#fff; background:linear-gradient(135deg,#0ea5e9,#22c55e); }\`;

function App({ session }) {
  useEffect(() => { session.styles.add(CSS); }, []);
  return (
    <ui.Stack gap={10}>
      <ui.Heading level={2}>Your own CSS</ui.Heading>
      <ui.Box className="tiles">
        <ui.Box className="tile">72 bpm</ui.Box>
        <ui.Box className="tile">98%</ui.Box>
      </ui.Box>
    </ui.Stack>
  );
}`),
  },
  {
    id: 'files',
    title: 'Showing a protected document — session.files',
    prose:
      "Here's where the model pays off. A clinical document (a scan, a PDF) sits behind the same token you never get to see. So you don't fetch it — you ask `session.files.open`, and the wrapper fetches it with the token and hands you back an opaque *handle*, not a URL. You render the handle with `<Image>`; the wrapper resolves it. You display the document without ever holding its address or the credential — the bargain again, now for binaries.",
    code: app(`function App({ session }) {
  const [handle, setHandle] = useState();
  useEffect(() => {
    session.files.open({ url: 'demo:discharge-summary', title: 'Discharge summary' })
      .then((r) => r.ok && setHandle(r.handle));
  }, []);
  return (
    <ui.Stack gap={10}>
      <ui.Heading level={2}>A protected document</ui.Heading>
      <ui.Text tone="muted">No URL, no token — just an opaque handle the wrapper resolves.</ui.Text>
      {handle ? <ui.Image handle={handle} alt="Discharge summary" /> : <ui.Text tone="muted">Loading…</ui.Text>}
    </ui.Stack>
  );
}`),
  },
  {
    id: 'ship',
    title: 'That’s the whole model — now ship it',
    prose:
      "Every capability is the same shape: you state intent through `session`, the wrapper does the privileged thing and returns a safe result — read data, call the model, style your surface, open a document, record an action. Nothing your applet does can escape the sandbox, whoever wrote it. Build here in the playground, then host the compiled bundle anywhere and load it with /run/?applet=<url>. Same sandbox, same rules.",
    code: app(`function App({ session }) {
  return (
    <ui.Stack gap={10}>
      <ui.Heading level={2}>You’ve got the model</ui.Heading>
      <ui.Alert tone="success" title="State intent → the wrapper does the privileged part">
        session.smart · session.ai · session.styles · session.files · session.audit
      </ui.Alert>
      <ui.Text tone="muted">Edit any earlier lesson and re-run, or open the Examples tab.</ui.Text>
    </ui.Stack>
  );
}`),
  },
];

export const lessonProject = (lesson: Lesson): ProjectFile[] => [{path: 'App.tsx', content: lesson.code}];
