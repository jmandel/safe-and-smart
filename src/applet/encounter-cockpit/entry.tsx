// Capstone applet: exercises the full capability surface in one clinical UI under
// the unchanged sandbox — CSS Modules (registerStylesheet), the FHIR fetch bridge,
// a Vega chart + accessible table, streaming LLM with a brokered tool, a validated
// SVG diagram, and an inline document rendered from a self-contained data: URL.
import {useEffect, useState} from 'react';
import {runApplet, type AppletProps} from '../runtime';
import {
  Stack,
  Box,
  Inline,
  Heading,
  Text,
  Button,
  Card,
  Vega,
  Table,
  Svg,
  Image,
} from '../remote-elements';

const STYLES = `
.cockpit-head { display: block; padding: 18px 20px; border-radius: 16px; background: #fff;
  border: 1px solid #e2e8f0; border-left: 5px solid #14b8a6; }
.cockpit-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700;
  color: #0f5132; background: #dcfce7; border-radius: 999px; padding: 4px 11px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #16a34a; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag { display: inline-block; font-size: 11px; font-weight: 600; color: #0f766e; background: #ccfbf1;
  border-radius: 999px; padding: 3px 9px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
.panel { display: block; padding: 16px; border-radius: 14px; background: #fff; border: 1px solid #e2e8f0; }
.summary { display: block; white-space: pre-wrap; line-height: 1.55; min-height: 48px; color: #334155; }
`;

const PATHWAY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 70" width="100%">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs>
  <line x1="40" y1="35" x2="320" y2="35" stroke="url(#g)" stroke-width="5" stroke-linecap="round"/>
  <g><circle cx="40" cy="35" r="16" fill="#0ea5e9"/><text x="40" y="39" text-anchor="middle" fill="#fff" font-size="9">Triage</text></g>
  <g><circle cx="180" cy="35" r="16" fill="#14b8a6"/><text x="180" y="39" text-anchor="middle" fill="#fff" font-size="9">Workup</text></g>
  <g><circle cx="320" cy="35" r="16" fill="#22c55e"/><text x="320" y="39" text-anchor="middle" fill="#fff" font-size="9">Plan</text></g>
</svg>`;

// An inline document. In a real applet these bytes come from a FHIR Attachment's
// base64 `data` read via session.smart; here they're synthesized. Either way the
// applet holds the bytes and renders a self-contained data: URL — no fetch, so
// nothing to exfiltrate. (<Image src> accepts data: URLs only.)
const NOTE_DATA_URL = `data:image/svg+xml;base64,${btoa(
  "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='150' viewBox='0 0 320 150'>" +
    "<rect width='320' height='150' rx='10' fill='#0f172a'/>" +
    "<text x='20' y='40' fill='#e2e8f0' font-family='sans-serif' font-size='14'>Encounter note</text>" +
    "<text x='20' y='72' fill='#94a3b8' font-family='sans-serif' font-size='11'>Inline attachment bytes - shown directly.</text>" +
    "<text x='20' y='94' fill='#64748b' font-family='sans-serif' font-size='10'>No URL, no token, no network request.</text>" +
    '</svg>',
)}`;

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

function EncounterCockpit({session}: AppletProps) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [summary, setSummary] = useState('');
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    void session.styles.add(STYLES);
    // FHIR via the fetch bridge — no token in the applet.
    (async () => {
      try {
        const res = await fetch(
          `https://fhir.internal/Observation?patient=${session.smart.patient.id}&code=http://loinc.org|29463-7&_count=12&_sort=date`,
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
  }, [session.smart.patient.id]);

  const summarize = async () => {
    setStreaming(true);
    setSummary('');
    try {
      const res = await fetch('https://llm.internal/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'note-summarizer',
          stream: true,
          messages: [{role: 'user', content: `Summarize the encounter for ${session.smart.patient.display}`}],
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
      <Box className="cockpit-head">
        <Heading level={2}>Encounter cockpit</Heading>
        <Text tone="muted">{session.smart.patient.display}</Text>
        <Box className="cockpit-meta">
          <Inline className="live">
            <Inline className="dot" /> Live
          </Inline>
          <Box className="tags">
            {['CSS', 'FHIR', 'Chart', 'Streaming LLM + tool', 'SVG', 'Attachment'].map((t) => (
              <Inline key={t} className="tag">
                {t}
              </Inline>
            ))}
          </Box>
        </Box>
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
            <Image src={NOTE_DATA_URL} alt="Encounter note" />
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
