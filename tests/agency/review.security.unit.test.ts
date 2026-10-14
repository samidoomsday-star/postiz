import { IsString } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import {
  csrfToken,
  escapeMail,
  reviewHash,
  reviewOptions,
  reviewSecret,
  reviewWeek,
  reviewTelemetryPath,
  safeEqual,
  verificationHash,
} from '../../libraries/nestjs-libraries/src/agency/review.security';
describe('review identity and transport primitives', () => {
  it('issues high entropy opaque secrets and one-way stable hashes', () => {
    const a = reviewSecret(),
      b = reviewSecret();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(reviewHash(a)).toHaveLength(64);
    expect(safeEqual(reviewHash(a), reviewHash(a))).toBe(true);
    expect(safeEqual(a, a + 'x')).toBe(false);
  });
  it('binds code hashes to challenge and server key and CSRF to one session', () => {
    vi.stubEnv('JWT_SECRET', 'synthetic-review-unit-key');
    const a = verificationHash('challenge-a', '123456');
    expect(a).not.toBe(verificationHash('challenge-b', '123456'));
    expect(a).not.toBe(verificationHash('challenge-a', '654321'));
    const token = csrfToken({ id: 'one', secretHash: 'a' });
    expect(token).not.toBe(csrfToken({ id: 'two', secretHash: 'a' }));
    expect(token).not.toBe(csrfToken({ id: 'one', secretHash: 'b' }));
    vi.stubEnv('JWT_SECRET', 'other-unit-key');
    expect(a).not.toBe(verificationHash('challenge-a', '123456'));
  });
  it('validates UTC week boundaries without accepting rollover dates', () => {
    const week = reviewWeek('2026-10-12')!;
    expect(week.start.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(week.end.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    for (const bad of ['2026-02-30', 'wrong', '2026-13-01', '2026-1-1', ''])
      expect(reviewWeek(bad)).toBeNull();
  });
  it('escapes mail names and excludes case variants of secret-bearing review routes from telemetry', () => {
    expect(escapeMail('<img a="x"> & \'')).toBe(
      '&lt;img a=&quot;x&quot;&gt; &amp; &#39;'
    );
    for (const path of [
      'http://localhost:3000/agency/review/verify',
      '/AGENCY/REVIEW/session',
      'POST /agency/review-invitations',
    ])
      expect(reviewTelemetryPath(path)).toBe(true);
    expect(reviewTelemetryPath('/agency/posts')).toBe(false);
  });
  it('projects registered publication fields while removing unknown/internal data', () => {
    class Options {}
    IsString()(Options.prototype, 'disclosure');
    expect(
      reviewOptions(
        {
          disclosure: 'Paid partnership',
          internal_notes: 'Private',
          unknown: 'Hidden',
          secret: 'Hidden',
        },
        Options
      )
    ).toEqual({ disclosure: 'Paid partnership' });
    expect(reviewOptions({ unknown: 'Hidden' })).toEqual({});
  });
});

// Invitation recipients must denote exactly the mailbox bound to the session.
describe('single verified mailbox', () => {
  it('rejects address lists, comments, display names, Unicode and oversized parser inputs', async () => {
    const { singleReviewEmail } = await import(
      '../../libraries/nestjs-libraries/src/agency/review.security'
    );
    for (const value of [
      'a@example.test,b@example.test',
      'a@example.test(comment)',
      'Name <a@example.test>',
      'a@example.test;other@example.test',
      'a@éxample.test',
      'x'.repeat(255) + '@example.test',
    ])
      expect(singleReviewEmail(value)).toBe(false);
    expect(singleReviewEmail('reviewer+client@example.test')).toBe(true);
  });
});
