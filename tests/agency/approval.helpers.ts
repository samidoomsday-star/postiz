import { APIRequestContext, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
export const api = 'http://localhost:3000';
export async function staff(
  request: APIRequestContext,
  email = 'owner-a@example.test'
) {
  const result = await request.post(api + '/auth/login', {
    data: { provider: 'LOCAL', email, password: 'LocalFixture123!' },
  });
  expect(result.status()).toBe(200);
  return {
    auth: result.headers().auth,
    showorg: email.endsWith('-b@example.test')
      ? 'fixture-agency-b'
      : 'fixture-agency-a',
  };
}
export function draft(settings: Record<string, unknown> = {}, delay = 8000) {
  return {
    type: 'draft',
    shortLink: false,
    tags: [],
    date: new Date(Date.now() + delay).toISOString(),
    displayTimezone: 'Asia/Dhaka',
    posts: [
      {
        integration: { id: 'fixture-channel-a-1' },
        settings: { __type: 'synthetic', ...settings },
        value: [
          { content: `ঢাকা approved content ${randomUUID()}`, image: [] },
        ],
      },
    ],
  };
}
export function command(version = 1) {
  return { expectedRevision: version, operationId: randomUUID() };
}
export async function approved(
  request: APIRequestContext,
  body:
    | ReturnType<typeof draft>
    | Omit<ReturnType<typeof draft>, 'displayTimezone'> = draft(),
  headers?: Record<string, string>
) {
  const owner = headers || (await staff(request));
  const saved = await request.post(api + '/agency/posts', {
    headers: owner,
    data: body,
  });
  expect(saved.status(), await saved.text()).toBe(201);
  const [record] = await saved.json();
  const submit = await request.post(
    `${api}/agency/works/${record.workId}/submit`,
    {
      headers: owner,
      data: { ...command(record.revision), reviewerId: 'fixture-user-a-owner' },
    }
  );
  expect(submit.status(), await submit.text()).toBe(201);
  const approve = await request.post(
    `${api}/agency/works/${record.workId}/approve`,
    { headers: owner, data: command(record.revision) }
  );
  expect(approve.status(), await approve.text()).toBe(201);
  return { ...record, headers: owner, body };
}
export async function enqueue(
  request: APIRequestContext,
  record: { workId: string; revision: number },
  headers: Record<string, string>
) {
  const result = await request.post(
    `${api}/agency/works/${record.workId}/schedule`,
    { headers, data: command(record.revision) }
  );
  expect(result.status(), await result.text()).toBe(201);
  expect((await result.json()).enqueued).toBe(true);
  return result;
}
