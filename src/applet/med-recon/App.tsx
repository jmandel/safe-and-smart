import React, {useEffect, useState} from 'react';
import type {AppletProps} from '../runtime';
import type {FhirBundle, FhirResource} from '../../shared/fhir';
import {buildSyntheticNotes, type Discrepancy, type NoteInput, type StructuredMed} from '../../shared/med-recon';
import {Alert, Badge, Button, Card, Grid, Heading, Stack, Stat, Table, Text} from '../remote-elements';

interface MedicationRequest extends FhirResource {
  status: string;
  medicationCodeableConcept?: {text?: string; coding?: Array<{display?: string}>};
  authoredOn?: string;
}

interface Adjudication {
  discrepancies: Discrepancy[];
  structured: StructuredMed[];
}

type Phase =
  | {status: 'loading'}
  | {status: 'error'; message: string}
  | {status: 'ready'; notes: NoteInput[]; summary: string; result: Adjudication};

// A JSON-schema-style hint passed to the model describing the structured output
// we want back (the broker mock honors the med-reconciliation profile).
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    discrepancies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          medication: {type: 'string'},
          type: {type: 'string'},
          detail: {type: 'string'},
          severity: {enum: ['review', 'info']},
          suggestedAction: {type: 'string'},
          rationale: {type: 'string'},
        },
      },
    },
  },
};

export function App({clinical, context, securityProbe}: AppletProps) {
  const [phase, setPhase] = useState<Phase>({status: 'loading'});
  const [resolved, setResolved] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // 1. Gather inputs: the live structured med list + (here synthetic) notes.
        const bundle = (await clinical.fhirRequest({
          url: `MedicationRequest?patient=${encodeURIComponent(context.patient.id)}&_count=100`,
        })) as FhirBundle<MedicationRequest>;
        const medList = (bundle.entry ?? []).map((entry) => ({
          display:
            entry.resource.medicationCodeableConcept?.text ??
            entry.resource.medicationCodeableConcept?.coding?.[0]?.display ??
            'Unknown medication',
          status: entry.resource.status,
          authoredOn: entry.resource.authoredOn,
        }));
        const notes = buildSyntheticNotes(medList);

        // 2. Hand the med list + notes to the MODEL using the familiar OpenAI
        //    chat.completions shape. The runtime's LLM bridge routes this to the
        //    wrapper's brokered model — no API key, no real network. (The real
        //    `openai` JS client works the same way: point its baseURL at
        //    https://llm.internal/v1.) The model does the extraction/reconciliation;
        //    the applet does none of that work.
        const httpResponse = await fetch('https://llm.internal/v1/chat/completions', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({
            model: 'baa-med-reconciliation-demo', // == approved model/profile
            response_format: {type: 'json_schema', json_schema: {name: 'reconciliation', schema: RESPONSE_SCHEMA}},
            messages: [
              {
                role: 'system',
                content:
                  'You are a clinical pharmacist assistant. Given a structured medication ' +
                  'list and recent clinical notes, extract medication mentions from the notes, ' +
                  'reconcile them against the list, and return discrepancies with proposed ' +
                  'clinician review actions. Never invent medications; never auto-apply changes.',
              },
              {role: 'user', content: JSON.stringify({medList, notes})},
            ],
          }),
        });
        const completion = (await httpResponse.json()) as {
          choices: Array<{message: {content: string}}>;
        };
        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as {
          summary?: string;
        } & Adjudication;

        if (cancelled) return;
        setPhase({
          status: 'ready',
          notes,
          summary: parsed.summary ?? 'No summary returned.',
          result: {discrepancies: parsed.discrepancies ?? [], structured: parsed.structured ?? []},
        });
      } catch (error) {
        if (!cancelled) {
          setPhase({status: 'error', message: error instanceof Error ? error.message : 'Reconciliation failed.'});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinical, context.patient.id]);

  const contained =
    securityProbe.directDomUnavailable &&
    securityProbe.directNetworkBlocked &&
    securityProbe.persistentStorageBlocked;

  if (phase.status === 'loading') {
    return (
      <Card padding={28}>
        <Heading level={2}>Reconciling medications…</Heading>
        <Text tone="muted">
          Fetching the medication list, then asking the model to reconcile it against recent notes.
        </Text>
      </Card>
    );
  }
  if (phase.status === 'error') {
    return <Alert tone="danger" title="Reconciliation failed">{phase.message}</Alert>;
  }

  const {notes, summary, result} = phase;
  const reviewCount = result.discrepancies.filter((d) => d.severity === 'review').length;

  return (
    <Stack gap={16}>
      <Card padding={22} tone="accent">
        <Stack direction="row" align="center" justify="space-between" gap={12}>
          <Stack gap={4}>
            <Heading level={1}>Medication Reconciliation</Heading>
            <Text tone="muted">
              Live structured med list + recent notes · model-driven reconciliation
            </Text>
          </Stack>
          <Badge tone={contained ? 'positive' : 'warning'}>
            {contained ? 'Applet isolation checks passed' : 'Review isolation checks'}
          </Badge>
        </Stack>
        <Alert tone="info" title="Demonstration only">
          Structured medications are from the live SMART sandbox; the notes are synthetic and the
          reconciliation is produced by a stand-in model. Not medical advice.
        </Alert>
      </Card>

      <Grid columns={3} minimumColumnWidth={180} gap={12}>
        <Stat label="Structured medications" value={String(result.structured.length)} />
        <Stat label="Notes reviewed" value={String(notes.length)} />
        <Stat label="Needs review" value={String(reviewCount)} />
      </Grid>

      <Card padding={18}>
        <Stack gap={10}>
          <Heading level={2}>Model adjudication</Heading>
          <Alert tone="success" title="Reconciliation summary (synthetic model)">{summary}</Alert>
        </Stack>
      </Card>

      <Card padding={18}>
        <Stack gap={12}>
          <Heading level={2}>Discrepancies &amp; proposed actions</Heading>
          {result.discrepancies.length === 0 ? (
            <Text tone="muted">No discrepancies detected between the notes and the list.</Text>
          ) : (
            <Stack gap={10}>
              {result.discrepancies.map((d, index) => (
                <Card key={`${d.medication}-${index}`} padding={14}>
                  <Stack gap={8}>
                    <Stack direction="row" align="center" justify="space-between" gap={8}>
                      <Text weight="medium">{d.medication}</Text>
                      <Badge tone={d.severity === 'review' ? 'warning' : 'neutral'}>
                        {d.severity === 'review' ? 'Needs review' : 'FYI'}
                      </Badge>
                    </Stack>
                    <Text size="small" tone="muted">{d.detail}</Text>
                    <Text size="small">Proposed: {d.suggestedAction}</Text>
                    <Text size="small" tone="muted">Why: {d.rationale}</Text>
                    <Stack direction="row" gap={8}>
                      <Button
                        variant="secondary"
                        disabled={Boolean(resolved[d.medication])}
                        onPress={() => {
                          setResolved((r) => ({...r, [d.medication]: 'accepted'}));
                          void clinical.audit({
                            kind: 'application',
                            message: `med-recon: accepted proposed action for ${d.medication}`,
                          });
                        }}
                      >
                        {resolved[d.medication] === 'accepted' ? 'Queued for clinician' : 'Accept for review'}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={Boolean(resolved[d.medication])}
                        onPress={() => {
                          setResolved((r) => ({...r, [d.medication]: 'dismissed'}));
                          void clinical.audit({
                            kind: 'application',
                            message: `med-recon: dismissed discrepancy for ${d.medication}`,
                          });
                        }}
                      >
                        {resolved[d.medication] === 'dismissed' ? 'Dismissed' : 'Dismiss'}
                      </Button>
                    </Stack>
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      <Card padding={18}>
        <Stack gap={10}>
          <Heading level={2}>Notes reviewed (synthetic)</Heading>
          {notes.map((note) => (
            <Stack key={note.title} gap={2}>
              <Text weight="medium" size="small">{note.title}</Text>
              <Text size="small" tone="muted">{note.text}</Text>
            </Stack>
          ))}
        </Stack>
      </Card>

      <Card padding={18}>
        <Stack gap={12}>
          <Heading level={2}>Structured medication list</Heading>
          <Table
            caption={`${result.structured.length} medications from MedicationRequest`}
            columns={[
              {key: 'display', label: 'Medication'},
              {key: 'status', label: 'Status'},
              {key: 'authoredOn', label: 'Authored'},
            ]}
            rows={result.structured.map((m) => ({
              display: m.display,
              status: m.status,
              authoredOn: m.authoredOn?.slice(0, 10) ?? '',
            }))}
          />
        </Stack>
      </Card>
    </Stack>
  );
}
