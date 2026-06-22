import {describe, expect, it} from 'bun:test';
import {sanitizeVegaSpec} from '../src/host/components/vega-sanitizer';

describe('sanitizeVegaSpec', () => {
  it('accepts inline Vega-Lite data and interactive expressions', () => {
    const result = sanitizeVegaSpec({
      data: {values: [{x: 1, y: 2}]},
      mark: 'line',
      encoding: {x: {field: 'x'}, y: {field: 'y'}},
      transform: [{filter: 'datum.x > 0'}],
    });
    expect(result).toMatchObject({mark: 'line'});
  });

  it('rejects URL-backed data', () => {
    expect(() => sanitizeVegaSpec({data: {url: 'https://example.test/data.json'}})).toThrow(
      /key url/,
    );
  });

  it('rejects executable protocols embedded in values', () => {
    expect(() => sanitizeVegaSpec({description: 'javascript:alert(1)'})).toThrow(
      /URL rejected/,
    );
  });
});
