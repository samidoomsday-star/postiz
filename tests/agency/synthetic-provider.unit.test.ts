import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SyntheticProvider } from '../../libraries/nestjs-libraries/src/integrations/social/synthetic.provider';
import { syntheticModeEnabled } from '../../libraries/helpers/src/testing/synthetic-mode';
import { Integration } from '@prisma/client';

let directory: string;
let journal: string;
const channel = {
  id: 'fixture-channel-a',
  providerIdentifier: 'synthetic',
} as Integration;
const details = (outcome = 'success') => [
  { id: 'fixture-post-a', message: 'ঢাকা agency draft https://example.test', settings: { outcome } },
];
const readJournal = () => existsSync(journal)
  ? readFileSync(journal, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  : [];

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'postiz-synthetic-'));
  journal = join(directory, 'mutations.jsonl');
  vi.stubEnv('AGENCY_TEST_MODE', 'true');
  vi.stubEnv('AGENCY_TEST_ACK', 'LOCAL_SYNTHETIC_ONLY');
  vi.stubEnv('DATABASE_URL', 'postgresql://fixture:fixture@127.0.0.1/postiz_agency_test');
  vi.stubEnv('AGENCY_PROVIDER_LOG', journal);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network access forbidden in synthetic tests'); }));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('local-only publication boundary', () => {
  it('is absent by default and refuses a synthetic mutation when not enabled', async () => {
    vi.stubEnv('AGENCY_TEST_MODE', 'false');
    expect(syntheticModeEnabled()).toBe(false);
    await expect(new SyntheticProvider().post('synthetic-a', 'synthetic-token', details(), channel)).rejects.toThrow('disabled');
    expect(readJournal()).toEqual([]);
  });

  it('requires an explicit acknowledgment', () => {
    vi.stubEnv('AGENCY_TEST_ACK', '');
    expect(() => syntheticModeEnabled()).toThrow('acknowledgment');
  });

  it.each([
    'postgresql://fixture:fixture@db.example.test/postiz_agency_test',
    'postgresql://fixture:fixture@127.0.0.1/customer_production',
  ])('refuses a nonlocal or customer database: %s', (url) => {
    vi.stubEnv('DATABASE_URL', url);
    expect(() => syntheticModeEnabled()).toThrow('isolated local test database');
  });

  it.each([
    ['real-account', 'synthetic-token'],
    ['synthetic-a', 'real-access-token'],
  ])('rejects live account/token input with zero acceptance records', async (id, token) => {
    await expect(new SyntheticProvider().post(id, token, details(), channel)).rejects.toThrow('refuses live');
    expect(readJournal()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('provider contract and side-effect evidence', () => {
  it('persists accepted and completed receipts, preserving Unicode content without HTTP calls', async () => {
    const result = await new SyntheticProvider().post('synthetic-a', 'synthetic-token', details(), channel);
    expect(result[0].id).toBe('fixture-post-a');
    expect(result[0].status).toBe('published');
    expect(result[0].releaseURL).toMatch(/^https:\/\/example\.test\/published\//);
    expect(readJournal().map((r) => r.operation)).toEqual(['accepted', 'completed']);
    expect(readJournal()[0].content).toContain('ঢাকা');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not mask duplicate mutations with fake-provider idempotency', async () => {
    const provider = new SyntheticProvider();
    const first = await provider.post('synthetic-a', 'synthetic-token', details(), channel);
    const second = await provider.post('synthetic-a', 'synthetic-token', details(), channel);
    expect(first[0].postId).not.toBe(second[0].postId);
    expect(readJournal().filter((r) => r.operation === 'accepted')).toHaveLength(2);
  });

  it('known rejection records no accepted publication', async () => {
    await expect(new SyntheticProvider().post('synthetic-a', 'synthetic-token', details('known-failure'), channel)).rejects.toThrow('known rejection');
    expect(readJournal().map((r) => r.operation)).toEqual(['rejected']);
  });

  it('models acceptance followed by response loss and reconciles without another mutation', async () => {
    const provider = new SyntheticProvider();
    await expect(provider.post('synthetic-a', 'synthetic-token', details('uncertain'), channel)).rejects.toThrow('response lost');
    const accepted = readJournal();
    expect(accepted).toHaveLength(1);
    expect(accepted[0].operation).toBe('accepted');
    const outcome = await provider.checkPostStatus('synthetic-token', { postId: accepted[0].postId }, channel);
    expect(outcome.status).toBe('completed');
    expect(readJournal()).toEqual(accepted);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns pending separately from publication and a read-only probe can confirm it', async () => {
    const provider = new SyntheticProvider();
    const [pending] = await provider.post('synthetic-a', 'synthetic-token', details('pending'), channel);
    expect(pending.status).toBe('pending');
    expect(pending.releaseURL).toBe('');
    const before = readJournal();
    expect((await provider.checkPostStatus('synthetic-token', pending.pendingData, channel)).status).toBe('completed');
    expect(readJournal()).toEqual(before);
  });

  it('does not expose another channel receipt or invent success for an unknown receipt', async () => {
    const provider = new SyntheticProvider();
    const [result] = await provider.post('synthetic-a', 'synthetic-token', details(), channel);
    await expect(provider.checkPostStatus('synthetic-token', { postId: result.postId }, { ...channel, id: 'fixture-channel-b' })).rejects.toThrow('Unknown');
    await expect(provider.checkPostStatus('synthetic-token', { postId: 'missing' }, channel)).rejects.toThrow('Unknown');
  });
});
