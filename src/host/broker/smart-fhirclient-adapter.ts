import FHIR from 'fhirclient';
import type {FhirTransport} from './fhir-capability';

/**
 * Production adapter sketch. Call this only from the trusted outer shell during
 * a real SMART launch. The returned transport retains the fhirclient instance;
 * the applet receives only FhirRequestCapability.request().
 */
export async function createSmartFhirTransport(): Promise<FhirTransport> {
  const client = await FHIR.oauth2.ready();
  const baseUrl = client.state.serverUrl;

  return {
    baseUrl,
    async request({url, init}) {
      const relative = makeRelativeToBase(url, baseUrl);
      return client.request(relative, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: init.signal,
        flat: false,
        pageLimit: 0,
      } as never);
    },
  };
}

function makeRelativeToBase(url: string, baseUrl: string) {
  const target = new URL(url);
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    throw new Error('FHIR URL is outside the active SMART server.');
  }
  return `${target.pathname.slice(base.pathname.length)}${target.search}`;
}
