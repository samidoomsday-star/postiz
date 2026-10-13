import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { Client, Connection } from '@temporalio/client';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const api = 'http://localhost:3000';
const database = new URL(process.env.DATABASE_URL!);
if (database.pathname !== '/postiz_agency_test' || !['127.0.0.1', 'localhost'].includes(database.hostname)) {
  throw new Error('Integration suite refuses a nonlocal/customer database');
}
const prisma = new PrismaClient();
const keys = JSON.parse(readFileSync('.agency/fixture-access.json', 'utf8'));
const authA = { authorization: keys.a };
const body = (type = 'draft', content = 'ঢাকা synthetic agency content') => ({
  type, date: new Date(Date.now() + 1000).toISOString(), shortLink: false, tags: [],
  posts: [{
    integration: { id: 'fixture-channel-a-1' }, settings: { __type: 'synthetic' },
    value: [{ content, image: [] }],
  }],
});
const callsFor = (id: string) => {
  const path = process.env.AGENCY_PROVIDER_LOG!;
  return (existsSync(path) ? readFileSync(path, 'utf8') : '').split('\n').filter(Boolean)
    .map((line) => JSON.parse(line)).filter((r) => r.localId === id);
};
test.afterAll(async () => prisma.$disconnect());

test('T00-02: actual backend rejects missing and invalid API credentials', async ({ request }) => {
  expect((await request.get(`${api}/agency/clients/fixture-client-a-1/channels`)).status()).toBe(401);
  expect((await request.get(`${api}/agency/clients/fixture-client-a-1/channels`, { headers: { authorization: 'invalid-fixture-key' } })).status()).toBe(401);
});

test('T00-02: real login succeeds and incorrect password fails', async ({ request }) => {
  const login = await request.post(`${api}/auth/login`, {
    data: { provider: 'LOCAL', email: 'owner-a@example.test', password: 'LocalFixture123!' },
  });
  expect(login.status()).toBe(200);
  expect(await login.json()).toEqual({ login: true });
  expect(login.headers()['auth']).toBeTruthy();
  const denied = await request.post(`${api}/auth/login`, {
    data: { provider: 'LOCAL', email: 'owner-a@example.test', password: 'wrong-fixture-password' },
  });
  expect(denied.status()).toBe(400);
});

test('T00-03: registered and connected providers are synthetic only', async ({ request }) => {
  const channels = await request.get(`${api}/agency/clients/fixture-client-a-1/channels`, { headers: authA });
  expect(channels.status()).toBe(200);
  const records = await channels.json();
  expect(records.map((r: any) => r.id).sort()).toEqual(['fixture-channel-a-1']);
  expect(records.every((r: any) => r.providerIdentifier === 'synthetic')).toBe(true);
});

test('T00-02: scoped API saves/lists an actual draft with no provider mutation', async ({ request }) => {
  const create = await request.post(`${api}/agency/posts`, { headers: authA, data: body() });
  expect(create.status(), await create.text()).toBe(201);
  const [{ postId }] = await create.json();
  const stored = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
  expect(stored.state).toBe('DRAFT');
  expect(stored.content).toContain('ঢাকা');
  expect(callsFor(postId)).toEqual([]);
  const listed = await request.get(`${api}/agency/clients/fixture-client-a-1/posts`, {
    headers: authA,
    params: { startDate: new Date(Date.now() - 86400000).toISOString(), endDate: new Date(Date.now() + 86400000).toISOString() },
  });
  expect(listed.status()).toBe(200);
  expect(JSON.stringify(await listed.json())).toContain(postId);
});

test('T00-02 negative: another agency cannot create on this agency channel', async ({ request }) => {
  const count = await prisma.post.count({ where: { integrationId: 'fixture-channel-a-1' } });
  const denied = await request.post(`${api}/agency/posts`, { headers: { authorization: keys.b }, data: body() });
  expect(denied.status()).toBe(404);
  expect(await prisma.post.count({ where: { integrationId: 'fixture-channel-a-1' } })).toBe(count);
});

test('T00-02 negative: invalid empty content cannot be scheduled', async ({ request }) => {
  const before = await prisma.post.count({ where: { integrationId: 'fixture-channel-a-1' } });
  const create = await request.post(`${api}/agency/posts`, { headers: authA, data: body('schedule', '') });
  expect(create.status()).toBe(400);
  const error = await create.json();
  expect(error.statusCode).toBe(400);
  expect([error.message].flat().join(' ')).toContain('non-empty string');
  expect(await prisma.post.count({ where: { integrationId: 'fixture-channel-a-1' } })).toBe(before);
});

test('T00-02: actual Temporal worker publishes once and persists a confirmed receipt', async ({ request }) => {
  const create = await request.post(`${api}/agency/posts`, { headers: authA, data: body('schedule') });
  expect(create.status(), await create.text()).toBe(201);
  const [{ postId }] = await create.json();
  await expect.poll(async () => (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).state).toBe('PUBLISHED');
  const stored = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
  expect(stored.releaseId).toMatch(/^synthetic-/);
  expect(stored.releaseURL).toBe(`https://example.test/published/${stored.releaseId}`);
  expect(callsFor(postId).filter((r) => r.operation === 'accepted')).toHaveLength(1);
  expect(callsFor(postId).filter((r) => r.operation === 'completed')).toHaveLength(1);

  // Exercise the existing republish guard; a test double must not conceal duplicates.
  const republish = body('schedule');
  (republish.posts[0].value[0] as any).id = postId;
  const denied = await request.post(`${api}/agency/posts`, { headers: authA, data: republish });
  expect(denied.status()).toBe(400);
  expect(await denied.text()).toContain('already published');
  expect(callsFor(postId).filter((r) => r.operation === 'accepted')).toHaveLength(1);
});

test('T00-02: known provider rejection produces ERROR without acceptance', async ({ request }) => {
  const input = body('schedule');
  (input.posts[0].settings as any).outcome = 'known-failure';
  const create = await request.post(`${api}/agency/posts`, { headers: authA, data: input });
  expect(create.status(), await create.text()).toBe(201);
  const [{ postId }] = await create.json();
  await expect.poll(async () => (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).state).toBe('ERROR');
  expect(callsFor(postId).filter((r) => r.operation === 'accepted')).toEqual([]);
});

test('T00-02: worker email activity delivers to the real local mail sink', async ({ request }) => {
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS });
  try {
    const client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE });
    const subject = `Agency fixture mail ${randomUUID()}`;
    const handle = await client.workflow.start('sendSingleEmailWorkflow', {
      workflowId: `fixture-email-${randomUUID()}`, taskQueue: 'main',
      args: [{ to: 'reviewer@example.test', subject, html: '<p>Synthetic verification message</p>', addTo: 'top' }],
    });
    await handle.result();
    const messages = await request.get('http://127.0.0.1:18025/api/v1/messages');
    expect(messages.status()).toBe(200);
    expect(JSON.stringify(await messages.json())).toContain(subject);
  } finally {
    await connection.close();
  }
});
