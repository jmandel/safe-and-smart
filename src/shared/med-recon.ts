// Medication-reconciliation adjudication — this stands in for the FRONTIER MODEL.
// In production the applet hands the structured med list plus up to ~10 clinical
// notes to llmComplete, and a real model extracts mentions, reconciles against the
// list, and proposes clinician-facing actions. Here the wrapper's mock LLM runs
// this deterministic stand-in so the demo needs no credentials or network. The
// applet never does this work itself — it only gathers inputs and renders output.

export interface MedListEntry {
  display: string;
  status: string;
  authoredOn?: string;
}

export interface NoteInput {
  title: string;
  text: string;
}

export interface StructuredMed {
  display: string;
  name: string;
  status: string;
  authoredOn?: string;
}

type Assertion = 'active' | 'stopped' | 'mentioned';

export interface Discrepancy {
  medication: string;
  type: 'note-active-not-active-in-list' | 'note-stopped-active-in-list' | 'on-list-not-addressed';
  detail: string;
  severity: 'review' | 'info';
  suggestedAction: string;
  rationale: string;
}

export interface AdjudicationResult {
  summary: string;
  structured: StructuredMed[];
  discrepancies: Discrepancy[];
}

const FORM_NOISE = /\b(\d+.*|oral|tablet|capsule|mg|ml|solution|injection|prefilled|syringe|hcl|as needed|prn)\b.*/i;
const EXTRA_VOCAB = ['cetirizine', 'aspirin', 'ibuprofen', 'acetaminophen', 'omeprazole', 'lisinopril', 'metformin'];
const SYNTHETIC_OTC = 'cetirizine';
const ACTIVE_CUES = /(continues? to take|takes|taking|started|using|reports .* tak)/i;
const STOPPED_CUES = /(no longer|discontinued|stopped|off )/i;

export function normalizeMed(display: string): string {
  return display.replace(FORM_NOISE, '').replace(/[^a-zA-Z\s-]/g, '').trim().toLowerCase();
}

export function toStructured(meds: MedListEntry[]): StructuredMed[] {
  const byName = new Map<string, StructuredMed>();
  for (const m of meds) {
    const name = normalizeMed(m.display);
    if (!name) continue;
    const prev = byName.get(name);
    if (!prev || (m.authoredOn ?? '') > (prev.authoredOn ?? '')) {
      byName.set(name, {display: m.display, name, status: m.status, authoredOn: m.authoredOn});
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Build a small set of synthetic notes from the real med list, so the model has
// something with deliberate discrepancies to reconcile. Clearly demonstration data.
export function buildSyntheticNotes(meds: MedListEntry[]): NoteInput[] {
  const s = toStructured(meds);
  const visit = [
    'SYNTHETIC PROGRESS NOTE (generated for demonstration — not a real clinical note).',
    'Patient seen for routine follow-up; doing well overall.',
    s[0] ? `Family reports he continues to take ${title(s[0].name)} as needed for symptom relief.` : '',
    `He was recently started on over-the-counter ${title(SYNTHETIC_OTC)} for seasonal allergic rhinitis.`,
    'Plan: continue current regimen; reconcile medication list at next visit.',
  ].filter(Boolean).join(' ');
  const telephone = [
    'SYNTHETIC TELEPHONE NOTE (demonstration).',
    s[1] ? `Caregiver states they are no longer giving ${title(s[1].name)}.` : 'No medication changes reported.',
  ].join(' ');
  return [
    {title: 'Office visit note', text: visit},
    {title: 'Telephone encounter', text: telephone},
  ];
}

function extractMentions(noteText: string, vocab: string[]): Array<{name: string; assertion: Assertion}> {
  const lower = noteText.toLowerCase();
  const out: Array<{name: string; assertion: Assertion}> = [];
  for (const name of new Set(vocab)) {
    const idx = lower.indexOf(name);
    if (idx === -1) continue;
    const window = noteText.slice(Math.max(0, idx - 60), idx + name.length + 30);
    out.push({
      name,
      assertion: STOPPED_CUES.test(window) ? 'stopped' : ACTIVE_CUES.test(window) ? 'active' : 'mentioned',
    });
  }
  return out;
}

const RANK: Record<Assertion, number> = {active: 3, stopped: 2, mentioned: 1};

export function adjudicate(medList: MedListEntry[], notes: NoteInput[]): AdjudicationResult {
  const structured = toStructured(medList);
  const byName = new Map(structured.map((m) => [m.name, m]));
  const vocab = [...structured.map((m) => m.name), ...EXTRA_VOCAB];

  // Merge mentions across all notes, keeping the strongest assertion per drug.
  const merged = new Map<string, Assertion>();
  for (const note of notes) {
    for (const {name, assertion} of extractMentions(note.text, vocab)) {
      if (!merged.has(name) || RANK[assertion] > RANK[merged.get(name)!]) merged.set(name, assertion);
    }
  }

  const discrepancies: Discrepancy[] = [];
  for (const [name, assertion] of merged) {
    const listed = byName.get(name);
    const activeInList = listed?.status === 'active';
    if (assertion === 'active' && !activeInList) {
      discrepancies.push({
        medication: listed?.display ?? title(name),
        type: 'note-active-not-active-in-list',
        detail: listed
          ? `Notes describe active use, but the list shows status "${listed.status}".`
          : 'Documented in the notes but absent from the structured medication list.',
        severity: 'review',
        suggestedAction: listed ? 'Confirm current use; reactivate or update the order.' : 'Confirm and add to the medication list.',
        rationale: 'A medication a patient is actively taking should appear as active on the reconciled list.',
      });
    } else if (assertion === 'stopped' && activeInList) {
      discrepancies.push({
        medication: listed!.display,
        type: 'note-stopped-active-in-list',
        detail: 'Notes indicate discontinuation, but the list still shows it active.',
        severity: 'review',
        suggestedAction: 'Confirm discontinuation; stop the active order.',
        rationale: 'A medication the patient has stopped should not remain active on the list.',
      });
    }
  }
  for (const med of structured) {
    if (med.status === 'active' && !merged.has(med.name)) {
      discrepancies.push({
        medication: med.display,
        type: 'on-list-not-addressed',
        detail: 'Active on the list but not addressed in any recent note.',
        severity: 'info',
        suggestedAction: 'Confirm the patient is still taking this.',
        rationale: 'Active medications should be periodically confirmed against the clinical record.',
      });
    }
  }

  const reviews = discrepancies.filter((d) => d.severity === 'review');
  const summary =
    `Reviewed ${notes.length} note(s) against ${structured.length} structured medication(s) and ` +
    `identified ${discrepancies.length} item(s) for reconciliation` +
    (reviews.length ? `, ${reviews.length} warranting clinician review:` : '.') +
    reviews.map((d) => ` • ${d.medication}: ${d.suggestedAction}`).join('') +
    ' No orders were changed; all items are routed for clinician confirmation. ' +
    '(Synthetic demonstration; not medical advice.)';

  return {summary, structured, discrepancies};
}

function title(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
