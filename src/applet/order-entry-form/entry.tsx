// W3 acceptance applet: a form-heavy app with familiar React event code, keyboard
// navigation (native tab order + Enter-to-submit), focus management (autoFocus),
// and inline validation. Events arrive as bounded safe snapshots (e.detail.*).
import {useState} from 'react';
import {runApplet, type AppletProps} from '../runtime';
import {Stack, Heading, Text, Input, Textarea, Button, Alert} from '../remote-elements';

function OrderEntry({clinical, context}: AppletProps) {
  const [med, setMed] = useState('');
  const [dose, setDose] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const medInvalid = med !== '' && med.trim().length <= 1;
  const doseInvalid = dose !== '' && !/\d/.test(dose);
  const valid = med.trim().length > 1 && /\d/.test(dose);

  const submit = () => {
    if (!valid) return;
    setSubmitted(true);
    void clinical.audit({
      kind: 'application',
      code: 'applet.user-action',
      message: `order-entry: ${med.trim()} ${dose.trim()}`,
    });
  };

  return (
    <Stack gap={14}>
      <Stack gap={4}>
        <Heading level={2}>New order</Heading>
        <Text tone="muted">Patient: {context.patient.display} — Tab between fields, Enter to submit.</Text>
      </Stack>
      <Input
        label="Medication"
        value={med}
        autoFocus
        placeholder="e.g. Lisinopril"
        invalid={medInvalid}
        onChange={(e: any) => setMed(String(e.detail.value))}
        onKeyDown={(e: any) => {
          if (e.detail?.key === 'Enter') submit();
        }}
      />
      <Input
        label="Dose"
        value={dose}
        placeholder="e.g. 10 mg"
        invalid={doseInvalid}
        onChange={(e: any) => setDose(String(e.detail.value))}
        onKeyDown={(e: any) => {
          if (e.detail?.key === 'Enter') submit();
        }}
      />
      <Textarea
        label="Notes (optional)"
        rows={3}
        value={notes}
        placeholder="Indication, instructions…"
        onChange={(e: any) => setNotes(String(e.detail.value))}
      />
      {submitted ? (
        <Alert tone="success" title="Queued for review">
          Order for {med.trim()} ({dose.trim()}) queued.
        </Alert>
      ) : null}
      <Button variant="primary" disabled={!valid} onPress={submit}>
        Submit order
      </Button>
    </Stack>
  );
}

runApplet(OrderEntry, {appletId: 'org.example.order-entry-form', appletVersion: '0.1.0'});
