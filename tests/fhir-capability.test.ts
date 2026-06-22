import {describe, expect, it} from 'bun:test';
import {
  FhirRequestCapability,
  MockFhirTransport,
  resolveFhirUrl,
} from '../src/host/broker/fhir-capability';
import type {FhirBundle, Observation} from '../src/shared/fhir';

describe('FhirRequestCapability', () => {
  it('supports broad relative searches without resource-profile allowlists', async () => {
    const capability = new FhirRequestCapability(new MockFhirTransport());
    const result = (await capability.request({
      url: 'Observation?patient=demo&_count=500',
    })) as FhirBundle<Observation>;
    expect(result.resourceType).toBe('Bundle');
    expect(result.total).toBeGreaterThan(20);
  });

  it('does not accept absolute destinations', () => {
    expect(() =>
      resolveFhirUrl('https://attacker.example/collect', 'https://ehr.example/fhir/R4'),
    ).toThrow(/relative FHIR URL/);
  });

  it('prevents base-path traversal', () => {
    expect(() =>
      resolveFhirUrl('../admin', 'https://ehr.example/fhir/R4'),
    ).toThrow(/traversal|base path/);
  });

  it('rejects encoded path separators and escapes', () => {
    expect(() => resolveFhirUrl('Patient%2f..%2fadmin', 'https://ehr.example/fhir/R4')).toThrow(
      /encoded separator|escape/,
    );
    expect(() => resolveFhirUrl('Patient\\..\\admin', 'https://ehr.example/fhir/R4')).toThrow();
  });

  it('passes allowlisted headers and drops everything else', async () => {
    const seen: Record<string, string> = {};
    const transport = {
      baseUrl: 'https://ehr.example/fhir/R4',
      async request({init}: {url: string; init: RequestInit; maxBytes?: number}) {
        (init.headers as Headers).forEach((v, k) => (seen[k] = v));
        return {resourceType: 'Bundle', type: 'searchset', entry: []};
      },
    };
    const capability = new FhirRequestCapability(transport);
    await capability.request({
      url: 'Observation',
      init: {headers: {prefer: 'return=representation', authorization: 'Bearer SECRET', 'x-forwarded-for': '1.2.3.4'}},
    });
    expect(seen.prefer).toBe('return=representation');
    expect(seen.authorization).toBeUndefined();
    expect(seen['x-forwarded-for']).toBeUndefined();
  });

  it('enforces a response byte budget', async () => {
    const huge = {resourceType: 'Bundle', type: 'searchset', entry: Array.from({length: 5}, () => ({resource: {note: 'x'.repeat(1000)}}))};
    const transport = {baseUrl: 'https://ehr.example/fhir/R4', async request() { return huge; }};
    const capability = new FhirRequestCapability(transport, {maximumResponseBytes: 200});
    await expect(capability.request({url: 'Observation'})).rejects.toThrow(/budget/);
  });

  it('defaults to read-only while preserving a single switch for token-equivalent writes', async () => {
    const capability = new FhirRequestCapability(new MockFhirTransport());
    await expect(
      capability.request({url: 'Observation', init: {method: 'POST', body: {}}}),
    ).rejects.toThrow(/disabled/);
  });
});
