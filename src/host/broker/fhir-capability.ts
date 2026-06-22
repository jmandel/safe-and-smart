import type {FhirRequest} from '../../shared/protocol';
import type {FhirBundle, FhirResource} from '../../shared/fhir';
import {
  syntheticConditions,
  syntheticMedicationRequests,
  syntheticObservations,
  syntheticPatient,
} from './mock-data';

export interface FhirTransport {
  readonly baseUrl: string;
  request(request: {url: string; init: RequestInit}): Promise<unknown>;
}

export interface FhirCapabilityOptions {
  allowWrites?: boolean;
  maximumResponseBytes?: number;
  timeoutMs?: number;
}

const forbiddenHeaders = new Set([
  'authorization',
  'cookie',
  'host',
  'origin',
  'referer',
  'proxy-authorization',
]);

/**
 * Converts broad, token-equivalent applet requests into calls made by the
 * trusted shell. It deliberately does not enforce a resource/profile allowlist.
 * The SMART token and FHIR server remain the semantic authorization boundary.
 */
export class FhirRequestCapability {
  readonly #transport: FhirTransport;
  readonly #allowWrites: boolean;
  readonly #maximumResponseBytes: number;
  readonly #timeoutMs: number;

  constructor(transport: FhirTransport, options: FhirCapabilityOptions = {}) {
    this.#transport = transport;
    this.#allowWrites = options.allowWrites ?? false;
    this.#maximumResponseBytes = options.maximumResponseBytes ?? 4_000_000;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
  }

  async request(input: FhirRequest): Promise<unknown> {
    const target = resolveFhirUrl(input.url, this.#transport.baseUrl);
    const method = input.init?.method ?? 'GET';

    if (!this.#allowWrites && !['GET'].includes(method)) {
      throw new Error(
        `FHIR write method ${method} is disabled for this applet session. ` +
          'Enable token-equivalent writes only with an explicit product decision.',
      );
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(input.init?.headers ?? {})) {
      if (forbiddenHeaders.has(name.toLowerCase())) continue;
      headers.set(name, value);
    }
    headers.set('accept', 'application/fhir+json, application/json');

    const body = serializeBody(input.init?.body, headers);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const result = await this.#transport.request({
        url: target.toString(),
        init: {method, headers, body, signal: controller.signal},
      });
      assertResponseBudget(result, this.#maximumResponseBytes);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function resolveFhirUrl(input: string, baseUrl: string): URL {
  const normalizedBase = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

  if (/^[a-z][a-z\d+.-]*:/i.test(input) || input.startsWith('//')) {
    throw new Error('Applet FHIR requests must use a relative FHIR URL.');
  }

  const target = new URL(input.replace(/^\//, ''), normalizedBase);
  if (target.origin !== normalizedBase.origin) {
    throw new Error('FHIR request escaped the configured FHIR server origin.');
  }
  if (!target.pathname.startsWith(normalizedBase.pathname)) {
    throw new Error('FHIR request escaped the configured FHIR base path.');
  }
  return target;
}

function serializeBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') return body;
  headers.set('content-type', 'application/fhir+json');
  return JSON.stringify(body);
}

function assertResponseBudget(value: unknown, maximumBytes: number) {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > maximumBytes) {
    throw new Error(
      `FHIR response exceeded the ${maximumBytes.toLocaleString()} byte applet budget.`,
    );
  }
}

/**
 * Live transport for the trusted shell. Performs the actual cross-origin FHIR
 * call from the host page (which, unlike the sandbox origin, is not CSP-locked).
 * In a real SMART launch this would be the fhirclient adapter that attaches the
 * bearer token; against an open sandbox server no Authorization header is needed.
 * Either way the applet never sees the credential — it only gets the parsed body.
 */
export class LiveFhirTransport implements FhirTransport {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async request({url, init}: {url: string; init: RequestInit}): Promise<unknown> {
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.headers,
      body: init.body,
      signal: init.signal,
      mode: 'cors',
      credentials: 'omit',
    });
    if (!response.ok) {
      throw new Error(`FHIR server responded ${response.status} ${response.statusText}.`);
    }
    return response.json();
  }
}

export class MockFhirTransport implements FhirTransport {
  readonly baseUrl = 'https://ehr.example.test/fhir/R4';

  async request({url, init}: {url: string; init: RequestInit}): Promise<unknown> {
    if ((init.method ?? 'GET') !== 'GET') {
      throw new Error('The synthetic FHIR transport is read-only.');
    }

    const target = new URL(url);
    const basePath = new URL(`${this.baseUrl}/`).pathname;
    const relativePath = target.pathname.slice(basePath.length);
    const [resourceType, id] = relativePath.split('/').filter(Boolean);

    if (resourceType === 'metadata') {
      return {
        resourceType: 'CapabilityStatement',
        status: 'active',
        kind: 'instance',
        fhirVersion: '4.0.1',
        format: ['json'],
      };
    }

    if (resourceType === 'Patient' && id === 'demo') return structuredClone(syntheticPatient);
    if (resourceType === 'Patient' && !id) return bundle([syntheticPatient], this.baseUrl);

    if (resourceType === 'Observation') {
      const code = target.searchParams.get('code');
      const patient = target.searchParams.get('patient') ?? target.searchParams.get('subject');
      const filtered = syntheticObservations.filter((resource) => {
        const coding = resource.code.coding?.[0]?.code;
        const patientMatches = !patient || ['demo', 'Patient/demo'].includes(patient);
        return patientMatches && (!code || coding === code || `http://loinc.org|${coding}` === code);
      });
      return bundle(filtered, this.baseUrl);
    }

    if (resourceType === 'Condition') {
      return bundle(syntheticConditions, this.baseUrl);
    }

    if (resourceType === 'MedicationRequest') {
      return bundle(syntheticMedicationRequests, this.baseUrl);
    }

    return {
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'not-found',
          diagnostics: `Synthetic server has no route for ${relativePath || '/'}`,
        },
      ],
    };
  }
}

function bundle<T extends FhirResource>(resources: T[], baseUrl: string): FhirBundle<T> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: resources.length,
    entry: resources.map((resource) => ({
      fullUrl: `${baseUrl}/${resource.resourceType}/${resource.id ?? ''}`,
      resource: structuredClone(resource),
    })),
  };
}
