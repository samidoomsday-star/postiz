import { readFileSync } from 'node:fs';
import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('Email Address').fill('owner-a@example.test');
  await page.getByPlaceholder('Password', { exact: true }).fill('LocalFixture123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/agency/);
}

test('T00-02: actual browser login loads the client workspace and client channels', async ({ page }) => {
  await login(page);
  await expect(page.getByLabel('Client channels').getByText('Synthetic channel a1', { exact: true })).toBeVisible();
  await page.getByLabel('Active client', { exact: true }).selectOption('fixture-client-a-2');
  await expect(page.getByLabel('Client channels').getByText('Synthetic channel a2', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic channel b1', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeVisible();
});

test('T00-02: an API-persisted draft appears in the real browser workspace', async ({ page, request }) => {
  const content = `Agency browser draft ${randomUUID()}`;
  const created = await request.post('http://localhost:3000/agency/posts', {
    headers: { authorization: JSON.parse(readFileSync('.agency/fixture-access.json', 'utf8')).a },
    data: {
      type: 'draft', shortLink: false, tags: [], date: new Date().toISOString(),
      posts: [{ integration: { id: 'fixture-channel-a-1' }, settings: { __type: 'synthetic' }, value: [{ content, image: [] }] }],
    },
  });
  expect(created.status()).toBe(201);
  const [{ postId }] = await created.json();
  const calendarResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/agency/clients/fixture-client-a-1/posts' && response.status() === 200);
  await login(page);
  expect(JSON.stringify(await (await calendarResponse).json())).toContain(postId);
  await expect(page.getByText(content, { exact: false }).first()).toBeVisible();
});

test.describe('mobile entry point', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('T00-02: mobile login reaches the real authenticated workspace', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeVisible();
    expect(await page.evaluate(() => Boolean(document.cookie.includes('auth=')))).toBe(true);
  });
});
