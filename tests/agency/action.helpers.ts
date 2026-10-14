import { APIRequestContext, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { Connection, Client } from '@temporalio/client';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { api, command, draft, staff } from './approval.helpers';
export { api, command, staff };
export const db = new PrismaClient();
const editorGrantIds: string[] = [];
const channelBindings: { id: string; clientId: string }[] = [];
export async function cleanupActionFixtures() {
  if (editorGrantIds.length)
    await db.agencyGrant.updateMany({
      where: { id: { in: editorGrantIds.splice(0) } },
      data: { revokedAt: new Date() },
    });
  for (const binding of channelBindings.splice(0))
    await db.integration.updateMany({
      where: {
        id: binding.id,
        organizationId: 'fixture-agency-a',
        OR: [{ customerId: null }, { customerId: { not: binding.clientId } }],
      },
      data: { customerId: binding.clientId },
    });
}
export function mutations(postId: string) {
  return (
    existsSync(process.env.AGENCY_PROVIDER_LOG!)
      ? readFileSync(process.env.AGENCY_PROVIDER_LOG!, 'utf8')
      : ''
  )
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.localId === postId && r.operation === 'accepted');
}
export async function fixture(editor = false) {
  const client = await db.customer.create({
    data: {
      name: 'ZZ Synthetic recovery client ' + randomUUID(),
      orgId: 'fixture-agency-a',
    },
  });
  for (const role of ['EDITOR', 'PUBLISHER', 'REVIEWER'])
    await db.agencyGrant.create({
      data: {
        organizationId: client.orgId,
        userId: 'fixture-user-a-owner',
        clientId: client.id,
        role,
      },
    });
  if (editor) {
    const grant = await db.agencyGrant.create({
      data: {
        organizationId: client.orgId,
        userId: 'fixture-user-a-editor',
        clientId: client.id,
        role: 'EDITOR',
      },
    });
    editorGrantIds.push(grant.id);
  }
  const channels = [];
  for (const name of ['Recovery confirmed', 'Recovery blocked'])
    channels.push(
      await db.integration.create({
        data: {
          name,
          internalId: 'synthetic-' + randomUUID(),
          organizationId: client.orgId,
          customerId: client.id,
          providerIdentifier: 'synthetic',
          type: 'social',
          token: 'synthetic-token',
          ownershipQuarantined: false,
        },
      })
    );
  channelBindings.push(
    ...channels.map((channel) => ({ id: channel.id, clientId: client.id }))
  );
  return { client, channels };
}
export async function save(
  request: APIRequestContext,
  f: Awaited<ReturnType<typeof fixture>>,
  settings: Record<string, unknown>[] = [{}],
  delay = 8000,
  review = true
) {
  const headers = await staff(request);
  const body = {
    ...draft({}, delay),
    posts: settings.map((s, i) => ({
      integration: { id: f.channels[i].id },
      settings: { __type: 'synthetic', ...s },
      value: [
        { content: 'Recovery immutable content ' + randomUUID(), image: [] },
      ],
    })),
  };
  const r = await request.post(api + '/agency/posts', { headers, data: body });
  expect(r.status(), await r.text()).toBe(201);
  const records = await r.json();
  const work = records[0];
  if (review) {
    for (const action of ['submit', 'approve']) {
      const r = await request.post(
        `${api}/agency/works/${work.workId}/${action}`,
        {
          headers,
          data: {
            ...command(),
            ...(action === 'submit'
              ? { reviewerId: 'fixture-user-a-owner' }
              : {}),
          },
        }
      );
      expect(r.status(), await r.text()).toBe(201);
    }
  }
  return { ...work, records, headers, body };
}
export async function scheduled(
  request: APIRequestContext,
  f: Awaited<ReturnType<typeof fixture>>,
  settings: Record<string, unknown>[] = [{}],
  delay = 3000
) {
  const w = await save(request, f, settings, delay);
  const r = await request.post(`${api}/agency/works/${w.workId}/schedule`, {
    headers: w.headers,
    data: command(),
  });
  expect(r.status(), await r.text()).toBe(201);
  return w;
}
export async function receipt(postId: string, state: string) {
  await expect
    .poll(
      async () =>
        (
          await db.agencyDispatch.findFirst({
            where: { postId, stage: 'publish' },
          })
        )?.state
    )
    .toBe(state);
  return db.agencyDispatch.findFirstOrThrow({
    where: { postId, stage: 'publish' },
  });
}
export async function closed(postId: string) {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS,
  });
  try {
    const client = new Client({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE,
    });
    await expect
      .poll(
        async () =>
          (
            await client.workflow.getHandle('post_' + postId).describe()
          ).status.name
      )
      .not.toBe('RUNNING');
  } finally {
    await connection.close();
  }
}
export async function detail(
  request: APIRequestContext,
  w: { revisionId: string; headers: Record<string, string> }
) {
  const r = await request.get(api + '/agency/actions/' + w.revisionId, {
    headers: w.headers,
  });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}
