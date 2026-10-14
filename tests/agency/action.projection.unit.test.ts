import { describe, expect, it } from 'vitest';
import {
  actionCopy,
  actionStates,
  actionUrgency,
  receiptMeaning,
} from '../../libraries/nestjs-libraries/src/agency/action.projection';
import { FacebookProvider } from '../../libraries/nestjs-libraries/src/integrations/social/facebook.provider';
describe('operator outcome contract', () => {
  it('never represents queueing, acceptance, failure or uncertainty as confirmed publication', () => {
    expect(receiptMeaning('READY')).toBe('scheduled');
    expect(receiptMeaning('CLAIMED')).toContain('confirmation pending');
    expect(receiptMeaning('PENDING')).toBe('processing');
    expect(receiptMeaning('FAILED')).toBe('failed');
    expect(receiptMeaning('UNKNOWN')).toBe('unknown');
    expect(receiptMeaning('CONFIRMED')).toBe('published');
  });
  it('has an actionable reason and urgency for every outcome, including preserved partial results', () => {
    for (const state of actionStates) {
      expect(actionCopy[state]).toBeTruthy();
      expect(['HIGH', 'NORMAL', 'LOW']).toContain(actionUrgency(state));
    }
    expect(actionUrgency('UNKNOWN')).toBe('HIGH');
    expect(actionCopy.PARTIAL).toContain('preserve');
  });
  it('does not infer a retry or unknown-reconciliation contract from an inherited Facebook provider', () => {
    const provider = new FacebookProvider();
    expect('verifyFailedPublication' in provider).toBe(false);
    expect('reconcilePublication' in provider).toBe(false);
  });
});
