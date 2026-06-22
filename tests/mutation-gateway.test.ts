import {describe, expect, it} from 'bun:test';
import {guardConnection, type MutationViolation} from '../src/host/mutation-gateway';

function record(violations: Array<[MutationViolation, string]>) {
  return (code: MutationViolation, detail: string) => violations.push([code, detail]);
}

describe('guardConnection', () => {
  it('passes through mutations and calls under budget', () => {
    let applied = 0;
    const inner = {mutate: (r: unknown[]) => (applied += r.length), call: () => 'ok'};
    const guarded = guardConnection(inner, {maxTotalMutations: 10});
    guarded.mutate([1, 2, 3]);
    expect(guarded.call('x')).toBe('ok');
    expect(applied).toBe(3);
  });

  it('cuts off and reports once the mutation budget is exceeded', () => {
    const violations: Array<[MutationViolation, string]> = [];
    const inner = {mutate: () => undefined, call: () => undefined};
    const guarded = guardConnection(inner, {maxTotalMutations: 4, onViolation: record(violations)});
    guarded.mutate([1, 2, 3]);
    expect(() => guarded.mutate([4, 5])).toThrow(/mutation budget/);
    // after cut-off everything is rejected, including calls
    expect(() => guarded.mutate([6])).toThrow(/cut off/);
    expect(() => guarded.call('x')).toThrow(/cut off/);
    expect(violations[0]?.[0]).toBe('mutation-budget-exceeded');
  });

  it('isolates a throwing mutation as an audited violation and cuts off', () => {
    const violations: Array<[MutationViolation, string]> = [];
    const inner = {
      mutate: () => {
        throw new Error('bad record');
      },
      call: () => undefined,
    };
    const guarded = guardConnection(inner, {onViolation: record(violations)});
    expect(() => guarded.mutate([1])).toThrow(/bad record/);
    expect(violations[0]).toEqual(['mutation-apply-failed', 'bad record']);
  });
});
