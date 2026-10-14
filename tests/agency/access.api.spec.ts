import { approved, enqueue } from './approval.helpers';
import { test, expect, APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { Client, Connection } from '@temporalio/client';

const api = 'http://localhost:3000';
const web = 'http://localhost:4200';
const url = new URL(process.env.DATABASE_URL!);
if (
  url.pathname !== '/postiz_agency_test' ||
  !['localhost', '127.0.0.1'].includes(url.hostname)
)
  throw Error('Unsafe test database');
const db = new PrismaClient();
const disposableChannels: string[] = [];
const keys = JSON.parse(readFileSync('.agency/fixture-access.json', 'utf8'));
const a1 = { authorization: keys.a1Draft };
const input = (
  channel = 'fixture-channel-a-1',
  type = 'draft',
  content = `Access test ${randomUUID()}`
) => ({
  type,
  shortLink: false,
  tags: [],
  date: new Date(Date.now() + 1500).toISOString(),
  posts: [
    {
      integration: { id: channel },
      settings: { __type: 'synthetic' },
      value: [{ content, image: [] }],
    },
  ],
});
async function login(
  request: APIRequestContext,
  email = 'owner-a@example.test'
) {
  const response = await request.post(api + '/auth/login', {
    data: { provider: 'LOCAL', email, password: 'LocalFixture123!' },
  });
  expect(response.status()).toBe(200);
  return {
    auth: response.headers().auth,
    showorg: email.endsWith('-b@example.test')
      ? 'fixture-agency-b'
      : 'fixture-agency-a',
  };
}
const calls = (id: string) =>
  (existsSync(process.env.AGENCY_PROVIDER_LOG!)
    ? readFileSync(process.env.AGENCY_PROVIDER_LOG!, 'utf8')
    : ''
  )
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.localId === id);
const keyRecord = (secret: string) =>
  db.agencyCredential.findUniqueOrThrow({
    where: { secretHash: createHash('sha256').update(secret).digest('hex') },
  });
test.afterAll(async () => {
  if (disposableChannels.length) await db.integration.updateMany({ where: { organizationId: 'fixture-agency-a', id: { in: disposableChannels } }, data: { deletedAt: new Date() } });
  await db.$disconnect();
});

test('T01-01: scoped lists, counts, search and direct IDs never expose other clients/agencies', async ({
  request,
}) => {
  const one = await request.post(api + '/agency/posts', {
    headers: a1,
    data: input(),
  });
  expect(one.status()).toBe(201);
  const [{ postId }] = await one.json();
  const clients = await request.get(api + '/agency/clients', { headers: a1 });
  expect(await clients.json()).toEqual([
    { id: 'fixture-client-a-1', name: 'Synthetic Client a1' },
  ]);
  for (const client of [
    'fixture-client-a-2',
    'fixture-client-b-1',
    'nonexistent',
  ]) {
    for (const suffix of ['channels', 'posts', 'posts?search=Access']) {
      const r = await request.get(`${api}/agency/clients/${client}/${suffix}`, {
        headers: a1,
      });
      expect(r.status()).toBe(404);
      expect(await r.text()).not.toContain('Synthetic');
    }
  }
  const own = await request.get(api + '/agency/posts/' + postId, {
    headers: a1,
  });
  expect(own.status()).toBe(200);
  const denied = await request.get(api + '/agency/posts/' + postId, {
    headers: { authorization: keys.b },
  });
  expect(denied.status()).toBe(404);
  const list = await request.get(
    api + '/agency/clients/fixture-client-a-1/posts?search=Access',
    { headers: a1 }
  );
  const result = await list.json();
  expect(result.count).toBeGreaterThan(0);
  expect(
    result.items.every((p: any) => p.clientId === 'fixture-client-a-1')
  ).toBe(true);
});

test('T01-01: nested foreign IDs and mixed client batches fail before any write', async ({
  request,
}) => {
  const owner = await login(request);
  const before = await db.post.count();
  const mixed = input();
  mixed.posts.push(input('fixture-channel-a-2').posts[0]);
  expect(
    (
      await request.post(api + '/agency/posts', { headers: owner, data: mixed })
    ).status()
  ).toBe(400);
  for (const channel of ['fixture-channel-a-2', 'fixture-channel-b-1']) {
    expect(
      (
        await request.post(api + '/agency/posts', {
          headers: a1,
          data: input(channel),
        })
      ).status()
    ).toBe(404);
  }
  expect(await db.post.count()).toBe(before);
});

test('T01-02: staff requires explicit grants, owner role alone does not confer editing', async ({
  request,
}) => {
  const editor = await login(request, 'editor-a@example.test');
  expect(
    (
      await request.get(api + '/agency/management', { headers: editor })
    ).status()
  ).toBe(403);
  expect(
    (
      await request.get(api + '/agency/clients/fixture-client-a-2/posts', {
        headers: editor,
      })
    ).status()
  ).toBe(404);
  expect(
    (
      await request.post(api + '/agency/posts', {
        headers: editor,
        data: input(undefined, 'schedule'),
      })
    ).status()
  ).toBe(400);
  expect(
    (
      await request.post(api + '/agency/posts', {
        headers: editor,
        data: input(),
      })
    ).status()
  ).toBe(201);
  const grant = await db.agencyGrant.findFirstOrThrow({
    where: {
      organizationId: 'fixture-agency-a',
      userId: 'fixture-user-a-owner',
      clientId: 'fixture-client-a-1',
      role: 'EDITOR',
    },
  });
  await db.agencyGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() },
  });
  try {
    const owner = await login(request);
    expect(
      (
        await request.post(api + '/agency/posts', {
          headers: owner,
          data: input(),
        })
      ).status()
    ).toBe(404);
    expect(
      (
        await request.get(api + '/agency/clients/fixture-client-a-1/posts', {
          headers: owner,
        })
      ).status()
    ).toBe(200);
  } finally {
    await db.agencyGrant.update({
      where: { id: grant.id },
      data: { revokedAt: null },
    });
  }
});

test('T01-02: default key is draft-only, display-once, hashed, revocable and bounded', async ({
  request,
}) => {
  const owner = await login(request);
  const name = `Test key ${randomUUID()}`;
  const response = await request.post(api + '/agency/credentials', {
    headers: owner,
    data: {
      name,
      clientIds: ['fixture-client-a-1'],
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  expect(response.status()).toBe(201);
  const key = await response.json();
  expect(key.secret).toMatch(/^agk_[\w-]{43}$/);
  expect(key.actions).toEqual(['content:read', 'draft:write']);
  expect(key.secretHash).toBeUndefined();
  const stored = await db.agencyCredential.findUniqueOrThrow({
    where: { id: key.id },
  });
  expect(stored.secretHash).toBe(
    createHash('sha256').update(key.secret).digest('hex')
  );
  const headers = { authorization: `Bearer ${key.secret}` };
  expect(
    (
      await request.post(api + '/agency/posts', { headers, data: input() })
    ).status()
  ).toBe(201);
  expect(
    (
      await request.post(api + '/agency/posts', {
        headers,
        data: input(undefined, 'schedule'),
      })
    ).status()
  ).toBe(400);
  for (const path of ['management', 'credentials', 'grants']) {
    expect(
      (
        await request[path === 'management' ? 'get' : 'post'](
          api + '/agency/' + path,
          { headers, data: {} }
        )
      ).status()
    ).toBe(403);
  }
  const management = await request.get(api + '/agency/management', {
    headers: owner,
  });
  const text = await management.text();
  expect(text).not.toContain(key.secret);
  expect(text).not.toContain(stored.secretHash);
  for (const actions of [['approve'], ['admin'], ['*']]) {
    expect(
      (
        await request.post(api + '/agency/credentials', {
          headers: owner,
          data: {
            name,
            clientIds: ['fixture-client-a-1'],
            actions,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        })
      ).status()
    ).toBe(400);
  }
  expect(
    (
      await request.post(api + `/agency/credentials/${key.id}/revoke`, {
        headers: owner,
        data: {},
      })
    ).status()
  ).toBe(201);
  expect(
    (await request.get(api + '/agency/clients', { headers })).status()
  ).toBe(401);
});

test('T01-02: channel allowlist scopes counts and draft IDs inside the same client', async ({
  request,
}) => {
  const owner = await login(request);
  const id = `fixture-extra-${randomUUID()}`;
  await db.integration.create({
    data: {
      id,
      internalId: id,
      name: 'Scoped second channel',
      organizationId: 'fixture-agency-a',
      customerId: 'fixture-client-a-1',
      ownershipQuarantined: false,
      token: 'synthetic-token',
      type: 'social',
      providerIdentifier: 'synthetic',
    },
  });
  try {
    const created = await request.post(api + '/agency/credentials', {
      headers: owner,
      data: {
        name: 'Channel allowlist',
        clientIds: ['fixture-client-a-1'],
        channelIds: ['fixture-channel-a-1'],
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    const key = await created.json();
    const headers = { authorization: key.secret };
    const marker = `Other channel private content ${randomUUID()}`;
    const createdPost = await request.post(api + '/agency/posts', {
      headers: owner,
      data: input(id, 'draft', marker),
    });
    expect(createdPost.status()).toBe(201);
    const [{ postId: hiddenId }] = await createdPost.json();
    const hiddenList = await request.get(
      api +
        '/agency/clients/fixture-client-a-1/posts?search=' +
        encodeURIComponent(marker),
      { headers }
    );
    expect(await hiddenList.json()).toEqual({ items: [], count: 0 });
    expect(
      (
        await request.get(api + '/agency/posts/' + hiddenId, { headers })
      ).status()
    ).toBe(404);
    const list = await request.get(
      api + '/agency/clients/fixture-client-a-1/channels',
      { headers }
    );
    expect((await list.json()).map((c: any) => c.id)).toEqual([
      'fixture-channel-a-1',
    ]);
    expect(
      (
        await request.post(api + '/agency/posts', { headers, data: input(id) })
      ).status()
    ).toBe(404);
    expect(
      (
        await request.post(api + '/agency/credentials', {
          headers: owner,
          data: {
            name: 'Invalid nesting',
            clientIds: ['fixture-client-a-2'],
            channelIds: [id],
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        })
      ).status()
    ).toBe(404);
    await request.post(api + `/agency/credentials/${key.id}/revoke`, {
      headers: owner,
      data: {},
    });
  } finally {
    await db.integration.update({ where: { id }, data: { deletedAt: new Date() } });
  }
});

test('T01-02: expired key and revoked staff grant are denied immediately without billing', async ({
  request,
}) => {
  expect(process.env.STRIPE_SECRET_KEY || '').toBe('');
  const key = await keyRecord(keys.a1Draft);
  await db.agencyCredential.update({
    where: { id: key.id },
    data: { expiresAt: new Date(0) },
  });
  try {
    expect(
      (await request.get(api + '/agency/clients', { headers: a1 })).status()
    ).toBe(401);
  } finally {
    await db.agencyCredential.update({
      where: { id: key.id },
      data: { expiresAt: key.expiresAt },
    });
  }
  const editor = await login(request, 'editor-a@example.test');
  const grant = await db.agencyGrant.findFirstOrThrow({
    where: { userId: 'fixture-user-a-editor', role: 'EDITOR', organizationId: 'fixture-agency-a', clientId: 'fixture-client-a-1' },
  });
  await db.agencyGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() },
  });
  try {
    expect(
      await (
        await request.get(api + '/agency/clients', { headers: editor })
      ).json()
    ).toEqual([]);
    expect(
      (
        await request.post(api + '/agency/posts', {
          headers: editor,
          data: input(),
        })
      ).status()
    ).toBe(404);
  } finally {
    await db.agencyGrant.update({
      where: { id: grant.id },
      data: { revokedAt: null },
    });
  }
});

test('T01-02: disabled membership and explicit foreign organization headers cannot fall back', async ({
  request,
}) => {
  const owner = await login(request);
  expect(
    (
      await request.get(api + '/agency/self', {
        headers: { ...owner, showorg: 'fixture-agency-b' },
      })
    ).status()
  ).toBe(401);
  expect(
    (
      await request.get(api + '/agency/self', {
        headers: { ...owner, impersonate: 'fixture-user-b-owner' },
      })
    ).status()
  ).toBe(403);
  expect(
    (
      await request.get(api + '/agency/self', {
        headers: { ...owner, authorization: 'invalid' },
      })
    ).status()
  ).toBe(401);
  const where = {
    userId_organizationId: {
      userId: 'fixture-user-a-owner',
      organizationId: 'fixture-agency-a',
    },
  };
  await db.userOrganization.update({ where, data: { disabled: true } });
  try {
    expect(
      (await request.get(api + '/agency/self', { headers: a1 })).status()
    ).toBe(401);
  } finally {
    await db.userOrganization.update({ where, data: { disabled: false } });
  }
});

test('T01-03: all legacy HTTP surfaces, MCP transports and public previews are closed', async ({
  request,
}) => {
  const owner = await login(request);
  for (const path of [
    '/posts',
    '/media',
    '/analytics',
    '/integrations',
    '/user/invite',
    '/user/join-org',
    '/public/posts/fixture',
    '/oauth/authorize',
    '/media-widget/upload',
    '/clipping-widget/status',
    '/autopost',
    '/admin',
    '/mcp',
    '/mcp/secret',
    '/sse/secret',
    '/message',
  ]) {
    const r = await request.get(api + path, { headers: owner });
    expect([401, 403, 404, 405]).toContain(r.status());
    expect(await r.text()).not.toContain('synthetic-token');
  }
  expect(
    (
      await request.get(api + '/public/v1/integrations', {
        headers: { authorization: 'synthetic-api-a' },
      })
    ).status()
  ).toBe(401);
  for (const path of ['/p/fixture', '/provider/fixture', '/oauth/authorize'])
    expect((await request.get(web + path)).status()).toBe(403);
  const self = await request.get(api + '/user/self', { headers: owner });
  expect(self.status()).toBe(200);
  expect((await self.json()).publicApi).toBe('');
});

test('T01-03: private media bytes/ranges require current client access; quarantine and symlinks deny', async ({
  request,
}) => {
  const filename = `fixture-media-${randomUUID()}.txt`;
  mkdirSync(process.env.UPLOAD_DIRECTORY!, { recursive: true });
  writeFileSync(
    `${process.env.UPLOAD_DIRECTORY}/${filename}`,
    'Synthetic private client bytes'
  );
  const media = await db.media.create({
    data: {
      name: filename,
      path: `${web}/uploads/${filename}`,
      organizationId: 'fixture-agency-a',
      clientId: 'fixture-client-a-1',
      ownershipQuarantined: false,
    },
  });
  const target = `${web}/uploads/${filename}`;
  expect((await request.get(target, { headers: a1 })).status()).toBe(200);
  const range = await request.get(target, {
    headers: { ...a1, range: 'bytes=0-8' },
  });
  expect(range.status()).toBe(206);
  expect(await range.text()).toBe('Synthetic');
  expect(range.headers()['cache-control']).toBe('private, no-store');
  expect(
    (await request.get(target, { headers: { authorization: keys.b } })).status()
  ).toBe(404);
  // Explicit invalid Authorization takes precedence over any login cookies.
  expect(
    (
      await request.get(target, { headers: { authorization: 'invalid' } })
    ).status()
  ).toBe(404);
  await db.media.update({
    where: { id: media.id },
    data: { ownershipQuarantined: true },
  });
  expect((await request.get(target, { headers: a1 })).status()).toBe(404);
  const owner = await login(request);
  expect(
    (
      await request.post(api + `/agency/media/${media.id}/map`, {
        headers: owner,
        data: { clientId: 'fixture-client-b-1' },
      })
    ).status()
  ).toBe(404);
  expect(
    (
      await request.post(api + `/agency/media/${media.id}/map`, {
        headers: owner,
        data: { clientId: 'fixture-client-a-1' },
      })
    ).status()
  ).toBe(201);
  const outside = `/tmp/${randomUUID()}.txt`;
  writeFileSync(outside, 'outside-secret');
  const linkName = `fixture-link-${randomUUID()}.txt`;
  symlinkSync(outside, `${process.env.UPLOAD_DIRECTORY}/${linkName}`);
  await db.media.create({
    data: {
      name: linkName,
      path: `${web}/uploads/${linkName}`,
      organizationId: 'fixture-agency-a',
      clientId: 'fixture-client-a-1',
      ownershipQuarantined: false,
    },
  });
  expect(
    (await request.get(`${web}/uploads/${linkName}`, { headers: a1 })).status()
  ).toBe(404);
});

test('T01-03: cookie mutations reject cross-site Origin; API credentials cannot approve', async ({
  request,
  playwright,
}) => {
  const owner = await login(request);
  const cookie = await playwright.request.newContext({
    extraHTTPHeaders: {
      cookie: `auth=${owner.auth}; showorg=fixture-agency-a`,
    },
  });
  try {
    expect(
      (
        await cookie.post(api + '/agency/clients', {
          headers: { origin: 'https://foreign.example.test' },
          data: { name: 'Forbidden CSRF client' },
        })
      ).status()
    ).toBe(403);
    expect(
      (await cookie.post(api + '/agency/grants', { data: {} })).status()
    ).toBe(403);
  } finally {
    await cookie.dispose();
  }
  expect(
    (
      await request.post(api + '/agency/approve', { headers: a1, data: {} })
    ).status()
  ).toBe(404);
});

test('T01-04: revoked originating credentials block actual delayed Temporal publication', async ({
  request,
}) => {
  const owner = await login(request);
  const key = await (
    await request.post(api + '/agency/credentials', {
      headers: owner,
      data: {
        name: 'Delayed key',
        clientIds: ['fixture-client-a-1'],
        actions: ['content:read', 'draft:write', 'publish:schedule'],
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    })
  ).json();
  const body = input(undefined, 'draft');
  body.date = new Date(Date.now() + 5000).toISOString();
  const record = await approved(request, body, owner);
  const { postId } = record;
  await enqueue(request, record, { authorization: key.secret });
  expect(
    (
      await request.post(api + `/agency/credentials/${key.id}/revoke`, {
        headers: owner,
        data: {},
      })
    ).status()
  ).toBe(201);
  await expect
    .poll(
      async () =>
        (
          await db.post.findUniqueOrThrow({ where: { id: postId } })
        ).state
    )
    .toBe('ERROR');
  expect(calls(postId)).toEqual([]);
});

test('T01-04: direct legacy workflow invocation cannot publish an actorless queued record', async () => {
  const p = await db.post.create({
    data: {
      organizationId: 'fixture-agency-a',
      integrationId: 'fixture-channel-a-1',
      clientId: 'fixture-client-a-1',
      ownershipQuarantined: false,
      state: 'QUEUE',
      publishDate: new Date(),
      group: randomUUID(),
      content: 'Legacy queued content',
      image: '[]',
      settings: JSON.stringify({ __type: 'synthetic' }),
    },
  });
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS,
  });
  try {
    const client = new Client({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE,
    });
    const handle = await client.workflow.start('postWorkflowV112', {
      workflowId: `fixture-legacy-${p.id}`,
      taskQueue: 'main',
      args: [
        {
          taskQueue: 'synthetic',
          postId: p.id,
          organizationId: 'fixture-agency-a',
        },
      ],
    });
    await handle.result();
    expect(
      (await db.post.findUniqueOrThrow({ where: { id: p.id } })).state
    ).toBe('ERROR');
    expect(calls(p.id)).toEqual([]);
  } finally {
    await connection.close();
  }
});

test('T01-05: audit is scoped, redacted and database append-only; foreign assignments fail', async ({
  request,
}) => {
  const owner = await login(request);
  const r = await request.post(api + '/agency/grants', {
    headers: owner,
    data: {
      userId: 'fixture-user-a-editor',
      clientId: 'fixture-client-a-1',
      role: 'PUBLISHER',
    },
  });
  expect(r.status()).toBe(201);
  const grant = await r.json();
  expect(
    (
      await request.post(api + `/agency/grants/${grant.id}/revoke`, {
        headers: owner,
        data: {},
      })
    ).status()
  ).toBe(201);
  for (const input of [
    { userId: 'fixture-user-b-editor', clientId: 'fixture-client-a-1' },
    { userId: 'fixture-user-a-editor', clientId: 'fixture-client-b-1' },
  ]) {
    expect([401, 404]).toContain(
      (
        await request.post(api + '/agency/grants', {
          headers: owner,
          data: { ...input, role: 'EDITOR' },
        })
      ).status()
    );
  }
  const audits = (
    await (
      await request.get(api + '/agency/management', { headers: owner })
    ).json()
  ).audits;
  expect(
    audits.some(
      (a: any) => a.action === 'grant.assigned' && a.resourceId === grant.id
    )
  ).toBe(true);
  expect(
    audits.every((a: any) => a.organizationId === 'fixture-agency-a')
  ).toBe(true);
  expect(JSON.stringify(audits)).not.toMatch(
    /agk_|synthetic-token|secretHash|password/
  );
  const record = await db.agencyAudit.findFirstOrThrow();
  await expect(
    db.agencyAudit.update({
      where: { id: record.id },
      data: { action: 'tampered' },
    })
  ).rejects.toThrow('append-only');
  await expect(
    db.agencyAudit.delete({ where: { id: record.id } })
  ).rejects.toThrow('append-only');
});

test('T01-04: channel reassignment quarantines and pauses content; explicit mapping does not authorize dispatch', async ({
  request,
}) => {
  const owner = await login(request);
  const id = `fixture-remap-${randomUUID()}`;
  disposableChannels.push(id);
  await db.integration.create({
    data: {
      id,
      internalId: id,
      name: 'Remapping fixture',
      organizationId: 'fixture-agency-a',
      customerId: 'fixture-client-a-2',
      ownershipQuarantined: false,
      token: 'synthetic-token',
      type: 'social',
      providerIdentifier: 'synthetic',
    },
  });
  const post = await db.post.create({
    data: {
      organizationId: 'fixture-agency-a',
      integrationId: id,
      clientId: 'fixture-client-a-2',
      ownershipQuarantined: false,
      state: 'QUEUE',
      publishDate: new Date(Date.now() + 86400000),
      group: randomUUID(),
      content: 'Explicit ownership mapping',
      image: '[]',
      settings: JSON.stringify({ __type: 'synthetic' }),
      agencyActorType: 'user',
      agencyActorId: 'fixture-user-a-owner',
    },
  });
  expect(
    (
      await request.post(`${api}/agency/channels/${id}/assign`, {
        headers: owner,
        data: { clientId: 'fixture-client-b-1' },
      })
    ).status()
  ).toBe(404);
  expect(
    (
      await request.post(`${api}/agency/channels/${id}/assign`, {
        headers: owner,
        data: { clientId: 'fixture-client-a-1' },
      })
    ).status()
  ).toBe(201);
  const quarantined = await db.post.findUniqueOrThrow({
    where: { id: post.id },
  });
  expect(quarantined.state).toBe('DRAFT');
  expect(quarantined.ownershipQuarantined).toBe(true);
  expect(quarantined.agencyActorId).toBeNull();
  expect(
    (
      await request.get(`${api}/agency/posts/${post.id}`, { headers: a1 })
    ).status()
  ).toBe(404);
  expect(
    (
      await request.post(`${api}/agency/posts/${post.id}/map`, {
        headers: owner,
        data: { clientId: 'fixture-client-a-1' },
      })
    ).status()
  ).toBe(201);
  const mapped = await db.post.findUniqueOrThrow({ where: { id: post.id } });
  expect(mapped.ownershipQuarantined).toBe(false);
  expect(mapped.agencyActorId).toBeNull();
  expect(
    (
      await request.get(`${api}/agency/posts/${post.id}`, { headers: a1 })
    ).status()
  ).toBe(200);
  await expect(
    db.post.update({
      where: { id: post.id },
      data: { clientId: 'fixture-client-b-1' },
    })
  ).rejects.toThrow('invalid agency post ownership');
  expect(calls(post.id)).toEqual([]);
});

test('T01-03: every inventoried legacy HTTP method is denied before its handler', async ({
  request,
}) => {
  const owner = await login(request);
  // Small RFC4180 reader for our committed static inventory (quoted fields).
  const csv = readFileSync('docs/agency/evidence/entry-paths.csv', 'utf8');
  const lines: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(field);
      field = '';
      if (char === '\n') {
        lines.push(row);
        row = [];
      }
    } else field += char;
  }
  const header = lines.shift()!;
  const records = lines.map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i]]))
  );
  let checked = 0;
  for (const r of records.filter(
    (r) => r.kind === 'HTTP' && !r.source.includes('/agency/')
  )) {
    if (
      r.path === '/' ||
      r.path === '/auth/login' ||
      r.path === '/auth/can-register' ||
      r.path === '/user/self'
    )
      continue;
    const path = r.path
      .replace(/:[\w]+/g, 'fixture-client-b-1')
      .replace(/\{\*\w+\}/g, 'fixture');
    const response = await request.fetch(api + path, {
      method: r.method,
      headers: owner,
      ...(r.method === 'GET' || r.method === 'DELETE' ? {} : { data: {} }),
    });
    expect([401, 403, 404, 405], `${r.method} ${path}`).toContain(
      response.status()
    );
    checked++;
  }
  expect(checked).toBeGreaterThan(220);
});

test('T01-03: login cannot redeem legacy organization invitation cookies', async ({
  playwright,
}) => {
  const request = await playwright.request.newContext({
    extraHTTPHeaders: { cookie: 'org=legacy-invite' },
  });
  try {
    expect(
      (
        await request.post(api + '/auth/login', {
          data: {
            provider: 'LOCAL',
            email: 'owner-a@example.test',
            password: 'LocalFixture123!',
          },
        })
      ).status()
    ).toBe(403);
  } finally {
    await request.dispose();
  }
});

test('T01-01/T01-03: another client in the same agency cannot expose draft IDs or media bytes', async ({
  request,
  playwright,
}) => {
  const owner = await login(request);
  const marker = `Private Client a2 ${randomUUID()}`;
  const created = await request.post(api + '/agency/posts', {
    headers: owner,
    data: input('fixture-channel-a-2', 'draft', marker),
  });
  expect(created.status()).toBe(201);
  const [{ postId }] = await created.json();
  expect(
    (
      await request.get(api + '/agency/posts/' + postId, { headers: a1 })
    ).status()
  ).toBe(404);
  const attack = input();
  (attack.posts[0].value[0] as any).id = postId;
  const count = await db.post.count();
  expect(
    (
      await request.post(api + '/agency/posts', { headers: a1, data: attack })
    ).status()
  ).toBe(404);
  expect(await db.post.count()).toBe(count);
  const filename = `fixture-client-a2-${randomUUID()}.png`;
  writeFileSync(
    `${process.env.UPLOAD_DIRECTORY}/${filename}`,
    'Private Client a2 media'
  );
  const media = await db.media.create({
    data: {
      name: filename,
      path: `${web}/uploads/${filename}`,
      organizationId: 'fixture-agency-a',
      clientId: 'fixture-client-a-2',
      ownershipQuarantined: false,
    },
  });
  expect(
    (await request.get(web + '/uploads/' + filename, { headers: a1 })).status()
  ).toBe(404);
  expect(
    (
      await request.get(api + '/agency/media/' + media.id, { headers: a1 })
    ).status()
  ).toBe(404);
  const attached = input();
  (attached.posts[0].value[0].image as any[]).push({
    id: media.id,
    path: media.path,
  });
  expect(
    (
      await request.post(api + '/agency/posts', { headers: a1, data: attached })
    ).status()
  ).toBe(404);
  const anonymous = await playwright.request.newContext();
  try {
    expect((await anonymous.get(web + '/uploads/' + filename)).status()).toBe(
      404
    );
  } finally {
    await anonymous.dispose();
  }
});

test('T01-01: missing ownership IDs never become an unfiltered query or mutate a channel', async ({
  request,
}) => {
  const owner = await login(request);
  const before = await db.integration.findUniqueOrThrow({
    where: { id: 'fixture-channel-a-1' },
  });
  expect(
    (
      await request.post(api + '/agency/channels/fixture-channel-a-1/assign', {
        headers: owner,
        data: {},
      })
    ).status()
  ).toBe(404);
  const after = await db.integration.findUniqueOrThrow({
    where: { id: before.id },
  });
  expect(after.customerId).toBe(before.customerId);
  expect(after.ownershipQuarantined).toBe(before.ownershipQuarantined);
  expect(
    (
      await request.post(api + '/agency/grants', {
        headers: owner,
        data: { clientId: 'fixture-client-a-1', role: 'EDITOR' },
      })
    ).status()
  ).toBe(400);
});
