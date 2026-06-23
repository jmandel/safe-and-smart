import {describe, expect, it} from 'bun:test';
import {AppletAuditSchema} from '../src/shared/protocol';

// The broker's #audit does AppletAuditSchema.parse(input) and throws on failure.
// The docs/tutorial/examples call session.audit({message}) with no `kind`, so a
// required `kind` silently dropped every such event (unhandled rejection, blank
// audit panel). `kind` now defaults to 'application' — guard that contract here.
describe('AppletAuditSchema', () => {
  it('accepts session.audit({message}) and defaults kind to application', () => {
    const parsed = AppletAuditSchema.parse({message: 'clicked 1'});
    expect(parsed.kind).toBe('application');
    expect(parsed.message).toBe('clicked 1');
  });

  it('accepts {code, message} (the documented semantic-event shape)', () => {
    const parsed = AppletAuditSchema.parse({code: 'applet.user-action', message: 'ordered aspirin'});
    expect(parsed.kind).toBe('application');
    expect(parsed.code).toBe('applet.user-action');
  });

  it('still honors an explicit kind set by the runtime', () => {
    const parsed = AppletAuditSchema.parse({kind: 'security-probe', code: 'applet.security-probe', message: 'probe'});
    expect(parsed.kind).toBe('security-probe');
  });

  it('rejects an empty or missing message', () => {
    expect(() => AppletAuditSchema.parse({message: ''})).toThrow();
    expect(() => AppletAuditSchema.parse({})).toThrow();
  });
});
