/** T05-05: synthetic-only real HTTP dashboard load, no social mutations. */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
const url = new URL(process.env.DATABASE_URL || '');
if (
  process.env.AGENCY_TEST_MODE !== 'true' ||
  process.env.AGENCY_TEST_ACK !== 'LOCAL_SYNTHETIC_ONLY' ||
  url.pathname !== '/postiz_agency_test' ||
  !['localhost', '127.0.0.1'].includes(url.hostname)
)
  throw Error('Local synthetic performance fixture required');
const db = new PrismaClient();
const org = 'fixture-performance-agency';
const password = 'LocalFixture123!';
const canonical = (value) =>
  Array.isArray(value)
    ? '[' + value.map(canonical).join(',') + ']'
    : value && typeof value === 'object'
    ? '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    : JSON.stringify(value);
const base = process.env.AGENCY_PERFORMANCE_URL || 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))
  throw Error('Local HTTP only');
try {
  await db.organization.upsert({
    where: { id: org },
    update: {},
    create: { id: org, name: 'Synthetic performance agency' },
  });
  for (let u = 0; u < 10; u++) {
    const id = `fixture-performance-user-${u}`;
    await db.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        email: `performance-${u}@example.test`,
        name: `Synthetic performance ${u}`,
        providerName: 'LOCAL',
        timezone: 360,
        password: bcrypt.hashSync(password, 10),
        sendSuccessEmails: false,
        sendFailureEmails: false,
        sendStreakEmails: false,
      },
    });
    await db.userOrganization.upsert({
      where: { userId_organizationId: { userId: id, organizationId: org } },
      update: {},
      create: { userId: id, organizationId: org, role: 'SUPERADMIN' },
    });
  }
  for (let c = 0; c < 50; c++) {
    const clientId = `fixture-performance-client-${c}`;
    await db.customer.upsert({
      where: { id: clientId },
      update: {},
      create: {
        id: clientId,
        orgId: org,
        name: `Synthetic performance client ${String(c).padStart(2, '0')}`,
      },
    });
    for (let t = 0; t < 2; t++) {
      const id = `fixture-performance-channel-${c}-${t}`;
      await db.integration.upsert({
        where: { id },
        update: {},
        create: {
          id,
          organizationId: org,
          customerId: clientId,
          internalId: `synthetic-performance-${c}-${t}`,
          name: `Synthetic channel ${c}-${t}`,
          providerIdentifier: 'synthetic',
          type: 'social',
          token: 'synthetic-token',
          ownershipQuarantined: false,
        },
      });
    }
  }
  const count = await db.agencyWork.count({ where: { organizationId: org } });
  if (count !== 0 && count !== 10000)
    throw Error('Incomplete owned fixture: inspect before resuming');
  if (!count) {
    for (let start = 0; start < 10000; start += 500) {
      const works = [],
        revisions = [];
      for (let i = start; i < start + 500; i++) {
        const clientId = `fixture-performance-client-${i % 50}`,
          workId = `fixture-performance-work-${i}`;
        const payload = {
          timezone: 'Asia/Dhaka',
          targets: [0, 1].map((t) => ({
            channelId: `fixture-performance-channel-${i % 50}-${t}`,
            accountId: `synthetic-performance-${i % 50}-${t}`,
            provider: 'synthetic',
            name: `Synthetic channel ${i % 50}-${t}`,
            editor: 'normal',
            settings: { __type: 'synthetic' },
            publishAt: '2026-10-20T12:00:00.000Z',
            parts: [
              {
                id: `fixture-performance-part-${i}-${t}`,
                content: `ঢাকা synthetic draft ${i}`,
                message: `ঢাকা synthetic draft ${i}`,
                delay: 0,
                dueAt: '2026-10-20T12:00:00.000Z',
                media: [],
              },
            ],
          })),
        };
        works.push({
          id: workId,
          organizationId: org,
          clientId,
          currentVersion: 1,
          status: 'DRAFT',
        });
        revisions.push({
          id: `fixture-performance-revision-${i}`,
          workId,
          organizationId: org,
          clientId,
          version: 1,
          payload,
          payloadHash: createHash('sha256')
            .update(canonical(payload))
            .digest('hex'),
          actorType: 'user',
          actorId: 'fixture-performance-user-0',
        });
      }
      await db.$transaction([
        db.agencyWork.createMany({ data: works }),
        db.agencyRevision.createMany({ data: revisions }),
      ]);
    }
  }
  // Keep every benchmark draft usable by the retained application, including
  // its frozen target Post identities. Never benchmark orphan revision shells.
  const postCount = await db.post.count({ where: { organizationId: org } });
  if (postCount !== 0 && postCount !== 20000)
    throw Error('Incomplete owned post fixture; inspect before resuming');
  if (!postCount)
    for (let start = 0; start < 10000; start += 500) {
      const revisions = await db.agencyRevision.findMany({
        where: { organizationId: org },
        orderBy: { id: 'asc' },
        skip: start,
        take: 500,
      });
      const posts = revisions.flatMap((revision) =>
        revision.payload.targets.flatMap((target) =>
          target.parts.map((part) => ({
            id: part.id,
            organizationId: org,
            clientId: revision.clientId,
            agencyWorkId: revision.workId,
            agencyRevisionId: revision.id,
            agencyActorType: 'user',
            agencyActorId: 'fixture-performance-user-0',
            ownershipQuarantined: false,
            integrationId: target.channelId,
            state: 'DRAFT',
            group: revision.workId + '-' + target.channelId,
            batchId: revision.workId,
            content: part.content,
            publishDate: new Date(target.publishAt),
            delay: 0,
            image: '[]',
            settings: JSON.stringify(target.settings),
            creationMethod: 'WEB',
          }))
        )
      );
      await db.post.createMany({ data: posts });
    }
  const headers = [];
  for (let u = 0; u < 10; u++) {
    const r = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'LOCAL',
        email: `performance-${u}@example.test`,
        password,
      }),
    });
    if (r.status !== 200 || !r.headers.get('auth'))
      throw Error('Performance login failed');
    headers.push({ auth: r.headers.get('auth'), showorg: org });
  }
  const call = async (u, i) => {
    const path =
      i % 3 === 0
        ? '/agency/actions'
        : i % 3 === 1
        ? '/agency/actions?state=SAVED&page=2'
        : `/agency/actions?client=fixture-performance-client-${i % 50}`;
    const start = performance.now(),
      r = await fetch(base + path, { headers: headers[u] });
    const body = await r.json();
    if (
      r.status !== 200 ||
      body.items.length !== 20 ||
      body.count !== (i % 3 === 2 ? 200 : 10000)
    )
      throw Error(
        `Incorrect scoped performance response: status=${r.status}, count=${body.count}, rows=${body.items?.length}`
      );
    return performance.now() - start;
  };
  await Promise.all(headers.map((_, u) => call(u, u)));
  const samples = [];
  await Promise.all(
    headers.map(async (_, u) => {
      for (let i = 0; i < 20; i++) samples.push(await call(u, u * 20 + i));
    })
  );
  samples.sort((a, b) => a - b);
  const result = {
    date: new Date().toISOString(),
    dataset: {
      agencies: 1,
      clients: 50,
      channels: 100,
      workItems: 10000,
      backingPosts: 20000,
      distribution: 'two-target saved drafts; no dispatch or social mutations',
    },
    concurrentUsers: 10,
    warmup: 10,
    requests: samples.length,
    p50Ms: samples[99],
    p95Ms: samples[189],
    maxMs: samples[199],
    thresholdMs: 1000,
    passed: samples[189] <= 1000,
  };
  writeFileSync(
    process.env.AGENCY_PERFORMANCE_RESULT || '.agency/results/performance.json',
    JSON.stringify(result, null, 2) + '\n'
  );
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
} finally {
  await db.$disconnect();
}
