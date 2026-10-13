import { APIRequestContext, expect, APIRequest } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { api, command, draft, staff } from './approval.helpers';
export const origin = 'http://localhost:4200';
export async function mail(
  request: APIRequestContext,
  email: string,
  subject: string
) {
  let value: any;
  await expect
    .poll(async () => {
      const result = await (
        await request.get('http://127.0.0.1:18025/api/v1/messages?limit=100')
      ).json();
      const item = result.messages?.find(
        (m: any) =>
          m.Subject === subject &&
          m.To?.some(
            (to: any) => to.Address.toLowerCase() === email.toLowerCase()
          )
      );
      if (!item) return false;
      value = await (
        await request.get('http://127.0.0.1:18025/api/v1/message/' + item.ID)
      ).json();
      return true;
    })
    .toBe(true);
  return String(value.HTML || value.Text || '');
}
export async function invite(
  request: APIRequestContext,
  extra: Record<string, unknown> = {}
) {
  const headers = await staff(request);
  const email =
    typeof extra.email === 'string'
      ? extra.email
      : 'review-' + randomUUID() + '@client.example.test';
  const response = await request.post(api + '/agency/review-invitations', {
    headers,
    data: {
      clientId: 'fixture-client-a-1',
      name: 'Client Reviewer',
      email,
      ...extra,
    },
  });
  expect(response.status()).toBe(201);
  const record = await response.json();
  const html = await mail(request, email, 'Client review invitation');
  const token = /review#invite=(rvi_[A-Za-z0-9_-]{43})/.exec(html)?.[1];
  if (!token) throw new Error('Invitation link missing from local sink');
  return { ...record, headers, email, token };
}
export async function begin(
  request: APIRequestContext,
  portal: APIRequestContext,
  inv: any
) {
  const r = await portal.post(api + '/agency/review/challenge', {
    data: { token: inv.token },
  });
  expect(r.status()).toBe(201);
  const { challengeId } = await r.json();
  const html = await mail(
    request,
    inv.email,
    'Client review verification code'
  );
  const code = /<strong>(\d{6})<\/strong>/.exec(html)?.[1];
  if (!code) throw new Error('Verification code missing from local sink');
  return { challengeId, code };
}
export async function verified(
  request: APIRequestContext,
  playwright: { request: APIRequest },
  extra: Record<string, unknown> = {}
) {
  const inv = await invite(request, extra);
  const portal = await playwright.request.newContext({
    extraHTTPHeaders: { origin },
  });
  const proof = await begin(request, portal, inv);
  const r = await portal.post(api + '/agency/review/verify', { data: proof });
  expect(r.status(), r.status() === 201 ? '' : await r.text()).toBe(201);
  const profile = await r.json();
  return {
    inv,
    portal,
    proof,
    profile,
    csrf: { 'x-review-csrf': profile.csrf },
  };
}
export async function submitted(
  request: APIRequestContext,
  inv: any,
  body = draft({}, 600000)
) {
  const r = await request.post(api + '/agency/posts', {
    headers: inv.headers,
    data: body,
  });
  expect(r.status()).toBe(201);
  const [work] = await r.json();
  const s = await request.post(`${api}/agency/works/${work.workId}/submit`, {
    headers: inv.headers,
    data: { ...command(), reviewerId: inv.reviewerId },
  });
  expect(s.status(), s.status() === 201 ? '' : await s.text()).toBe(201);
  return { ...work, body };
}
