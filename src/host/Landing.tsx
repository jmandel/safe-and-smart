import React from 'react';

// Base-aware links. The wrapper runtime is the same page with a deep-link query
// (clean URLs — no .html). asset() builds an absolute path under the base.
const base = import.meta.env.BASE_URL;
const app = (query: string) => `${base}${query}`;
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
    href: app('?fhir=smart'),
    cta: 'Launch with SMART →',
    accent: true,
  },
  {
    title: 'Growth Explorer (demo data)',
    blurb:
      'No login. Opens a synthetic-but-live FHIR patient and renders an interactive growth chart entirely inside the sandbox.',
    href: app('?run=growth'),
    cta: 'Open Growth Explorer →',
  },
  {
    title: 'Medication Reconciliation (demo data)',
    blurb:
      'A different applet, same wrapper. Pulls the structured med list, hands it with recent notes to an LLM, and shows proposed reconciliation actions.',
    href: app('?applet=' + encodeURIComponent(asset('applets/med-recon.js'))),
    cta: 'Open Med Reconciliation →',
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

      <footer className="landing-foot">
        <p>
          All data is synthetic (SMART sandbox / fabricated). This is an architecture demonstration,
          not a clinical product. The applet picker in the top bar switches applets at any time.
        </p>
      </footer>
    </div>
  );
}
