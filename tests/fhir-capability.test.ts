import {describe, expect, it} from 'vitest';
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
    ).toThrow(/base path/);
  });

  it('defaults to read-only while preserving a single switch for token-equivalent writes', async () => {
    const capability = new FhirRequestCapability(new MockFhirTransport());
    await expect(
      capability.request({url: 'Observation', init: {method: 'POST', body: {}}}),
    ).rejects.toThrow(/disabled/);
  });
});
