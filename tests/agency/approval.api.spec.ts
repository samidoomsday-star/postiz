import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { Client, Connection } from '@temporalio/client';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  api,
  staff,
  draft,
  command,
  approved,
  enqueue,
} from './approval.helpers';
import {
  assetCapability,
  bytesHash,
} from '../../libraries/nestjs-libraries/src/agency/revision';
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
const row = (id: string) =>
  db.agencyDispatch.findFirst({ where: { postId: id, stage: 'publish' } });
test.afterAll(() => db.$disconnect());
async function create(request: any, body = draft({}, 60000)) {
  const headers = await staff(request);
  const r = await request.post(api + '/agency/posts', { headers, data: body });
  expect(r.status(), await r.text()).toBe(201);
  return { ...(await r.json())[0], headers, body };
}
async function invokeAgain(postId: string) {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS,
  });
  try {
    const client = new Client({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE,
    });
    const handle = await client.workflow.start('postWorkflowV112', {
      workflowId: `fixture-replay-${randomUUID()}`,
      taskQueue: 'main',
      args: [
        { taskQueue: 'synthetic', postId, organizationId: 'fixture-agency-a' },
      ],
    });
    await handle.result();
  } finally {
    await connection.close();
  }
}
test('T02-01: drafts, owner without reviewer grant and automation cannot approve or dispatch', async ({
  request,
}) => {
  const r = await create(request);
  const cmd = command();
  expect(
    (
      await request.post(`${api}/agency/works/${r.workId}/schedule`, {
        headers: r.headers,
        data: cmd,
      })
    ).status()
  ).toBe(409);
  expect(
    (
      await request.post(`${api}/agency/works/${r.workId}/approve`, {
        headers: { authorization: keys.a },
        data: cmd,
      })
    ).status()
  ).toBe(403);
  expect(
    (
      await request.post(`${api}/agency/works/${r.workId}/submit`, {
        headers: r.headers,
        data: { ...command(), reviewerId: 'fixture-user-a-editor' },
      })
    ).status()
  ).toBe(404);
  const b = await staff(request, 'owner-b@example.test');
  expect(
    (
      await request.get(`${api}/agency/works/${r.workId}`, { headers: b })
    ).status()
  ).toBe(404);
  await invokeAgain(r.postId);
  expect(calls(r.postId)).toEqual([]);
});
test('T02-02: material changes create immutable revisions, invalidate approval, and reject stale commands', async ({
  request,
}) => {
  const r = await approved(request, draft({}, 60000));
  const body = {
    ...r.body,
    date: new Date(Date.now() + 90000).toISOString(),
    posts: r.body.posts.map((p) => ({
      ...p,
      settings: { ...p.settings, marker: 'changed' },
      value: [{ content: 'Changed approved copy', image: [] }],
    })),
  };
  const editCmd = command();
  const edit = await request.post(`${api}/agency/works/${r.workId}/revisions`, {
    headers: r.headers,
    data: { ...body, ...editCmd },
  });
  expect(edit.status(), await edit.text()).toBe(201);
  const newer = (await edit.json())[0];
  expect(newer.revision).toBe(2);
  const replay = await request.post(
    `${api}/agency/works/${r.workId}/revisions`,
    { headers: r.headers, data: { ...body, ...editCmd } }
  );
  expect(await replay.json()).toEqual([newer]);
  expect(await db.agencyRevision.count({ where: { workId: r.workId } })).toBe(
    2
  );
  expect(
    (
      await db.agencyReviewRequest.findUniqueOrThrow({
        where: { revisionId: r.revisionId },
      })
    ).status
  ).toBe('SUPERSEDED');
  for (const action of ['approve', 'schedule'])
    expect(
      (
        await request.post(`${api}/agency/works/${r.workId}/${action}`, {
          headers: r.headers,
          data: command(),
        })
      ).status()
    ).toBe(409);
  await expect(
    db.agencyRevision.update({
      where: { id: r.revisionId },
      data: { payloadHash: 'altered' },
    })
  ).rejects.toThrow();
  await expect(
    db.agencyReviewDecision.deleteMany({ where: { revisionId: r.revisionId } })
  ).rejects.toThrow();
  await expect(
    db.post.update({ where: { id: r.postId }, data: { content: 'altered' } })
  ).rejects.toThrow();
  expect(calls(r.postId)).toEqual([]);
});
test('T02-03: concurrent edit versus approve and two writers cannot approve a stale or double revision', async ({
  request,
}) => {
  const r = await create(request);
  expect(
    (
      await request.post(`${api}/agency/works/${r.workId}/submit`, {
        headers: r.headers,
        data: { ...command(), reviewerId: 'fixture-user-a-owner' },
      })
    ).status()
  ).toBe(201);
  const responses = await Promise.all([
    request.post(`${api}/agency/works/${r.workId}/approve`, {
      headers: r.headers,
      data: command(),
    }),
    request.post(`${api}/agency/works/${r.workId}/revisions`, {
      headers: r.headers,
      data: { ...r.body, ...command() },
    }),
  ]);
  expect(responses[1].status()).toBe(201);
  expect([201, 409]).toContain(responses[0].status());
  expect(
    (await db.agencyWork.findUniqueOrThrow({ where: { id: r.workId } })).status
  ).toBe('DRAFT');
  const writers = await Promise.all(
    [1, 2].map((i) =>
      request.post(`${api}/agency/works/${r.workId}/revisions`, {
        headers: r.headers,
        data: { ...r.body, ...command(2), marker: i },
      })
    )
  );
  expect(writers.map((x) => x.status()).sort()).toEqual([201, 409]);
  expect(await db.agencyRevision.count({ where: { workId: r.workId } })).toBe(
    3
  );
  expect(calls(r.postId)).toEqual([]);
});
test('T02-04: revoke before claim prevents the actual scheduled mutation', async ({
  request,
}) => {
  const r = await approved(request, draft({}, 2500));
  await enqueue(request, r, r.headers);
  const revoke = await request.post(`${api}/agency/works/${r.workId}/revoke`, {
    headers: r.headers,
    data: command(),
  });
  expect(revoke.status()).toBe(201);
  expect((await revoke.json()).inFlight).toBe(false);
  await invokeAgain(r.postId);
  expect(calls(r.postId)).toEqual([]);
  expect((await row(r.postId))?.state).toBe('READY');
});
test('T02-04: claim before revocation returns truthful in-flight status and preserves its receipt', async ({
  request,
}) => {
  const r = await approved(request, draft({ waitBeforeAcceptMs: 3000 }, 2500));
  await enqueue(request, r, r.headers);
  await expect
    .poll(async () => (await row(r.postId))?.state, { intervals: [50] })
    .toBe('CLAIMED');
  const revoke = await request.post(`${api}/agency/works/${r.workId}/revoke`, {
    headers: r.headers,
    data: command(),
  });
  expect(revoke.status()).toBe(201);
  expect((await revoke.json()).inFlight).toBe(true);
  await expect.poll(async () => (await row(r.postId))?.state).toBe('CONFIRMED');
  expect(calls(r.postId)).toHaveLength(1);
  expect(
    (await db.agencyWork.findUniqueOrThrow({ where: { id: r.workId } })).status
  ).toBe('REVOKED');
  await invokeAgain(r.postId);
  expect(calls(r.postId)).toHaveLength(1);
});
test('T02-05: duplicate schedule commands and completed workflow redelivery do not mutate twice', async ({
  request,
}) => {
  const r = await approved(request, draft({}, 2500));
  const c = command();
  const results = await Promise.all(
    [1, 2].map(() =>
      request.post(`${api}/agency/works/${r.workId}/schedule`, {
        headers: r.headers,
        data: c,
      })
    )
  );
  expect(results.map((x) => x.status())).toEqual([201, 201]);
  const reuse = await request.post(`${api}/agency/works/${r.workId}/cancel`, {
    headers: r.headers,
    data: c,
  });
  expect(reuse.status()).toBe(409);
  await expect.poll(async () => (await row(r.postId))?.state).toBe('CONFIRMED');
  await invokeAgain(r.postId);
  expect(calls(r.postId)).toHaveLength(1);
  expect(
    await db.agencyDispatch.count({ where: { revisionId: r.revisionId } })
  ).toBe(1);
});
for (const settings of [{ outcome: 'uncertain' }, { failReceiptWrite: true }])
  test(`T02-05: ${JSON.stringify(
    settings
  )} preserves UNKNOWN and blocks blind retry`, async ({ request }) => {
    const r = await approved(request, draft(settings, 2500));
    await enqueue(request, r, r.headers);
    await expect.poll(async () => (await row(r.postId))?.state).toBe('UNKNOWN');
    expect(calls(r.postId)).toHaveLength(1);
    await invokeAgain(r.postId);
    expect(calls(r.postId)).toHaveLength(1);
    expect((await row(r.postId))?.state).toBe('UNKNOWN');
  });
test('T02-06: delayed thread parts are independently gated after the first receipt', async ({
  request,
}) => {
  const body = draft({}, 2500);
  body.posts[0].value.push({
    content: 'Delayed reply',
    image: [],
    delay: 0.08,
  } as any);
  const r = await approved(request, body);
  await enqueue(request, r, r.headers);
  await expect
    .poll(async () => (await row(r.postId))?.state, { intervals: [50] })
    .toBe('CONFIRMED');
  expect(
    (
      await request.post(`${api}/agency/works/${r.workId}/cancel`, {
        headers: r.headers,
        data: command(),
      })
    ).status()
  ).toBe(201);
  const child = await db.agencyDispatch.findFirstOrThrow({
    where: { revisionId: r.revisionId, part: 1 },
  });
  await invokeAgain(child.postId);
  expect(calls(child.postId)).toEqual([]);
  expect(calls(r.postId)).toHaveLength(1);
});
test('T02-05: pending status reconciliation is read-only and preserves the original receipt', async ({
  request,
}) => {
  const r = await approved(request, draft({ outcome: 'pending' }, 2500));
  await enqueue(request, r, r.headers);
  await expect.poll(async () => (await row(r.postId))?.state).toBe('CONFIRMED');
  expect(calls(r.postId)).toHaveLength(1);
  expect(
    (await db.agencyWork.findUniqueOrThrow({ where: { id: r.workId } })).status
  ).toBe('PUBLISHED');
});
test('T02-02: private media is immutable, bounded and client-bound; changed source bytes invalidate review', async ({
  request,
  playwright,
}) => {
  const owner = await staff(request);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=',
    'base64'
  );
  const uploaded = await request.post(
    `${api}/agency/clients/fixture-client-a-1/media`,
    {
      headers: owner,
      multipart: {
        file: { name: 'fixture.png', mimeType: 'image/png', buffer: png },
        alt: 'Synthetic alt',
      },
    }
  );
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const media = await uploaded.json();
  const body = draft({}, 2500);
  body.posts[0].value[0].image.push(media as never);
  const r = await approved(request, body, owner);
  const snapshot = await db.agencyMediaSnapshot.findFirstOrThrow({
    where: { revisionId: r.revisionId },
  });
  const preview = `${api}/agency/revisions/${r.revisionId}/media/${snapshot.id}`;
  const anonymous = await playwright.request.newContext();
  try {
    expect((await anonymous.get(preview)).status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
  expect(
    (
      await request.get(preview, { headers: { authorization: keys.b } })
    ).status()
  ).toBe(404);
  const ranged = await request.get(preview, {
    headers: { ...owner, range: 'bytes=0-3' },
  });
  expect(ranged.status()).toBe(206);
  expect((await ranged.body()).length).toBe(4);
  expect(ranged.headers()['cache-control']).toContain('no-store');
  await expect(
    db.media.update({ where: { id: media.id }, data: { alt: 'tampered' } })
  ).rejects.toThrow();
  await enqueue(request, r, owner);
  await expect.poll(async () => (await row(r.postId))?.state).toBe('CONFIRMED');
  expect(calls(r.postId)[0].mediaHashes).toEqual([snapshot.contentHash]);
  const dispatch = await row(r.postId);
  const cap = assetCapability(snapshot.id, dispatch!.id);
  expect(
    (
      await request.get(`${api}/agency/assets/${snapshot.id}?cap=${cap}`)
    ).status()
  ).toBe(200);
  expect(
    (
      await request.get(`${api}/agency/assets/${snapshot.id}?cap=${cap}x`)
    ).status()
  ).toBe(404);
  expect(
    (
      await request.get(
        `${api}/agency/assets/${snapshot.id}?cap=${assetCapability(
          snapshot.id,
          dispatch!.id,
          Date.now() - 1
        )}`
      )
    ).status()
  ).toBe(404);
  const later = await approved(
    request,
    { ...body, date: new Date(Date.now() + 60000).toISOString() },
    owner
  );
  const original = await db.media.findUniqueOrThrow({
    where: { id: media.id },
  });
  const path =
    process.env.UPLOAD_DIRECTORY! +
    '/' +
    new URL(original.path).pathname.split('/').pop();
  try {
    writeFileSync(path, Buffer.from('changed'));
    const denied = await request.post(
      `${api}/agency/works/${later.workId}/schedule`,
      { headers: owner, data: command() }
    );
    expect(denied.status()).toBe(409);
    expect(
      (await db.agencyWork.findUniqueOrThrow({ where: { id: later.workId } }))
        .status
    ).toBe('INVALIDATED');
    expect(calls(later.postId)).toEqual([]);
  } finally {
    writeFileSync(path, png);
  }
  const directory = process.env.UPLOAD_DIRECTORY! + '/.agency-revisions';
  const files = readdirSync(directory).sort();
  const stale = await request.post(
    `${api}/agency/works/${later.workId}/revisions`,
    { headers: owner, data: { ...body, ...command(2) } }
  );
  expect(stale.status()).toBe(409);
  expect(readdirSync(directory).sort()).toEqual(files);
  expect(
    await db.agencyMediaSnapshot.count({
      where: { revisionId: later.revisionId },
    })
  ).toBe(1);
  expect(
    bytesHash(await (await request.get(preview, { headers: owner })).body())
  ).toBe(snapshot.contentHash);
});
test('T02-01: admin role cannot approve without explicit reviewer permission; assigned reviewer has no raw content access', async ({
  request,
}) => {
  const r = await create(request);
  const submit = await request.post(`${api}/agency/works/${r.workId}/submit`, {
    headers: r.headers,
    data: { ...command(), reviewerId: 'fixture-user-a-reviewer' },
  });
  expect(submit.status()).toBe(201);
  const grants = await db.agencyGrant.findMany({
    where: {
      userId: 'fixture-user-a-owner',
      clientId: 'fixture-client-a-1',
      role: 'REVIEWER',
      revokedAt: null,
    },
  });
  try {
    await db.agencyGrant.updateMany({
      where: { id: { in: grants.map((g) => g.id) } },
      data: { revokedAt: new Date() },
    });
    expect(
      (
        await request.post(`${api}/agency/works/${r.workId}/approve`, {
          headers: r.headers,
          data: command(),
        })
      ).status()
    ).toBe(404);
  } finally {
    for (const g of grants)
      await db.agencyGrant.update({
        where: { id: g.id },
        data: { revokedAt: g.revokedAt },
      });
  }
  const reviewer = await staff(request, 'reviewer-a@example.test');
  expect(
    (
      await request.get(`${api}/agency/posts/${r.postId}`, {
        headers: reviewer,
      })
    ).status()
  ).toBe(404);
  expect(
    (
      await request.get(`${api}/agency/works/${r.workId}`, {
        headers: reviewer,
      })
    ).status()
  ).toBe(200);
  const c = command();
  const results = await Promise.all(
    [1, 2].map(() =>
      request.post(`${api}/agency/works/${r.workId}/approve`, {
        headers: reviewer,
        data: c,
      })
    )
  );
  expect(results.map((x) => x.status())).toEqual([201, 201]);
  expect(
    await db.agencyReviewDecision.count({ where: { revisionId: r.revisionId } })
  ).toBe(1);
});
test('T02-03: concurrent scheduling versus edit cannot publish the superseded revision', async ({
  request,
}) => {
  const r = await approved(request, draft({}, 60000));
  const responses = await Promise.all([
    request.post(`${api}/agency/works/${r.workId}/schedule`, {
      headers: r.headers,
      data: command(),
    }),
    request.post(`${api}/agency/works/${r.workId}/revisions`, {
      headers: r.headers,
      data: { ...r.body, ...command() },
    }),
  ]);
  expect([201, 409]).toContain(responses[0].status());
  expect(responses[1].status()).toBe(201);
  await invokeAgain(r.postId);
  expect(calls(r.postId)).toEqual([]);
  expect(
    (await db.agencyWork.findUniqueOrThrow({ where: { id: r.workId } })).status
  ).toBe('DRAFT');
});
test('T02-04: current reviewer grant and account binding are checked at dispatch', async ({
  request,
}) => {
  const r = await approved(request, draft({}, 2500));
  await enqueue(request, r, r.headers);
  const channel = await db.integration.findUniqueOrThrow({
    where: { id: 'fixture-channel-a-1' },
  });
  try {
    await db.integration.update({
      where: { id: channel.id },
      data: { internalId: 'synthetic-changed-account' },
    });
    await expect
      .poll(
        async () =>
          (
            await db.post.findUniqueOrThrow({ where: { id: r.postId } })
          ).state
      )
      .toBe('ERROR');
    expect(calls(r.postId)).toEqual([]);
  } finally {
    await db.integration.update({
      where: { id: channel.id },
      data: { internalId: channel.internalId },
    });
  }
  const later = await approved(request, draft({}, 2500));
  await enqueue(request, later, later.headers);
  const grants = await db.agencyGrant.findMany({
    where: {
      userId: 'fixture-user-a-owner',
      clientId: 'fixture-client-a-1',
      role: 'REVIEWER',
      revokedAt: null,
    },
  });
  try {
    await db.agencyGrant.updateMany({
      where: { id: { in: grants.map((g) => g.id) } },
      data: { revokedAt: new Date() },
    });
    await expect
      .poll(
        async () =>
          (
            await db.post.findUniqueOrThrow({ where: { id: later.postId } })
          ).state
      )
      .toBe('ERROR');
    expect(calls(later.postId)).toEqual([]);
  } finally {
    for (const g of grants)
      await db.agencyGrant.update({
        where: { id: g.id },
        data: { revokedAt: g.revokedAt },
      });
  }
});
for (const revoked of [false, true])
  test(`T02-06: pending finalization ${
    revoked ? 'rechecks revocation' : 'claims once and records its receipt'
  }`, async ({ request }) => {
    const r = await approved(request, draft({ outcome: 'finalize' }, 2500));
    await enqueue(request, r, r.headers);
    if (revoked) {
      await expect
        .poll(async () => (await row(r.postId))?.state, { intervals: [50] })
        .toBe('PENDING');
      expect(
        (
          await request.post(`${api}/agency/works/${r.workId}/revoke`, {
            headers: r.headers,
            data: command(),
          })
        ).status()
      ).toBe(201);
      await expect
        .poll(
          async () =>
            (
              await db.post.findUniqueOrThrow({ where: { id: r.postId } })
            ).state
        )
        .toBe('ERROR');
    } else {
      await expect
        .poll(async () => (await row(r.postId))?.state)
        .toBe('CONFIRMED');
      expect(
        await db.agencyDispatch.count({
          where: {
            revisionId: r.revisionId,
            stage: 'finalize',
            state: 'CONFIRMED',
          },
        })
      ).toBe(1);
      await invokeAgain(r.postId);
      expect(
        (await db.post.findUniqueOrThrow({ where: { id: r.postId } })).state
      ).toBe('PUBLISHED');
    }
    const finalized = readFileSync(process.env.AGENCY_PROVIDER_LOG!, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((x) => x.localId === r.postId && x.operation === 'finalized');
    expect(finalized).toHaveLength(revoked ? 0 : 1);
    expect(calls(r.postId)).toHaveLength(1);
  });
test('T02-02: edits after requested changes retire old review projections before pagination', async ({
  request,
}) => {
  const r = await create(request);
  const reviewer = await staff(request, 'reviewer-a@example.test');
  expect(
    (
      await request.post(`${api}/agency/works/${r.workId}/submit`, {
        headers: r.headers,
        data: { ...command(), reviewerId: 'fixture-user-a-reviewer' },
      })
    ).status()
  ).toBe(201);
  const before = await db.agencyRevision.findUniqueOrThrow({
    where: { id: r.revisionId },
  });
  expect(
    (
      await request.post(`${api}/agency/works/${r.workId}/changes`, {
        headers: reviewer,
        data: { ...command(), comment: 'Revise this copy' },
      })
    ).status()
  ).toBe(201);
  expect(
    (await db.agencyRevision.findUniqueOrThrow({ where: { id: r.revisionId } }))
      .payloadHash
  ).toBe(before.payloadHash);
  expect(
    (
      await request.post(`${api}/agency/works/${r.workId}/revisions`, {
        headers: r.headers,
        data: { ...r.body, ...command() },
      })
    ).status()
  ).toBe(201);
  expect(
    (
      await db.agencyReviewRequest.findUniqueOrThrow({
        where: { revisionId: r.revisionId },
      })
    ).status
  ).toBe('SUPERSEDED');
  let reviews = await (
    await request.get(`${api}/agency/reviews`, { headers: reviewer })
  ).json();
  expect(reviews.filter((w: any) => w.id === r.workId)).toHaveLength(0);
  expect(
    (
      await request.post(`${api}/agency/works/${r.workId}/submit`, {
        headers: r.headers,
        data: { ...command(2), reviewerId: 'fixture-user-a-reviewer' },
      })
    ).status()
  ).toBe(201);
  reviews = await (
    await request.get(`${api}/agency/reviews`, { headers: reviewer })
  ).json();
  expect(reviews.filter((w: any) => w.id === r.workId)).toHaveLength(1);
  expect(
    (await db.agencyRevision.findUniqueOrThrow({ where: { id: r.revisionId } }))
      .payloadHash
  ).toBe(before.payloadHash);
});
