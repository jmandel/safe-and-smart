/**
 * Minimal applet pattern. In the current spike, copy this shape into
 * src/applet/App.tsx and import components from ../src/applet/remote-elements.
 * A future browser compiler would provide these imports through
 * @clinical-applet/sdk.
 */
import React, {useEffect, useState} from 'react';
import {Card, Heading, Stack, Table, Text} from '../src/applet/remote-elements';
import type {
  ClinicalCapabilityApi,
  ClinicalContext,
  SecurityProbeResult,
} from '../src/shared/protocol';

export function MinimalApplet({
  clinical,
  context,
}: {
  clinical: ClinicalCapabilityApi;
  context: ClinicalContext;
  securityProbe: SecurityProbeResult;
}) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    void clinical
      .fhirRequest({
        url: `Condition?patient=${encodeURIComponent(context.patient.id)}&_count=100`,
      })
      .then((value: any) => {
        setRows(
          (value.entry ?? []).map((entry: any) => ({
            id: entry.resource?.id ?? '',
            condition:
              entry.resource?.code?.text ??
              entry.resource?.code?.coding?.[0]?.display ??
              'Unlabeled condition',
          })),
        );
      });
  }, [clinical, context.patient.id]);

  return (
    <Card padding={20}>
      <Stack gap={12}>
        <Heading level={1}>Condition overview</Heading>
        <Text tone="muted">
          Data is fetched through the active SMART-grant capability.
        </Text>
        <Table
          columns={[
            {key: 'id', label: 'FHIR ID'},
            {key: 'condition', label: 'Condition'},
          ]}
          rows={rows}
        />
      </Stack>
    </Card>
  );
}
