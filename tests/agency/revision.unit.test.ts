import { describe, expect, it, vi } from 'vitest';
import {
  assetCapability,
  verifyAssetCapability,
  digest,
} from '../../libraries/nestjs-libraries/src/agency/revision';
describe('immutable payload and bounded asset capability', () => {
  it('canonical hashes ignore object insertion order while binding ordered media and final settings/time', () => {
    expect(digest({ settings: { b: 2, a: 1 }, media: ['a', 'b'] })).toBe(
      digest({ media: ['a', 'b'], settings: { a: 1, b: 2 } })
    );
    expect(digest({ media: ['a', 'b'] })).not.toBe(
      digest({ media: ['b', 'a'] })
    );
    expect(digest({ time: '2026-10-13T00:00Z' })).not.toBe(
      digest({ time: '2026-10-13T01:00Z' })
    );
  });
  it('rejects malformed, altered, expired, overlong and wrong-key capabilities', () => {
    vi.stubEnv('JWT_SECRET', 'synthetic-unit-secret');
    const token = assetCapability('snapshot', 'dispatch');
    expect(verifyAssetCapability(token)).toMatchObject({
      snapshotId: 'snapshot',
      dispatchId: 'dispatch',
    });
    for (const bad of [
      '',
      token + 'x',
      token + '.extra',
      assetCapability('s', 'd', Date.now() - 1),
      assetCapability('s', 'd', Date.now() + 31 * 60000),
    ])
      expect(verifyAssetCapability(bad)).toBeNull();
    vi.stubEnv('JWT_SECRET', 'other-unit-secret');
    expect(verifyAssetCapability(token)).toBeNull();
  });
});
