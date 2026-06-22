import {describe, expect, it} from 'vitest';
import {syntheticObservations} from '../src/host/broker/mock-data';
import {buildGrowthSpec, extractMeasurements} from '../src/applet/growth-model';

describe('growth model demo', () => {
  it('extracts a longitudinal height series from FHIR observations', () => {
    const measurements = extractMeasurements(
      syntheticObservations,
      'height',
      '2010-04-10',
    );
    expect(measurements).toHaveLength(12);
    expect(measurements[0]?.value).toBe(101.8);
    expect(measurements.at(-1)?.value).toBe(161.1);
  });

  it('builds an inline-data Vega-Lite spec with no network URL', () => {
    const measurements = extractMeasurements(
      syntheticObservations,
      'height',
      '2010-04-10',
    );
    const spec = buildGrowthSpec({
      measurements,
      metric: 'height',
      sex: 'female',
      population: 'condition-cohort',
      maximumAge: 18,
    });
    expect(JSON.stringify(spec)).not.toMatch(/https?:\/\//);
    expect(spec).toHaveProperty('layer');
  });
});
