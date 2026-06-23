import React, {useEffect, useState} from 'react';
import type {AppletProps} from './runtime';
import type {FhirBundle, Observation, Patient} from '../shared/fhir';
import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Heading,
  Select,
  Slider,
  Stack,
  Stat,
  Table,
  Text,
  Vega,
} from './remote-elements';
import {
  buildGrowthSpec,
  extractMeasurements,
  metricLabels,
  type Metric,
  type ReferencePopulation,
  type Sex,
} from './growth-model';
import {useGrowthView} from './growth-store';

type LoadState =
  | {status: 'loading'}
  | {status: 'error'; message: string}
  | {status: 'ready'; patient: Patient; observations: Observation[]};

export function App({session}: AppletProps) {
  const [loadState, setLoadState] = useState<LoadState>({status: 'loading'});
  const [summary, setSummary] = useState<string>();
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Zustand selectors: each subscribes only to its slice and re-renders on change.
  const metric = useGrowthView((state) => state.metric);
  const sex = useGrowthView((state) => state.sex);
  const population = useGrowthView((state) => state.population);
  const maximumAge = useGrowthView((state) => state.maximumAge);
  const animating = useGrowthView((state) => state.animating);
  const {setMetric, setSex, setPopulation, setMaximumAge, startAnimation, advanceAnimation} =
    useGrowthView.getState();

  useEffect(() => {
    let cancelled = false;
    if (!session.smart.patient.id) {
      setLoadState({
        status: 'error',
        message: 'No patient is in context. Relaunch via SMART and select a patient.',
      });
      return;
    }
    void Promise.all([
      session.smart.read('Patient', session.smart.patient.id),
      session.smart.search('Observation', {
        patient: session.smart.patient.id,
        category: 'vital-signs',
        _count: 500,
      }),
    ])
      .then(([patientResult, observationResult]) => {
        if (cancelled) return;
        const bundle = observationResult as FhirBundle<Observation>;
        const patient = patientResult as Patient;
        if (patient.gender === 'male' || patient.gender === 'female') {
          setSex(patient.gender);
        }
        setLoadState({
          status: 'ready',
          patient,
          observations: bundle.entry?.map((entry) => entry.resource) ?? [],
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to load FHIR data.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session.smart.patient.id]);

  useEffect(() => {
    if (!animating) return;
    const timer = setInterval(advanceAnimation, 350);
    return () => clearInterval(timer);
  }, [animating, advanceAnimation]);

  if (loadState.status === 'loading') {
    return (
      <Card padding={28}>
        <Stack gap={10}>
          <Heading level={2}>Opening synthetic longitudinal record…</Heading>
          <Text tone="muted">FHIR access is crossing the token-equivalent broker capability.</Text>
        </Stack>
      </Card>
    );
  }

  if (loadState.status === 'error') {
    return (
      <Alert tone="danger" title="FHIR request failed">
        {loadState.message}
      </Alert>
    );
  }

  const patientName =
    (loadState.patient.name?.[0]?.text ??
    [
      ...(loadState.patient.name?.[0]?.given ?? []),
      loadState.patient.name?.[0]?.family,
    ]
      .filter(Boolean)
      .join(' ')) ||
    session.smart.patient.display;
  const birthDate = loadState.patient.birthDate ?? '2010-04-10';
  const measurements = extractMeasurements(loadState.observations, metric, birthDate);
  const latest = measurements.at(-1);
  const prior = measurements.at(-2);
  const change = latest && prior ? latest.value - prior.value : undefined;
  const chartSpec = buildGrowthSpec({
    measurements,
    metric,
    sex,
    population,
    maximumAge,
  });

  const tableRows = measurements
    .slice()
    .reverse()
    .map((point) => ({
      date: point.date,
      age: point.age.toFixed(2),
      value: point.value.toFixed(1),
      unit: point.unit,
    }));

  async function requestSummary() {
    setSummaryLoading(true);
    setSummary(undefined);
    try {
      const evidence = measurements.map((point) => ({
        date: point.date,
        ageYears: point.age,
        value: point.value,
        unit: point.unit,
      }));
      const response = await session.ai.complete({
        profile: 'baa-clinical-summary-demo',
        messages: [
          {
            role: 'system',
            content:
              'Summarize the longitudinal measurements. State uncertainty and do not diagnose.',
          },
          {
            role: 'user',
            content: JSON.stringify({patient: patientName, metric, evidence}),
          },
        ],
      });
      setSummary(response.text);
    } catch (error) {
      setSummary(error instanceof Error ? error.message : 'LLM request failed.');
    } finally {
      setSummaryLoading(false);
    }
  }

  const allSecurityChecksPassed =
    session.probe.directDomUnavailable &&
    session.probe.directNetworkBlocked &&
    session.probe.persistentStorageBlocked;

  return (
    <Stack gap={16}>
      <Card padding={22} tone="accent">
        <Stack gap={12}>
          <Stack direction="row" align="center" justify="space-between" gap={12}>
            <Stack gap={4}>
              <Heading level={1}>Growth Explorer</Heading>
              <Text tone="muted">
                Rich React applet · Remote DOM rendering · live SMART R4 sandbox data via token-less broker
              </Text>
            </Stack>
            <Badge tone={allSecurityChecksPassed ? 'positive' : 'warning'}>
              {allSecurityChecksPassed ? 'Applet isolation checks passed' : 'Review isolation checks'}
            </Badge>
          </Stack>
          <Alert tone="info" title="Demonstration only">
            All patient data and reference curves in this repository are fabricated and are not suitable for clinical use.
          </Alert>
        </Stack>
      </Card>

      <Grid columns={3} minimumColumnWidth={180} gap={12}>
        <Stat label="Patient" value={patientName} detail={`Born ${birthDate}`} />
        <Stat
          label={`Latest ${metricLabels[metric]}`}
          value={latest ? `${latest.value.toFixed(1)} ${latest.unit}` : 'No data'}
          detail={latest?.date ?? ''}
        />
        <Stat
          label="Change from prior"
          value={change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)} ${latest?.unit ?? ''}`}
          detail={prior ? `Since ${prior.date}` : ''}
        />
      </Grid>

      <Card padding={18}>
        <Stack gap={14}>
          <Heading level={2}>Interactive normalized growth view</Heading>
          <Grid columns={4} minimumColumnWidth={150} gap={12}>
            <Select
              label="Metric"
              value={metric}
              options={[
                {label: 'Height', value: 'height'},
                {label: 'Weight', value: 'weight'},
                {label: 'BMI', value: 'bmi'},
              ]}
              onChange={(event: any) => setMetric(event.detail.value as Metric)}
            />
            <Select
              label="Reference sex"
              value={sex}
              options={[
                {label: 'Female', value: 'female'},
                {label: 'Male', value: 'male'},
              ]}
              onChange={(event: any) => setSex(event.detail.value as Sex)}
            />
            <Select
              label="Reference population"
              value={population}
              options={[
                {label: 'Synthetic general population A', value: 'general-a'},
                {label: 'Synthetic general population B', value: 'general-b'},
                {label: 'Synthetic condition cohort', value: 'condition-cohort'},
              ]}
              onChange={(event: any) =>
                setPopulation(event.detail.value as ReferencePopulation)
              }
            />
            <Slider
              label="Visible through age"
              value={maximumAge}
              minimum={4}
              maximum={18}
              step={1}
              onChange={(event: any) => setMaximumAge(event.detail.value)}
            />
          </Grid>
          <Stack direction="row" gap={8} align="center">
            <Button variant="secondary" disabled={animating} onPress={() => startAnimation()}>
              {animating ? 'Animating…' : 'Animate across ages'}
            </Button>
            <Text tone="muted" size="small">
              React state updates are serialized as low-level Remote DOM mutations; Vega-Lite renders in the trusted host.
            </Text>
          </Stack>
          <Vega
            spec={chartSpec}
            ariaLabel={`${metricLabels[metric]} growth chart for ${patientName}`}
            minimumHeight={420}
          />
        </Stack>
      </Card>

      <Grid columns={2} minimumColumnWidth={280} gap={14}>
        <Card padding={18}>
          <Stack gap={12}>
            <Heading level={2}>Protected LLM tool</Heading>
            <Text tone="muted">
              The applet sends selected evidence through a host capability. It never receives the model credential or endpoint authority.
            </Text>
            <Button variant="primary" disabled={summaryLoading} onPress={requestSummary}>
              {summaryLoading ? 'Summarizing…' : 'Summarize longitudinal trend'}
            </Button>
            {summary ? <Alert tone="success" title="Synthetic model response">{summary}</Alert> : null}
          </Stack>
        </Card>

        <Card padding={18}>
          <Stack gap={10}>
            <Heading level={2}>Isolation probes</Heading>
            <ProbeRow label="Direct DOM" passed={session.probe.directDomUnavailable} />
            <ProbeRow label="Direct network" passed={session.probe.directNetworkBlocked} />
            <ProbeRow label="Persistent storage" passed={session.probe.persistentStorageBlocked} />
            <Text tone="muted" size="small">
              FHIR still succeeds because the trusted outer shell performs the authorized request over MessagePort RPC.
            </Text>
          </Stack>
        </Card>
      </Grid>

      <Card padding={18}>
        <Stack gap={12}>
          <Heading level={2}>FHIR observations</Heading>
          <Table
            caption={`${measurements.length} ${metricLabels[metric].toLowerCase()} observations returned through the broad FHIR request capability`}
            columns={[
              {key: 'date', label: 'Date'},
              {key: 'age', label: 'Age (years)'},
              {key: 'value', label: 'Value'},
              {key: 'unit', label: 'Unit'},
            ]}
            rows={tableRows}
          />
        </Stack>
      </Card>
    </Stack>
  );
}

function ProbeRow({label, passed}: {label: string; passed: boolean}) {
  return (
    <Stack direction="row" align="center" justify="space-between" gap={8}>
      <Text weight="medium">{label}</Text>
      <Badge tone={passed ? 'positive' : 'warning'}>{passed ? 'Blocked / unavailable' : 'Unexpectedly available'}</Badge>
    </Stack>
  );
}
