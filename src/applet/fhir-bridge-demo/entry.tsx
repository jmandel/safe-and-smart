/** @jsxImportSource ../safe-react */
// Demonstrates the https://fhir.internal/ fetch bridge: the applet calls ordinary
// fetch() against a FHIR-looking endpoint and gets back parsed resources, with no
// token and no absolute server URL ever present in the sandbox. Written in
// intrinsic JSX (no Remote DOM imports).
import {useEffect, useState} from 'react';
import {runApplet, type AppletProps} from '../runtime';

interface Bundle {
  entry?: Array<{resource?: {valueQuantity?: {value?: number; unit?: string}; effectiveDateTime?: string}}>;
}

function FhirBridgeDemo({context}: AppletProps) {
  const [status, setStatus] = useState('loading…');
  const [rows, setRows] = useState<Array<{when: string; value: string}>>([]);

  useEffect(() => {
    (async () => {
      try {
        // Familiar fetch ergonomics — routed through the broker, not the network.
        const response = await fetch(
          `https://fhir.internal/Observation?patient=${context.patient.id}&code=http://loinc.org|29463-7&_count=5`,
        );
        if (!response.ok) throw new Error(`FHIR responded ${response.status}`);
        const bundle = (await response.json()) as Bundle;
        const observations = (bundle.entry ?? [])
          .map((e) => e.resource)
          .filter(Boolean)
          .slice(0, 5)
          .map((r) => ({
            when: String(r!.effectiveDateTime ?? '').slice(0, 10),
            value: `${r!.valueQuantity?.value ?? '?'} ${r!.valueQuantity?.unit ?? ''}`.trim(),
          }));
        setRows(observations);
        setStatus(`fetched ${observations.length} weight observations via https://fhir.internal/`);
      } catch (error) {
        setStatus(`bridge error: ${(error as Error).message}`);
      }
    })();
  }, [context.patient.id]);

  return (
    <ui-stack gap={12}>
      <ui-card padding={20}>
        <ui-stack gap={8}>
          <ui-heading level={2}>FHIR fetch bridge</ui-heading>
          <ui-text tone="muted">Patient: {context.patient.display}</ui-text>
          <ui-badge tone={rows.length ? 'positive' : 'neutral'}>{status}</ui-badge>
        </ui-stack>
      </ui-card>
      {rows.length > 0 ? (
        <ui-card padding={16}>
          <ui-table
            caption="Recent weights (via fhir.internal)"
            columns={[
              {key: 'when', label: 'Date'},
              {key: 'value', label: 'Weight'},
            ]}
            rows={rows}
          />
        </ui-card>
      ) : null}
    </ui-stack>
  );
}

runApplet(FhirBridgeDemo, {appletId: 'org.example.fhir-bridge-demo', appletVersion: '0.1.0'});
