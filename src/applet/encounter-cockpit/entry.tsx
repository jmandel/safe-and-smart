// Capstone applet: exercises the full capability surface in one clinical UI under
// the unchanged sandbox — CSS Modules (registerStylesheet), the FHIR fetch bridge,
// a Vega chart + accessible table, streaming LLM with a brokered tool, a validated
// SVG diagram, and a protected attachment via an opaque handle.
import {useEffect, useState} from 'react';
import {runApplet, type AppletProps} from '../runtime';
import {
  Stack,
  Box,
  Inline,
  Heading,
  Text,
  Badge,
  Button,
  Card,
  Vega,
  Table,
  Svg,
  Image,
} from '../remote-elements';

const STYLES = `
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
.panel { display: block; padding: 16px; border-radius: 14px; background: #fff; border: 1px solid #e2e8f0; }
.panel.dark { background: linear-gradient(135deg, #0f172a, #1e293b); color: #e2e8f0; border: 0; }
.summary { display: block; white-space: pre-wrap; line-height: 1.5; min-height: 48px; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #22c55e; }
`;

const PATHWAY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 70" width="100%">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs>
  <line x1="40" y1="35" x2="320" y2="35" stroke="url(#g)" stroke-width="5" stroke-linecap="round"/>
  <g><circle cx="40" cy="35" r="16" fill="#0ea5e9"/><text x="40" y="39" text-anchor="middle" fill="#fff" font-size="9">Triage</text></g>
  <g><circle cx="180" cy="35" r="16" fill="#14b8a6"/><text x="180" y="39" text-anchor="middle" fill="#fff" font-size="9">Workup</text></g>
  <g><circle cx="320" cy="35" r="16" fill="#22c55e"/><text x="320" y="39" text-anchor="middle" fill="#fff" font-size="9">Plan</text></g>
</svg>`;

interface Reading {
  when: string;
  value: number;
}

function chartSpec(readings: Reading[]) {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 160,
    data: {values: readings},
    mark: {type: 'line', point: true, tooltip: true},
    encoding: {
      x: {field: 'when', type: 'temporal', title: 'Date'},
      y: {field: 'value', type: 'quantitative', title: 'Weight (kg)', scale: {zero: false}},
    },
  };
}

function EncounterCockpit({context, clinical}: AppletProps) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [summary, setSummary] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [docHandle, setDocHandle] = useState<string>();

  useEffect(() => {
    void clinical.registerStylesheet({css: STYLES});
    // FHIR via the fetch bridge — no token in the applet.
    (async () => {
      try {
        const res = await fetch(
          `https://fhir.internal/Observation?patient=${context.patient.id}&code=http://loinc.org|29463-7&_count=12&_sort=date`,
        );
        const bundle = await res.json();
        const rows: Reading[] = (bundle.entry ?? [])
          .map((e: any) => e.resource)
          .filter((r: any) => r?.valueQuantity && r?.effectiveDateTime)
          .map((r: any) => ({when: r.effectiveDateTime.slice(0, 10), value: r.valueQuantity.value}));
        setReadings(rows);
      } catch {
        /* leave empty */
      }
    })();
    clinical.fetchAttachment({url: 'demo:encounter-note', title: 'Encounter note'}).then((r) => {
      if (r.ok) setDocHandle(r.handle);
    });
  }, [clinical, context.patient.id]);

  const summarize = async () => {
    setStreaming(true);
    setSummary('');
    try {
      const res = await fetch('https://llm.internal/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'note-summarizer',
          stream: true,
          messages: [{role: 'user', content: `Summarize the encounter for ${context.patient.display}`}],
        }),
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        buf += decoder.decode(value, {stream: true});
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const m = part.match(/^data: (.*)$/m);
          if (!m || m[1] === '[DONE]') continue;
          try {
            const d = JSON.parse(m[1]!).choices?.[0]?.delta?.content;
            if (d) setSummary((s) => s + d);
          } catch {
            /* ignore */
          }
        }
      }
    } finally {
      setStreaming(false);
    }
  };

  const tableRows = readings.map((r) => ({when: r.when, value: `${r.value} kg`}));

  return (
    <Stack gap={14}>
      <Box className="panel dark">
        <Stack gap={6}>
          <Heading level={2}>Encounter cockpit — {context.patient.display}</Heading>
          <Inline>
            <Badge tone="positive">
              <Inline className="dot" /> live
            </Badge>{' '}
            <Text tone="muted">CSS · FHIR · chart · streaming LLM+tool · SVG · attachment</Text>
          </Inline>
        </Stack>
      </Box>

      <Box className="grid">
        <Box className="panel">
          <Stack gap={8}>
            <Heading level={3}>Weight trend</Heading>
            {readings.length ? (
              <Vega spec={chartSpec(readings)} ariaLabel="Weight trend" minimumHeight={180} />
            ) : (
              <Text tone="muted">Loading observations…</Text>
            )}
          </Stack>
        </Box>

        <Box className="panel">
          <Stack gap={8}>
            <Heading level={3}>AI summary</Heading>
            <Button variant="primary" disabled={streaming} onPress={summarize}>
              {streaming ? 'Streaming…' : 'Summarize encounter'}
            </Button>
            <Text>
              <Inline className="summary">{summary || 'Press to stream a summary (uses a brokered FHIR tool).'}</Inline>
            </Text>
          </Stack>
        </Box>

        <Box className="panel">
          <Stack gap={8}>
            <Heading level={3}>Care pathway</Heading>
            <Svg markup={PATHWAY} ariaLabel="Care pathway: triage, workup, plan" />
          </Stack>
        </Box>

        <Box className="panel">
          <Stack gap={8}>
            <Heading level={3}>Encounter note</Heading>
            {docHandle ? <Image handle={docHandle} alt="Encounter note (protected)" /> : <Text tone="muted">Loading…</Text>}
          </Stack>
        </Box>
      </Box>

      {tableRows.length ? (
        <Card padding={16}>
          <Table
            caption="Weight observations (accessible tabular view of the chart)"
            columns={[
              {key: 'when', label: 'Date'},
              {key: 'value', label: 'Weight'},
            ]}
            rows={tableRows}
          />
        </Card>
      ) : null}
    </Stack>
  );
}

runApplet(EncounterCockpit, {appletId: 'org.example.encounter-cockpit', appletVersion: '0.1.0'});
