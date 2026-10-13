import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('Email Address').fill('owner-a@example.test');
  await page.getByPlaceholder('Password', { exact: true }).fill('LocalFixture123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/launches/);
}

test('T00-02: actual browser login loads the agency calendar and client channels', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Synthetic channel a1', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic channel a2', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic channel b1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Create Post', { exact: true }).first()).toBeVisible();
});

test('T00-02: an API-persisted draft appears in the real browser calendar', async ({ page, request }) => {
  const content = `Agency browser draft ${randomUUID()}`;
  const created = await request.post('http://localhost:3000/public/v1/posts', {
    headers: { authorization: 'synthetic-api-a' },
    data: {
      type: 'draft', shortLink: false, tags: [], date: new Date().toISOString(),
      posts: [{ integration: { id: 'fixture-channel-a-1' }, settings: { __type: 'synthetic' }, value: [{ content, image: [] }] }],
    },
  });
  expect(created.status()).toBe(201);
  const [{ postId }] = await created.json();
  const calendarResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/posts' && response.status() === 200);
  await login(page);
  expect(JSON.stringify(await (await calendarResponse).json())).toContain(postId);
  // The inherited calendar initially shows three items per hour. Exercise its
  // actual expansion control so repeated runs with preserved data remain valid.
  const expand = page.getByText(/^\+ Show more \(/);
  const collapsedCells = await expand.count();
  for (let i = 0; i < collapsedCells; i++) {
    await expand.first().click();
  }
  await expect(page.getByText(content, { exact: false }).first()).toBeVisible();
});

test.describe('mobile entry point', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('T00-02: mobile login reaches the real authenticated calendar', async ({ page }) => {
    await login(page);
    await expect(page.getByText('Create Post', { exact: true }).last()).toBeVisible();
    expect(await page.evaluate(() => Boolean(document.cookie.includes('auth=')))).toBe(true);
  });
});
