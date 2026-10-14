import { describe, expect, it } from 'vitest';
import {
  allowsChannel,
  live,
  roleActions,
} from '../../libraries/nestjs-libraries/src/agency/policy';

describe('explicit client policy primitives', () => {
  it('revocation overrides expiry and expired access cannot be live', () => {
    const now = Date.UTC(2026, 9, 13);
    expect(live({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(live({ revokedAt: null, expiresAt: new Date(now) }, now)).toBe(
      false
    );
    expect(
      live({ revokedAt: new Date(now - 1), expiresAt: new Date(now + 1) }, now)
    ).toBe(false);
    expect(live({ revokedAt: null, expiresAt: new Date(now + 1) }, now)).toBe(
      true
    );
  });
  it('channel scopes admit only named channels unless the granted client uses all', () => {
    expect(allowsChannel(['a1'], 'a2')).toBe(false);
    expect(allowsChannel(['a1'], 'a1')).toBe(true);
    expect(allowsChannel([], 'a2')).toBe(true);
  });
  it('role composition must be explicit and reviewer cannot read raw drafts', () => {
    expect(roleActions.EDITOR).not.toContain('publish:schedule');
    expect(roleActions.PUBLISHER).not.toContain('draft:write');
    expect(roleActions.REVIEWER).toEqual(['review:decide']);
    expect(roleActions.REVIEWER).not.toContain('content:read');
  });
});
