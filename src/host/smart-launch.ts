import FHIR from 'fhirclient';
import {createSmartFhirTransport} from './broker/smart-fhirclient-adapter';
import type {FhirTransport} from './broker/fhir-capability';

// Real SMART standalone launch (the wrapper authenticates ONCE, for itself).
// Reached via the /fhir entry (entry-fhir.tsx). Defaults target the public SMART App Launcher sandbox.
// Override via VITE_SMART_ISS / VITE_SMART_CLIENT_ID / VITE_SMART_SCOPE at build.
// The SMART App Launcher encodes simulation options in the ISS path, even for a
// standalone launch. This sim URL selects a provider standalone launch (login +
// patient picker). Override VITE_SMART_ISS to point at a real EHR's FHIR base.
const ISS =
  import.meta.env.VITE_SMART_ISS ??
  'https://launch.smarthealthit.org/v/r4/sim/WzIsIiIsIiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0/fhir';
const CLIENT_ID = import.meta.env.VITE_SMART_CLIENT_ID ?? 'clinical-sandbox-demo';
// Standalone launch scopes. launch/patient requests a patient context — in a
// standalone launch the SMART App Launcher honors it by showing a patient picker
// (it advertises context-standalone-patient), so the applet gets context.patient.
// openid+fhirUser identify the clinician; patient/*.read grants read access.
const SCOPE = import.meta.env.VITE_SMART_SCOPE ?? 'launch/patient openid fhirUser patient/*.read';

export interface SmartInit {
  transport: FhirTransport;
  patient: {id: string; display: string};
  user?: {id: string; display: string; practitioner?: string};
  encounter?: {id: string};
  scopes?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nameOf(resource: any, fallback: string): string {
  const n = resource?.name?.[0];
  return (n?.text ?? [...(n?.given ?? []), n?.family].filter(Boolean).join(' ')) || fallback;
}

// Resolves with the launch context after a successful SMART standalone launch.
// On first entry there is no token, so it redirects to the authorization server
// and the returned promise never resolves (the page navigates away).
export async function bootstrapSmart(): Promise<SmartInit> {
  // If the authorization server bounced back an error, surface it and STOP —
  // do not re-authorize (that would loop).
  const params = new URLSearchParams(window.location.search);
  if (params.get('error')) {
    throw new Error(
      `${params.get('error')}: ${params.get('error_description') ?? 'authorization failed'}`,
    );
  }

  try {
    await FHIR.oauth2.ready();
  } catch {
    await FHIR.oauth2.authorize({
      iss: ISS,
      clientId: CLIENT_ID,
      scope: SCOPE,
      // Return to this same /fhir page; on the callback, entry-fhir runs
      // bootSmart() again and FHIR.oauth2.ready() consumes ?code&state.
      redirectUri: window.location.pathname,
    });
    return new Promise<SmartInit>(() => {}); // authorize() redirected; never resolves
  }

  const client = await FHIR.oauth2.ready();
  const transport = await createSmartFhirTransport();

  // Identity comes from the launch, not from hardcoded values.
  const patientId = client.patient?.id ?? '';
  const patient = {
    id: patientId,
    display: patientId ? nameOf(await client.patient.read().catch(() => null), 'SMART patient') : 'No patient in context',
  };

  let user: SmartInit['user'];
  const fhirUser = client.user?.fhirUser ?? undefined; // from the openid/fhirUser scopes
  if (fhirUser) {
    const userResource = await client.request(fhirUser).catch(() => null);
    user = {id: fhirUser, display: nameOf(userResource, fhirUser), practitioner: fhirUser};
  }

  const scopes = (client.state.tokenResponse?.scope ?? client.state.scope ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const encounterId = client.encounter?.id ?? undefined;

  return {
    transport,
    patient,
    user,
    scopes,
    ...(encounterId ? {encounter: {id: encounterId}} : {}),
  };
}
