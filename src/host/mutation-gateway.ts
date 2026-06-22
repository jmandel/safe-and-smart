// Host-side guard around the Remote DOM connection the applet drives. This is the
// Phase-0 baseline: it does NOT yet validate element/prop names against a schema
// (that host-side mutation firewall is Phase 1) — the renderer already rejects
// unknown elements. What it adds now is containment of the *connection* itself:
//   - a mutation budget, so an applet can't wedge the tab with an unbounded
//     mutation flood (resource-exhaustion / DoS), and
//   - error isolation, so a throw from applying a malformed mutation record
//     surfaces as an audited violation that the React error boundary contains,
//     instead of leaving the receiver in a half-applied state.

/* eslint-disable @typescript-eslint/no-explicit-any */
// `any` here is deliberate: this is a structural shim that must stay assignable to
// Remote DOM's RemoteConnection (whose record type is internal) in both directions.
export interface RemoteConnectionLike {
  call(...args: any[]): unknown;
  mutate(records: readonly any[]): unknown;
}

export type MutationViolation =
  | 'mutation-budget-exceeded'
  | 'mutation-apply-failed'
  | 'call-failed';

export interface GuardOptions {
  // Total mutation records this applet session may apply before it is cut off.
  maxTotalMutations?: number;
  onViolation?: (code: MutationViolation, detail: string) => void;
}

export function guardConnection(
  connection: RemoteConnectionLike,
  options: GuardOptions = {},
): RemoteConnectionLike {
  const maxTotal = options.maxTotalMutations ?? 250_000;
  const onViolation = options.onViolation ?? (() => {});
  let applied = 0;
  let cutOff = false;

  return {
    mutate(records) {
      if (cutOff) throw new Error('Applet mutation stream was cut off after a prior violation.');
      const count = Array.isArray(records) ? records.length : 0;
      applied += count;
      if (applied > maxTotal) {
        cutOff = true;
        onViolation('mutation-budget-exceeded', `${applied} records exceeds budget ${maxTotal}`);
        throw new Error(`Applet exceeded the mutation budget (${maxTotal} records).`);
      }
      try {
        return connection.mutate(records);
      } catch (error) {
        cutOff = true;
        onViolation('mutation-apply-failed', error instanceof Error ? error.message : String(error));
        throw error;
      }
    },
    call(...args) {
      if (cutOff) throw new Error('Applet connection was cut off after a prior violation.');
      try {
        return connection.call(...args);
      } catch (error) {
        onViolation('call-failed', error instanceof Error ? error.message : String(error));
        throw error;
      }
    },
  };
}
