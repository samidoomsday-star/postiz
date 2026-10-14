import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import { api, command, draft, enqueue, staff } from './approval.helpers';
import { begin, invite, origin, submitted, verified } from './review.helpers';
import { reviewHash } from '../../libraries/nestjs-libraries/src/agency/review.security';
const db = new PrismaClient();
const keys = JSON.parse(readFileSync('.agency/fixture-access.json', 'utf8'));
const calls = (id: string) =>
  (existsSync(process.env.AGENCY_PROVIDER_LOG!)
    ? readFileSync(process.env.AGENCY_PROVIDER_LOG!, 'utf8')
    : ''
  )
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.localId === id && r.operation === 'accepted');
test.afterAll(() => db.$disconnect());
test('T03-01: email proof creates one narrow session; exact approved revision alone can be scheduled', async ({
  request,
  playwright,
}) => {
  const v = await verified(request, playwright);
  try {
    const work = await submitted(request, v.inv, draft({}, 4000));
    const response = await v.portal.get(
      `${api}/agency/review/works/${work.workId}`
    );
    expect(response.status()).toBe(200);
    const view = await response.json();
    const revision = await db.agencyRevision.findUniqueOrThrow({
      where: { id: work.revisionId },
    });
    expect(view.revision.hash).toBe(revision.payloadHash);
    expect(view.revision.targets[0].parts[0].message).toBe(
      (revision.payload as any).targets[0].parts[0].message
    );
    expect(view.revision.targets[0].accountId).toBe('synthetic-a-1');
    expect(
      (await v.portal.get(`${api}/agency/posts/${work.postId}`)).status()
    ).toBe(401);
    expect(
      (
        await v.portal.post(`${api}/agency/works/${work.workId}/schedule`, {
          data: command(),
        })
      ).status()
    ).toBe(401);
    expect(
      (
        await v.portal.get(`${api}/agency/review/works/${work.workId}/approve`)
      ).status()
    ).toBe(404);
    const c = command();
    const decisions = await Promise.all(
      [1, 2].map(() =>
        v.portal.post(`${api}/agency/review/works/${work.workId}/approve`, {
          headers: v.csrf,
          data: c,
        })
      )
    );
    expect(decisions.map((r) => r.status())).toEqual([201, 201]);
    const decision = await db.agencyReviewDecision.findUniqueOrThrow({
      where: {
        requestId: (
          await db.agencyReviewRequest.findUniqueOrThrow({
            where: { revisionId: work.revisionId },
          })
        ).id,
      },
    });
    expect(decision.reviewInvitationId).toBe(v.inv.id);
    expect(calls(work.postId)).toEqual([]);
    await enqueue(request, work, v.inv.headers);
    await expect
      .poll(
        async () =>
          (
            await db.agencyDispatch.findFirst({
              where: { postId: work.postId, stage: 'publish' },
            })
          )?.state
      )
      .toBe('CONFIRMED');
    expect(calls(work.postId)).toHaveLength(1);
    const cookie = (await v.portal.storageState()).cookies.find(
      (c) => c.name === 'agency_review'
    )!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
    expect(cookie.path).toBe('/agency/review');
    const session = await db.agencyReviewerSession.findUniqueOrThrow({
      where: { invitationId: v.inv.id },
    });
    if (session.secretHash === cookie.value)
      throw new Error('Session secret stored raw');
    expect(session.secretHash).toBe(reviewHash(cookie.value));
    expect(+session.expiresAt <= +session.createdAt + 86400000).toBe(true);
  } finally {
    await v.portal.dispose();
  }
});
test('T03-02: a forwarded invitation/challenge cannot reveal content or exchange without email and browser proof', async ({
  request,
  playwright,
}) => {
  const inv = await invite(request);
  const portal = await playwright.request.newContext({
      extraHTTPHeaders: { origin },
    }),
    forwarded = await playwright.request.newContext({
      extraHTTPHeaders: { origin },
    });
  try {
    const work = await submitted(request, inv);
    expect(
      (
        await forwarded.get(`${api}/agency/review/works/${work.workId}`)
      ).status()
    ).toBe(401);
    const proof = await begin(request, portal, inv);
    expect(
      (
        await forwarded.post(api + '/agency/review/verify', { data: proof })
      ).status()
    ).toBe(401);
    expect(
      (
        await portal.post(api + '/agency/review/verify', {
          data: { ...proof, code: '000000' },
        })
      ).status()
    ).toBe(401);
    expect(
      (
        await portal.post(api + '/agency/review/verify', { data: proof })
      ).status()
    ).toBe(201);
    expect(
      (
        await portal.post(api + '/agency/review/verify', { data: proof })
      ).status()
    ).toBe(401);
    expect(
      await db.agencyReviewerSession.count({ where: { invitationId: inv.id } })
    ).toBe(1);
    expect(
      (
        await forwarded.post(api + '/agency/review/challenge', {
          data: { token: inv.token },
        })
      ).status()
    ).toBe(401);
    const stored = await db.agencyReviewInvitation.findUniqueOrThrow({
      where: { id: inv.id },
    });
    if (stored.tokenHash === inv.token)
      throw new Error('Invitation token stored raw');
    expect(stored.tokenHash).toBe(reviewHash(inv.token));
    expect(
      (
        await request.post(api + '/auth/login', {
          data: {
            provider: 'LOCAL',
            email: inv.email,
            password: 'LocalFixture123!',
          },
        })
      ).status()
    ).toBe(400);
    expect(calls(work.postId)).toEqual([]);
  } finally {
    await portal.dispose();
    await forwarded.dispose();
  }
});
test('T03-02: simultaneous valid exchanges issue at most one session', async ({
  request,
  playwright,
}) => {
  const inv = await invite(request),
    portal = await playwright.request.newContext({
      extraHTTPHeaders: { origin },
    });
  try {
    const proof = await begin(request, portal, inv);
    const results = await Promise.all(
      [1, 2].map(() =>
        portal.post(api + '/agency/review/verify', { data: proof })
      )
    );
    expect(results.map((r) => r.status()).sort()).toEqual([201, 401]);
    expect(
      await db.agencyReviewerSession.count({ where: { invitationId: inv.id } })
    ).toBe(1);
  } finally {
    await portal.dispose();
  }
});
test('T03-02: expired invitation/challenge/session and revoked access are denied', async ({
  request,
  playwright,
}) => {
  const v = await verified(request, playwright);
  try {
    await db.agencyReviewerSession.update({
      where: { invitationId: v.inv.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect((await v.portal.get(api + '/agency/review/session')).status()).toBe(
      401
    );
  } finally {
    await v.portal.dispose();
  }
  const inv = await invite(request),
    portal = await playwright.request.newContext({
      extraHTTPHeaders: { origin },
    });
  try {
    const proof = await begin(request, portal, inv);
    await db.agencyReviewChallenge.update({
      where: { id: proof.challengeId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(
      (
        await portal.post(api + '/agency/review/verify', { data: proof })
      ).status()
    ).toBe(401);
    await db.agencyReviewInvitation.update({
      where: { id: inv.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(
      (
        await portal.post(api + '/agency/review/challenge', {
          data: { token: inv.token },
        })
      ).status()
    ).toBe(401);
  } finally {
    await portal.dispose();
  }
  const other = await verified(request, playwright);
  try {
    expect(
      (
        await request.post(
          `${api}/agency/review-invitations/${other.inv.id}/revoke`,
          { headers: other.inv.headers, data: {} }
        )
      ).status()
    ).toBe(201);
    expect(
      (await other.portal.get(api + '/agency/review/session')).status()
    ).toBe(401);
  } finally {
    await other.portal.dispose();
  }
});
test('T03-02: disabled reviewer/issuer and changed email revoke the narrow identity', async ({
  request,
  playwright,
}) => {
  const v = await verified(request, playwright);
  try {
    const member = await db.userOrganization.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: v.inv.reviewerId,
          organizationId: 'fixture-agency-a',
        },
      },
    });
    try {
      await db.userOrganization.update({
        where: { id: member.id },
        data: { disabled: true },
      });
      expect(
        (await v.portal.get(api + '/agency/review/session')).status()
      ).toBe(401);
    } finally {
      await db.userOrganization.update({
        where: { id: member.id },
        data: { disabled: false },
      });
    }
    const issuer = await db.userOrganization.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: 'fixture-user-a-owner',
          organizationId: 'fixture-agency-a',
        },
      },
    });
    try {
      await db.userOrganization.update({
        where: { id: issuer.id },
        data: { disabled: true },
      });
      expect(
        (await v.portal.get(api + '/agency/review/session')).status()
      ).toBe(401);
    } finally {
      await db.userOrganization.update({
        where: { id: issuer.id },
        data: { disabled: false },
      });
    }
    try {
      await db.user.update({
        where: { id: v.inv.reviewerId },
        data: { email: 'changed-' + v.inv.email },
      });
      expect(
        (await v.portal.get(api + '/agency/review/session')).status()
      ).toBe(401);
    } finally {
      await db.user.update({
        where: { id: v.inv.reviewerId },
        data: { email: v.inv.email },
      });
    }
  } finally {
    await v.portal.dispose();
  }
});
test('T03-02: review CSRF/origin and automation cannot bypass verification or decide', async ({
  request,
  playwright,
}) => {
  const v = await verified(request, playwright);
  try {
    const w = await submitted(request, v.inv);
    for (const headers of [
      {},
      { 'x-review-csrf': 'forged' },
      { ...v.csrf, origin: 'https://foreign.example.test' },
    ])
      expect(
        (
          await v.portal.post(
            `${api}/agency/review/works/${w.workId}/approve`,
            { headers, data: command() }
          )
        ).status()
      ).toBe(403);
    expect(
      (
        await v.portal.get(api + '/agency/review/session', {
          headers: { origin: 'https://foreign.example.test' },
        })
      ).status()
    ).toBe(403);
    expect(
      (
        await v.portal.post(`${api}/agency/review/works/${w.workId}/approve`, {
          headers: { ...v.csrf, authorization: keys.a },
          data: command(),
        })
      ).status()
    ).toBe(403);
    expect(
      await db.agencyReviewDecision.count({
        where: { revisionId: w.revisionId },
      })
    ).toBe(0);
    expect(calls(w.postId)).toEqual([]);
    const anonymous = await playwright.request.newContext();
    try {
      expect(
        (
          await anonymous.post(api + '/agency/review/challenge', {
            data: { token: v.inv.token },
          })
        ).status()
      ).toBe(403);
    } finally {
      await anonymous.dispose();
    }
  } finally {
    await v.portal.dispose();
  }
});
test('T03-02: code guessing is bounded and invitation rate limits persist across spoofed forwarding headers', async ({
  request,
  playwright,
}) => {
  const inv = await invite(request),
    portal = await playwright.request.newContext({
      extraHTTPHeaders: { origin },
    });
  try {
    const proof = await begin(request, portal, inv);
    for (let i = 0; i < 6; i++)
      expect(
        (
          await portal.post(api + '/agency/review/verify', {
            data: { ...proof, code: '000000' },
          })
        ).status()
      ).toBe(401);
    const ch = await db.agencyReviewChallenge.findUniqueOrThrow({
      where: { id: proof.challengeId },
    });
    expect(ch.attempts).toBe(5);
    expect(ch.consumedAt).toBeTruthy();
    expect(
      (
        await portal.post(api + '/agency/review/verify', { data: proof })
      ).status()
    ).toBe(401);
    for (let i = 0; i < 2; i++)
      expect(
        (
          await portal.post(api + '/agency/review/challenge', {
            headers: { 'x-forwarded-for': '198.51.100.' + (i + 1) },
            data: { token: inv.token },
          })
        ).status()
      ).toBe(201);
    expect(
      (
        await portal.post(api + '/agency/review/challenge', {
          headers: { 'x-forwarded-for': '198.51.100.99' },
          data: { token: inv.token },
        })
      ).status()
    ).toBe(429);
  } finally {
    await portal.dispose();
  }
});
test('T03-03: weekly projections are client/channel/assignment scoped before pagination', async ({
  request,
  playwright,
}) => {
  const v = await verified(request, playwright, {
    channelIds: ['fixture-channel-a-1'],
  });
  try {
    const w = await submitted(request, v.inv);
    const batch = await (
      await v.portal.get(api + '/agency/review/works')
    ).json();
    expect(batch.items.map((r: any) => r.id)).toContain(w.workId);
    expect(batch.items.every((r: any) => r.id === w.workId)).toBe(true);
    const owner = await staff(request);
    const otherBody = draft({}, 600000);
    otherBody.posts[0].integration.id = 'fixture-channel-a-2';
    const saved = await request.post(api + '/agency/posts', {
      headers: owner,
      data: otherBody,
    });
    expect(saved.status()).toBe(201);
    const [other] = await saved.json();
    expect(
      (
        await v.portal.get(`${api}/agency/review/works/${other.workId}`)
      ).status()
    ).toBe(404);
    expect(
      (
        await v.portal.get(api + '/agency/review/works?week=2026-02-30')
      ).status()
    ).toBe(400);
    expect(
      (await v.portal.get(api + '/agency/review/works?page=-1')).status()
    ).toBe(400);
    const future = draft({}, 8 * 86400000);
    const futureWork = await submitted(request, v.inv, future);
    const current = await (
      await v.portal.get(api + '/agency/review/works')
    ).json();
    expect(current.items.map((r: any) => r.id)).not.toContain(
      futureWork.workId
    );
  } finally {
    await v.portal.dispose();
  }
});
test('T03-03: bulk decisions return independent stale conflicts and stable successful effects', async ({
  request,
  playwright,
}) => {
  const v = await verified(request, playwright);
  try {
    const a = await submitted(request, v.inv),
      b = await submitted(request, v.inv);
    expect(
      (
        await request.post(`${api}/agency/works/${b.workId}/revisions`, {
          headers: v.inv.headers,
          data: { ...b.body, ...command() },
        })
      ).status()
    ).toBe(201);
    const items = [a, b].map((w) => ({
      workId: w.workId,
      decision: 'APPROVED',
      ...command(),
    }));
    const r = await v.portal.post(api + '/agency/review/bulk', {
      headers: v.csrf,
      data: { items },
    });
    expect(r.status()).toBe(201);
    const result = await r.json();
    expect(result.results.map((r: any) => r.ok)).toEqual([true, false]);
    expect(result.results[1].status).toBe(409);
    const again = await (
      await v.portal.post(api + '/agency/review/bulk', {
        headers: v.csrf,
        data: { items },
      })
    ).json();
    expect(again.results[0].outcome).toEqual(result.results[0].outcome);
    expect(
      await db.agencyReviewDecision.count({
        where: { revisionId: a.revisionId },
      })
    ).toBe(1);
    expect(
      await db.agencyReviewDecision.count({
        where: { revisionId: b.revisionId },
      })
    ).toBe(0);
    const old = await (
      await v.portal.get(`${api}/agency/review/works/${b.workId}`)
    ).json();
    expect(old.available).toBe(false);
    expect(old.revision).toBeUndefined();
    expect(calls(a.postId)).toEqual([]);
  } finally {
    await v.portal.dispose();
  }
});
test('T03-03: public feedback is append-only, nonmaterial and retained through a fresh revision', async ({
  request,
  playwright,
}) => {
  const v = await verified(request, playwright);
  try {
    const w = await submitted(request, v.inv);
    const text =
      '<img src=x onerror="window.reviewXss=1"> ঢাকা client feedback';
    const c = { ...command(), comment: text };
    const r = await v.portal.post(
      `${api}/agency/review/works/${w.workId}/comments`,
      { headers: v.csrf, data: c }
    );
    expect(r.status()).toBe(201);
    const result = await r.json();
    expect(
      await (
        await v.portal.post(`${api}/agency/review/works/${w.workId}/comments`, {
          headers: v.csrf,
          data: c,
        })
      ).json()
    ).toEqual(result);
    const revision = await db.agencyRevision.findUniqueOrThrow({
      where: { id: w.revisionId },
    });
    expect(
      (await db.agencyWork.findUniqueOrThrow({ where: { id: w.workId } }))
        .status
    ).toBe('IN_REVIEW');
    expect(
      (
        await v.portal.post(`${api}/agency/review/works/${w.workId}/changes`, {
          headers: v.csrf,
          data: { ...command(), comment: 'Please revise' },
        })
      ).status()
    ).toBe(201);
    expect(
      (
        await request.post(`${api}/agency/works/${w.workId}/revisions`, {
          headers: v.inv.headers,
          data: { ...w.body, ...command() },
        })
      ).status()
    ).toBe(201);
    expect(
      (
        await request.post(`${api}/agency/works/${w.workId}/submit`, {
          headers: v.inv.headers,
          data: { ...command(2), reviewerId: v.inv.reviewerId },
        })
      ).status()
    ).toBe(201);
    const detail = await (
      await v.portal.get(`${api}/agency/review/works/${w.workId}`)
    ).json();
    expect(
      detail.history.some((h: any) => h.body === text && h.revision === 1)
    ).toBe(true);
    expect(detail.history.some((h: any) => h.body === 'Please revise')).toBe(
      true
    );
    expect(
      (
        await db.agencyRevision.findUniqueOrThrow({
          where: { id: w.revisionId },
        })
      ).payloadHash
    ).toBe(revision.payloadHash);
    await expect(
      db.agencyReviewComment.update({
        where: { id: result.id },
        data: { body: 'tamper' },
      })
    ).rejects.toThrow();
  } finally {
    await v.portal.dispose();
  }
});
test('T03-01/T03-02: revoking an invitation before dispatch invalidates its stored approval', async ({
  request,
  playwright,
}) => {
  const v = await verified(request, playwright);
  try {
    const w = await submitted(request, v.inv, draft({}, 4000));
    expect(
      (
        await v.portal.post(`${api}/agency/review/works/${w.workId}/approve`, {
          headers: v.csrf,
          data: command(),
        })
      ).status()
    ).toBe(201);
    await enqueue(request, w, v.inv.headers);
    expect(
      (
        await request.post(
          `${api}/agency/review-invitations/${v.inv.id}/revoke`,
          { headers: v.inv.headers, data: {} }
        )
      ).status()
    ).toBe(201);
    await expect
      .poll(
        async () =>
          (
            await db.post.findUniqueOrThrow({ where: { id: w.postId } })
          ).state
      )
      .toBe('ERROR');
    expect(calls(w.postId)).toEqual([]);
  } finally {
    await v.portal.dispose();
  }
});
test('T03-01/T03-02: invitation management and portal resources cannot cross agency boundaries', async ({
  request,
  playwright,
}) => {
  const v = await verified(request, playwright);
  try {
    expect(
      (
        await request.post(api + '/agency/review-invitations', {
          headers: { authorization: keys.a },
          data: {
            clientId: 'fixture-client-a-1',
            name: 'Denied',
            email: 'denied@client.example.test',
          },
        })
      ).status()
    ).toBe(403);
    const b = await staff(request, 'owner-b@example.test');
    expect(
      (
        await request.get(
          api + `/agency/clients/fixture-client-a-1/review-invitations`,
          { headers: b }
        )
      ).status()
    ).toBe(404);
    expect(
      (
        await request.post(
          api + `/agency/review-invitations/${v.inv.id}/revoke`,
          { headers: b, data: {} }
        )
      ).status()
    ).toBe(404);
    const body = draft({}, 600000);
    body.posts[0].integration.id = 'fixture-channel-b-1';
    const saved = await request.post(api + '/agency/posts', {
      headers: b,
      data: body,
    });
    expect(saved.status()).toBe(201);
    const [foreign] = await saved.json();
    expect(
      (
        await v.portal.get(api + `/agency/review/works/${foreign.workId}`)
      ).status()
    ).toBe(404);
    expect(
      (
        await v.portal.post(
          api + `/agency/review/works/${foreign.workId}/approve`,
          { headers: v.csrf, data: command() }
        )
      ).status()
    ).toBe(404);
    expect(calls(foreign.postId)).toEqual([]);
  } finally {
    await v.portal.dispose();
  }
});
test('T03-03: reviewer media uses exact frozen bytes and private range/session/ownership checks', async ({
  request,
  playwright,
}) => {
  const v = await verified(request, playwright);
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=',
      'base64'
    );
    const upload = await request.post(
      api + '/agency/clients/fixture-client-a-1/media',
      {
        headers: v.inv.headers,
        multipart: {
          file: { name: 'client.png', mimeType: 'image/png', buffer: png },
          alt: 'Client image alt',
        },
      }
    );
    expect(upload.status()).toBe(201);
    const media = await upload.json(),
      body = draft({}, 600000);
    body.posts[0].value[0].image.push(media as never);
    const w = await submitted(request, v.inv, body),
      detail = await (
        await v.portal.get(api + `/agency/review/works/${w.workId}`)
      ).json();
    const preview = detail.revision.targets[0].parts[0].media[0];
    expect(preview.alt).toBe('Client image alt');
    expect(preview.hash).toBe(
      (
        await db.agencyMediaSnapshot.findUniqueOrThrow({
          where: { id: preview.id },
        })
      ).contentHash
    );
    const path =
      api +
      `/agency/review/works/${w.workId}/revisions/${w.revisionId}/media/${preview.id}`;
    const result = await v.portal.get(path, {
      headers: { range: 'bytes=0-3' },
    });
    expect(result.status()).toBe(206);
    expect((await result.body()).length).toBe(4);
    expect(result.headers()['cache-control']).toContain('no-store');
    expect(result.headers()['referrer-policy']).toBe('no-referrer');
    const anon = await playwright.request.newContext();
    try {
      expect((await anon.get(path)).status()).toBe(401);
    } finally {
      await anon.dispose();
    }
    const json = JSON.stringify(detail);
    for (const field of [
      'sourcePath',
      'sourceMediaId',
      'tokenHash',
      'secretHash',
      'pendingData',
    ])
      expect(json.includes(field)).toBe(false);
    const keyBody = await v.portal.get(path, {
      headers: { authorization: keys.a },
    });
    expect(keyBody.status()).toBe(403);
  } finally {
    await v.portal.dispose();
  }
});
test('T03-02: renewal closes the old session and cannot resurrect its approved revision', async ({
  request,
  playwright,
}) => {
  const old = await verified(request, playwright);
  let fresh: any;
  try {
    const work = await submitted(request, old.inv);
    expect(
      (
        await old.portal.post(
          api + `/agency/review/works/${work.workId}/approve`,
          { headers: old.csrf, data: command() }
        )
      ).status()
    ).toBe(201);
    fresh = await verified(request, playwright, { email: old.inv.email });
    expect(fresh.inv.reviewerId).toBe(old.inv.reviewerId);
    expect(
      (await old.portal.get(api + '/agency/review/session')).status()
    ).toBe(401);
    const detail = await (
      await fresh.portal.get(api + `/agency/review/works/${work.workId}`)
    ).json();
    expect(detail.available).toBe(false);
    expect(detail.revision).toBeUndefined();
    expect(
      (
        await fresh.portal.post(
          api + `/agency/review/works/${work.workId}/approve`,
          { headers: fresh.csrf, data: command() }
        )
      ).status()
    ).toBe(409);
    expect([403, 404]).toContain(
      (
        await request.post(api + `/agency/works/${work.workId}/schedule`, {
          headers: old.inv.headers,
          data: command(),
        })
      ).status()
    );
    expect(calls(work.postId)).toEqual([]);
  } finally {
    await old.portal.dispose();
    if (fresh) await fresh.portal.dispose();
  }
});
