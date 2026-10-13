import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { Client, Connection } from '@temporalio/client';
import { randomUUID } from 'node:crypto';
import {
  api,
  command,
  db,
  fixture,
  save,
  scheduled,
  receipt,
  closed,
  detail,
  mutations,
  staff,
  cleanupActionFixtures,
} from './action.helpers';
test.afterAll(() => db.$disconnect());
test.afterEach(() => cleanupActionFixtures());

test('T04-01: a channel moved to another permitted client cannot carry old-client revision metadata into the queue', async ({
  request,
}) => {
  const f = await fixture(true),
    w = await save(request, f, [{}], 600000, false),
    editor = await staff(request, 'editor-a@example.test');
  const before = await request.get(
    `${api}/agency/actions?client=${f.client.id}`,
    { headers: editor }
  );
  expect((await before.json()).count).toBe(1);
  await db.integration.update({
    where: { id: f.channels[0].id },
    data: { customerId: 'fixture-client-a-1' },
  });
  const after = await request.get(
    `${api}/agency/actions?client=${f.client.id}`,
    { headers: editor }
  );
  const v = await after.json();
  expect(v.items).toEqual([]);
  expect(v.count).toBe(0);
  expect(
    (
      await request.get(`${api}/agency/actions/${w.revisionId}`, {
        headers: editor,
      })
    ).status()
  ).toBe(404);
  await db.agencyGrant.updateMany({
    where: { clientId: f.client.id, userId: 'fixture-user-a-editor' },
    data: { revokedAt: new Date() },
  });
  const all = await request.get(api + '/agency/actions', { headers: editor });
  const items = (await all.json()).items;
  expect(
    items.some((i: any) => i.id === w.revisionId || i.clientId === f.client.id)
  ).toBe(false);
});

test('T04-04: simultaneous reconcile and cancel retain one factual receipt and one probe effect', async ({
  request,
}) => {
  const f = await fixture(),
    w = await scheduled(request, f, [{ outcome: 'uncertain' }]);
  const d = await receipt(w.postId, 'UNKNOWN');
  await closed(w.postId);
  const input = { ...command(), dispatchId: d.id, expectedAttempt: 0 };
  const replies = await Promise.all([
    request.post(`${api}/agency/actions/${w.revisionId}/reconcile`, {
      headers: w.headers,
      data: input,
    }),
    request.post(`${api}/agency/actions/${w.revisionId}/reconcile`, {
      headers: w.headers,
      data: input,
    }),
    request.post(`${api}/agency/works/${w.workId}/cancel`, {
      headers: w.headers,
      data: command(),
    }),
  ]);
  expect(replies.map((r) => r.status())).toEqual([201, 201, 201]);
  expect(await replies[0].json()).toEqual(await replies[1].json());
  expect((await detail(request, w)).state).toBe('PUBLISHED');
  expect(mutations(w.postId)).toHaveLength(1);
  expect(
    await db.agencyRecoveryEvidence.count({ where: { dispatchId: d.id } })
  ).toBe(1);
});

test('T04-05: an explicit publisher resume can replace a revoked queued credential with audited current authority', async ({
  request,
}) => {
  const f = await fixture(),
    w = await save(request, f, [{}], 4000);
  const create = await request.post(api + '/agency/credentials', {
    headers: w.headers,
    data: {
      name: 'Synthetic queued origin',
      clientIds: [f.client.id],
      channelIds: [f.channels[0].id],
      actions: ['content:read', 'publish:schedule'],
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    },
  });
  expect(create.status()).toBe(201);
  const key = await create.json();
  expect(
    (
      await request.post(`${api}/agency/works/${w.workId}/schedule`, {
        headers: { authorization: key.secret },
        data: command(),
      })
    ).status()
  ).toBe(201);
  expect(
    (
      await request.post(`${api}/agency/credentials/${key.id}/revoke`, {
        headers: w.headers,
        data: {},
      })
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
  await closed(w.postId);
  expect(mutations(w.postId)).toHaveLength(0);
  const d = await receipt(w.postId, 'READY');
  expect(d.actorType).toBe('credential');
  const r = await request.post(`${api}/agency/actions/${w.revisionId}/resume`, {
    headers: w.headers,
    data: { ...command(), dispatchId: d.id, expectedAttempt: 0 },
  });
  expect(r.status(), await r.text()).toBe(201);
  const done = await receipt(w.postId, 'CONFIRMED');
  expect(done.actorType).toBe('user');
  expect(done.actorId).toBe('fixture-user-a-owner');
  expect(mutations(w.postId)).toHaveLength(1);
  expect(
    (await detail(request, w)).audits.some(
      (a: any) => a.action === 'action.resume'
    )
  ).toBe(true);
});

test('T04-01: scope, channel allowlists and filters apply before action pagination/counts', async ({
  request,
}) => {
  const f = await fixture(true);
  const grant = await db.agencyGrant.findFirstOrThrow({
    where: { clientId: f.client.id, userId: 'fixture-user-a-editor' },
  });
  await db.agencyGrant.update({
    where: { id: grant.id },
    data: { channelIds: [f.channels[0].id] },
  });
  for (let i = 0; i < 21; i++) await save(request, f, [{}], 600000, false);
  const hidden = await save(
    request,
    { ...f, channels: [f.channels[1]] },
    [{}],
    600000,
    false
  );
  const editor = await staff(request, 'editor-a@example.test'),
    foreign = await staff(request, 'owner-b@example.test');
  const first = await request.get(
    `${api}/agency/actions?client=${f.client.id}&state=SAVED`,
    { headers: editor }
  );
  expect(first.status()).toBe(200);
  const v = await first.json();
  expect(v.count).toBe(21);
  expect(v.items).toHaveLength(20);
  expect(v.hasMore).toBe(true);
  expect(
    v.items.every((i: any) => i.clientId === f.client.id && i.state === 'SAVED')
  ).toBe(true);
  const second = await request.get(
    `${api}/agency/actions?client=${f.client.id}&state=SAVED&page=1`,
    { headers: editor }
  );
  expect((await second.json()).items).toHaveLength(1);
  const empty = await request.get(
    `${api}/agency/actions?client=${f.client.id}&state=SAVED&page=2`,
    { headers: editor }
  );
  const emptyValue = await empty.json();
  expect(emptyValue.items).toHaveLength(0);
  expect(emptyValue.count).toBe(21);
  expect(
    (
      await request.get(`${api}/agency/actions?owner=me&owner=unassigned`, {
        headers: editor,
      })
    ).status()
  ).toBe(400);
  expect(
    (
      await request.get(api + '/agency/actions/' + hidden.revisionId, {
        headers: editor,
      })
    ).status()
  ).toBe(404);
  expect(
    (
      await request.get(api + '/agency/actions/' + hidden.revisionId, {
        headers: foreign,
      })
    ).status()
  ).toBe(404);
  expect(
    (
      await request.get(api + '/agency/actions?client=' + f.client.id, {
        headers: foreign,
      })
    ).status()
  ).toBe(404);
  expect(
    (
      await request.get(api + '/agency/actions?state=success', {
        headers: editor,
      })
    ).status()
  ).toBe(400);
  const reviewer = await staff(request, 'reviewer-a@example.test');
  expect(
    (
      await request.get(api + '/agency/actions/' + hidden.revisionId, {
        headers: reviewer,
      })
    ).status()
  ).toBe(404);
});

test('T04-01: review pending, changes, invalidated and blocked states have factual next actions', async ({
  request,
}) => {
  const f = await fixture();
  const w = await save(request, f, [{}], 600000, false);
  expect((await detail(request, w)).state).toBe('SAVED');
  await request.post(`${api}/agency/works/${w.workId}/submit`, {
    headers: w.headers,
    data: { ...command(), reviewerId: 'fixture-user-a-owner' },
  });
  expect((await detail(request, w)).state).toBe('REVIEW_PENDING');
  await request.post(`${api}/agency/works/${w.workId}/changes`, {
    headers: w.headers,
    data: { ...command(), comment: 'Revise the content' },
  });
  expect((await detail(request, w)).state).toBe('CHANGES_REQUESTED');
  const approved = await save(request, f, [{}], 600000);
  await request.post(`${api}/agency/works/${approved.workId}/revoke`, {
    headers: approved.headers,
    data: command(),
  });
  expect((await detail(request, approved)).state).toBe('APPROVAL_INVALIDATED');
  const permissionBound = await save(request, f, [{}], 600000);
  await db.agencyGrant.updateMany({
    where: {
      clientId: f.client.id,
      userId: 'fixture-user-a-owner',
      role: 'REVIEWER',
    },
    data: { revokedAt: new Date() },
  });
  expect((await detail(request, permissionBound)).state).toBe(
    'APPROVAL_INVALIDATED'
  );
  const blocked = await save(request, f, [{}], 600000, false);
  await db.integration.update({
    where: { id: f.channels[0].id },
    data: { refreshNeeded: true },
  });
  expect((await detail(request, blocked)).state).toBe('CHANNEL_BLOCKED');
  expect((await detail(request, blocked)).receipts).toEqual([]);
});

test('T04-02/T04-04: preserve the successful target, prove rejection and retry only the failed target once', async ({
  request,
}) => {
  const f = await fixture();
  const w = await scheduled(request, f, [{}, { outcome: 'rate-limit-once' }]);
  const good = await receipt(w.records[0].postId, 'CONFIRMED'),
    bad = await receipt(w.records[1].postId, 'FAILED');
  await closed(bad.postId);
  const view = await detail(request, w);
  expect(view.state).toBe('PARTIAL');
  expect(view.confirmed).toBe(1);
  expect(view.receipts.find((r: any) => r.id === bad.id).canRetry).toBe(true);
  const input = { ...command(), dispatchId: bad.id, expectedAttempt: 0 };
  const responses = await Promise.all(
    [1, 2].map(() =>
      request.post(`${api}/agency/actions/${w.revisionId}/retry`, {
        headers: w.headers,
        data: input,
      })
    )
  );
  for (const r of responses) expect(r.status(), await r.text()).toBe(201);
  expect(await responses[0].json()).toEqual(await responses[1].json());
  await receipt(bad.postId, 'CONFIRMED');
  expect(mutations(good.postId)).toHaveLength(1);
  expect(mutations(bad.postId)).toHaveLength(1);
  const after = await detail(request, w);
  expect(after.state).toBe('PUBLISHED');
  expect(after.confirmed).toBe(2);
  expect(after.evidence.filter((e: any) => e.kind === 'RETRY')).toHaveLength(1);
  expect(after.receipts.find((r: any) => r.id === good.id).providerUrl).toBe(
    good.providerUrl
  );
  expect(
    (
      await request.post(`${api}/agency/actions/${w.revisionId}/retry`, {
        headers: w.headers,
        data: input,
      })
    ).status()
  ).toBe(201);
  expect(mutations(bad.postId)).toHaveLength(1);
  expect(
    (
      await request.post(`${api}/agency/actions/${w.revisionId}/retry`, {
        headers: w.headers,
        data: { ...input, ...command() },
      })
    ).status()
  ).toBe(409);
  await expect(
    db.agencyRecoveryEvidence.updateMany({
      where: { dispatchId: bad.id },
      data: { outcome: 'tamper' },
    })
  ).rejects.toThrow();
  await db.agencyGrant.updateMany({
    where: {
      clientId: f.client.id,
      userId: 'fixture-user-a-owner',
      role: 'PUBLISHER',
    },
    data: { revokedAt: new Date() },
  });
  expect(
    (
      await request.post(`${api}/agency/actions/${w.revisionId}/retry`, {
        headers: w.headers,
        data: input,
      })
    ).status()
  ).toBe(404);
});

for (const settings of [{ outcome: 'uncertain' }, { failReceiptWrite: true }])
  test(`T04-03: ${JSON.stringify(
    settings
  )} reconciles confirmed evidence without another mutation`, async ({
    request,
  }) => {
    const f = await fixture();
    const w = await scheduled(request, f, [settings]);
    const d = await receipt(w.postId, 'UNKNOWN');
    await closed(w.postId);
    expect((await detail(request, w)).state).toBe('UNKNOWN');
    expect((await detail(request, w)).receipts[0].canRetry).toBe(false);
    expect(
      (
        await request.post(`${api}/agency/actions/${w.revisionId}/retry`, {
          headers: w.headers,
          data: { ...command(), dispatchId: d.id, expectedAttempt: 0 },
        })
      ).status()
    ).toBe(409);
    const input = { ...command(), dispatchId: d.id, expectedAttempt: 0 };
    const r = await request.post(
      `${api}/agency/actions/${w.revisionId}/reconcile`,
      { headers: w.headers, data: input }
    );
    expect(r.status(), await r.text()).toBe(201);
    expect((await r.json()).outcome).toBe('CONFIRMED');
    expect((await detail(request, w)).state).toBe('PUBLISHED');
    expect(mutations(w.postId)).toHaveLength(1);
    expect(
      (
        await request.post(`${api}/agency/actions/${w.revisionId}/reconcile`, {
          headers: w.headers,
          data: input,
        })
      ).status()
    ).toBe(201);
    expect(mutations(w.postId)).toHaveLength(1);
    await expect(
      db.agencyDispatch.update({
        where: { id: d.id },
        data: { state: 'READY' },
      })
    ).rejects.toThrow();
  });

test('T04-03: missing remote evidence retains unknown; manual acknowledgment never changes the receipt', async ({
  request,
}) => {
  const f = await fixture();
  const w = await scheduled(request, f, [{ outcome: 'uncertain' }]);
  const d = await receipt(w.postId, 'UNKNOWN');
  await closed(w.postId);
  // A separate uncertain finalization has no matching remote finalized fact.
  const unknown = await db.agencyDispatch.create({
    data: {
      organizationId: d.organizationId,
      clientId: d.clientId,
      workId: d.workId,
      revisionId: d.revisionId,
      postId: d.postId,
      channelId: d.channelId,
      part: 0,
      stage: 'finalize',
      state: 'UNKNOWN',
      actorType: d.actorType,
      actorId: d.actorId,
      claimedAt: d.claimedAt,
    },
  });
  const r = await request.post(
    `${api}/agency/actions/${w.revisionId}/reconcile`,
    {
      headers: w.headers,
      data: { ...command(), dispatchId: unknown.id, expectedAttempt: 0 },
    }
  );
  expect(r.status(), await r.text()).toBe(201);
  expect((await r.json()).outcome).toBe('UNKNOWN');
  const input = {
    ...command(),
    expectedActionVersion: 0,
    ownerId: 'fixture-user-a-owner',
    disposition: 'DISMISSED',
    note: 'Checked account; no receipt evidence. Do not resend.',
  };
  const update = await request.post(
    `${api}/agency/actions/${w.revisionId}/update`,
    { headers: w.headers, data: input }
  );
  expect(update.status(), await update.text()).toBe(201);
  const v = await detail(request, w);
  expect(v.state).toBe('UNKNOWN');
  expect(v.disposition).toBe('DISMISSED');
  expect(v.receipts.find((r: any) => r.id === unknown.id).state).toBe(
    'UNKNOWN'
  );
  expect(mutations(w.postId)).toHaveLength(1);
  const queue = await request.get(
    `${api}/agency/actions?client=${f.client.id}&state=UNKNOWN&owner=me&urgency=HIGH`,
    { headers: w.headers }
  );
  expect((await queue.json()).items).toHaveLength(1);
});

test('T04-04: operator updates are nonmaterial, versioned, idempotent and require current staff access', async ({
  request,
}) => {
  const f = await fixture(true),
    w = await save(request, f, [{}], 600000),
    editor = await staff(request, 'editor-a@example.test');
  const input = {
    ...command(),
    expectedActionVersion: 0,
    ownerId: 'fixture-user-a-editor',
    disposition: 'ACKNOWLEDGED',
    note: '<img src=x onerror=alert(1)> investigate',
  };
  const replies = await Promise.all(
    [1, 2].map(() =>
      request.post(`${api}/agency/actions/${w.revisionId}/update`, {
        headers: editor,
        data: input,
      })
    )
  );
  expect(replies.map((r) => r.status())).toEqual([201, 201]);
  expect(await replies[0].json()).toEqual(await replies[1].json());
  expect(
    (await db.agencyWork.findUniqueOrThrow({ where: { id: w.workId } })).status
  ).toBe('APPROVED');
  expect(await db.agencyRevision.count({ where: { workId: w.workId } })).toBe(
    1
  );
  expect(
    (
      await request.post(`${api}/agency/actions/${w.revisionId}/update`, {
        headers: editor,
        data: { ...input, ...command(), note: 'stale' },
      })
    ).status()
  ).toBe(409);
  expect(
    (
      await request.post(`${api}/agency/actions/${w.revisionId}/update`, {
        headers: editor,
        data: {
          ...input,
          ...command(),
          expectedActionVersion: 1,
          ownerId: 'fixture-user-b-owner',
        },
      })
    ).status()
  ).toBe(404);
  expect(
    (
      await request.post(`${api}/agency/actions/${w.revisionId}/retry`, {
        headers: editor,
        data: { ...command(), dispatchId: 'foreign', expectedAttempt: 0 },
      })
    ).status()
  ).toBe(404);
  const grant = await db.agencyGrant.findFirstOrThrow({
    where: { clientId: f.client.id, userId: 'fixture-user-a-editor' },
  });
  await db.agencyGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() },
  });
  expect(
    (
      await request.post(`${api}/agency/actions/${w.revisionId}/update`, {
        headers: editor,
        data: input,
      })
    ).status()
  ).toBe(404);
  const v = await detail(request, w);
  expect(
    v.audits.filter((a: any) => a.action === 'action.update')
  ).toHaveLength(1);
  expect(JSON.stringify(v)).not.toContain('synthetic-token');
  expect(JSON.stringify(v)).not.toContain('pendingData');
});

test('T04-04: concurrent retry and cancel never resend an uncertain or canceled target', async ({
  request,
}) => {
  const f = await fixture(),
    w = await scheduled(request, f, [{ outcome: 'rate-limit-once' }]);
  const d = await receipt(w.postId, 'FAILED');
  await closed(w.postId);
  const replies = await Promise.all([
    request.post(`${api}/agency/actions/${w.revisionId}/retry`, {
      headers: w.headers,
      data: { ...command(), dispatchId: d.id, expectedAttempt: 0 },
    }),
    request.post(`${api}/agency/works/${w.workId}/cancel`, {
      headers: w.headers,
      data: command(),
    }),
  ]);
  expect([201, 409]).toContain(replies[0].status());
  expect(replies[1].status()).toBe(201);
  await expect.poll(() => mutations(w.postId).length).toBeLessThanOrEqual(1);
  expect(['FAILED', 'READY', 'CONFIRMED', 'CLAIMED']).toContain(
    (await db.agencyDispatch.findUniqueOrThrow({ where: { id: d.id } })).state
  );
});

test('T04-02/T04-03: processing receipt and lost upload receipt never become a false published result', async ({
  request,
}) => {
  const f = await fixture(),
    pending = await scheduled(request, f, [
      { outcome: 'pending', processingMs: 60000 },
    ]);
  const d = await receipt(pending.postId, 'PENDING');
  expect((await detail(request, pending)).state).toBe('PROCESSING');
  const check = await request.post(
    `${api}/agency/actions/${pending.revisionId}/reconcile`,
    {
      headers: pending.headers,
      data: { ...command(), dispatchId: d.id, expectedAttempt: 0 },
    }
  );
  expect(check.status(), await check.text()).toBe(201);
  expect((await check.json()).outcome).toBe('PROCESSING');
  expect(mutations(pending.postId)).toHaveLength(1);
  const lost = await scheduled(request, f, [
    { outcome: 'pending', failReceiptWrite: true },
  ]);
  const unknown = await receipt(lost.postId, 'UNKNOWN');
  await closed(lost.postId);
  const probe = await request.post(
    `${api}/agency/actions/${lost.revisionId}/reconcile`,
    {
      headers: lost.headers,
      data: { ...command(), dispatchId: unknown.id, expectedAttempt: 0 },
    }
  );
  expect(probe.status(), await probe.text()).toBe(201);
  expect((await probe.json()).outcome).toBe('UNKNOWN');
  expect((await detail(request, lost)).state).toBe('UNKNOWN');
  expect(mutations(lost.postId)).toHaveLength(1);
});

test('T04-03: unsupported external provider contract records manual resolution with real database policy', async ({
  request,
}) => {
  const f = await fixture(),
    w = await scheduled(request, f, [{ outcome: 'uncertain' }]);
  const d = await receipt(w.postId, 'UNKNOWN');
  await closed(w.postId);
  // Inject only the external provider contract; authorization, commands,
  // transactions and evidence use the same real PostgreSQL implementation.
  const {
    ActionService,
  } = require('../../apps/backend/dist/libraries/nestjs-libraries/src/agency/action.service.js');
  const {
    AgencyService,
  } = require('../../apps/backend/dist/libraries/nestjs-libraries/src/agency/agency.service.js');
  const {
    SocialAbstract,
  } = require('../../apps/backend/dist/libraries/nestjs-libraries/src/integrations/social.abstract.js');
  const service = new ActionService(
    db,
    new AgencyService(db),
    {},
    {
      getSocialIntegration: () => ({
        checkPostStatus: SocialAbstract.prototype.checkPostStatus,
      }),
    },
    {}
  );
  const actor = {
    type: 'user',
    id: 'fixture-user-a-owner',
    organizationId: 'fixture-agency-a',
  };
  const result = await service.reconcile(actor, w.revisionId, {
    ...command(),
    dispatchId: d.id,
    expectedAttempt: 0,
  });
  expect(result.outcome).toBe('UNSUPPORTED');
  const v = await service.detail(actor, w.revisionId);
  expect(v.receipts[0].canReconcile).toBe(false);
  expect(v.receipts[0].canRetry).toBe(false);
  expect(v.receipts[0].manualResolution).toContain('manually');
  expect(v.state).toBe('UNKNOWN');
  expect(mutations(w.postId)).toHaveLength(1);
});

test('T04-02: a FAILED label without external no-side-effect proof cannot arm a retry', async ({
  request,
}) => {
  const f = await fixture(),
    w = await save(request, f, [{}], 600000);
  const d = await db.agencyDispatch.create({
    data: {
      organizationId: f.client.orgId,
      clientId: f.client.id,
      workId: w.workId,
      revisionId: w.revisionId,
      postId: w.postId,
      channelId: f.channels[0].id,
      part: 0,
      state: 'FAILED',
      claimedAt: new Date(),
      actorType: 'user',
      actorId: 'fixture-user-a-owner',
    },
  });
  const r = await request.post(`${api}/agency/actions/${w.revisionId}/retry`, {
    headers: w.headers,
    data: { ...command(), dispatchId: d.id, expectedAttempt: 0 },
  });
  expect(r.status(), await r.text()).toBe(409);
  expect(mutations(w.postId)).toHaveLength(0);
  expect(
    (await db.agencyDispatch.findUniqueOrThrow({ where: { id: d.id } })).attempt
  ).toBe(0);
});

test('T04-04: an older workflow cannot consume a newly armed recovery attempt', async ({
  request,
}) => {
  const f = await fixture(),
    w = await scheduled(request, f, [{ outcome: 'rate-limit-once' }]);
  const d = await receipt(w.postId, 'FAILED');
  await closed(w.postId);
  const run = (action: string) => {
    const r = spawnSync(
      'python3',
      ['scripts/agency/runtime.py', action, '--worker-only'],
      { env: process.env, encoding: 'utf8' }
    );
    expect(r.status, r.stderr).toBe(0);
  };
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS,
  });
  try {
    run('stop');
    const retry = await request.post(
      `${api}/agency/actions/${w.revisionId}/retry`,
      {
        headers: w.headers,
        data: { ...command(), dispatchId: d.id, expectedAttempt: 0 },
      }
    );
    expect(retry.status(), await retry.text()).toBe(201);
    const client = new Client({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE,
    });
    await client.workflow.start('postWorkflowV112', {
      workflowId: 'phase4-stale-' + randomUUID(),
      taskQueue: 'main',
      args: [
        {
          taskQueue: 'synthetic',
          postId: w.postId,
          organizationId: f.client.orgId,
        },
      ],
    });
    expect(
      (await db.agencyDispatch.findUniqueOrThrow({ where: { id: d.id } })).state
    ).toBe('READY');
  } finally {
    run('start');
    await connection.close();
  }
  await receipt(w.postId, 'CONFIRMED');
  expect(mutations(w.postId)).toHaveLength(1);
  expect((await detail(request, w)).state).toBe('PUBLISHED');
});

test('T04-05: disconnected queued work is blocked; restoring the same account resumes unclaimed work', async ({
  request,
}) => {
  const f = await fixture(),
    w = await scheduled(request, f, [{}], 3000);
  await db.integration.update({
    where: { id: f.channels[0].id },
    data: { disabled: true },
  });
  await expect
    .poll(
      async () =>
        (
          await db.post.findUniqueOrThrow({ where: { id: w.postId } })
        ).state
    )
    .toBe('ERROR');
  expect((await detail(request, w)).state).toBe('CHANNEL_BLOCKED');
  expect(mutations(w.postId)).toHaveLength(0);
  const d = await receipt(w.postId, 'READY');
  const input = { ...command(), dispatchId: d.id, expectedAttempt: 0 };
  expect(
    (
      await request.post(`${api}/agency/actions/${w.revisionId}/resume`, {
        headers: w.headers,
        data: input,
      })
    ).status()
  ).toBe(409);
  await db.integration.update({
    where: { id: f.channels[0].id },
    data: { disabled: false },
  });
  await closed(w.postId);
  const r = await request.post(`${api}/agency/actions/${w.revisionId}/resume`, {
    headers: w.headers,
    data: input,
  });
  expect(r.status(), await r.text()).toBe(201);
  expect((await r.json()).outcome).toBe('QUEUED');
  await receipt(w.postId, 'CONFIRMED');
  expect(mutations(w.postId)).toHaveLength(1);
});

test('T04-05: a stopped worker leaves due work stalled despite healthy HTTP; restart confirms once', async ({
  request,
}) => {
  const f = await fixture(),
    w = await scheduled(request, f, [{}], 6000);
  const run = (action: string) => {
    const r = spawnSync(
      'python3',
      ['scripts/agency/runtime.py', action, '--worker-only'],
      { env: process.env, encoding: 'utf8' }
    );
    expect(r.status, r.stderr).toBe(0);
  };
  try {
    run('stop');
    expect((await request.get(api + '/auth/can-register')).status()).toBe(200);
    await expect
      .poll(async () => (await detail(request, w)).state, { timeout: 16000 })
      .toBe('DUE_STALLED');
    expect(mutations(w.postId)).toHaveLength(0);
    expect((await detail(request, w)).receipts[0].meaning).toBe('scheduled');
  } finally {
    run('start');
  }
  await receipt(w.postId, 'CONFIRMED');
  expect(mutations(w.postId)).toHaveLength(1);
  expect((await detail(request, w)).state).toBe('PUBLISHED');
});
