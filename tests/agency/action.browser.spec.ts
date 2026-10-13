import { test, expect } from '@playwright/test';
import {
  db,
  fixture,
  scheduled,
  receipt,
  closed,
  mutations,
  cleanupActionFixtures,
} from './action.helpers';
test.afterAll(() => db.$disconnect());
test.afterEach(() => cleanupActionFixtures());
for (const mobile of [false, true])
  test(`T04-02/T04-04 ${
    mobile ? '360px keyboard' : 'desktop'
  }: inspect partial results, assign, retry and preserve confirmed publication`, async ({
    page,
    request,
  }) => {
    test.setTimeout(90000);
    if (mobile) await page.setViewportSize({ width: 360, height: 740 });
    const f = await fixture(),
      w = await scheduled(request, f, [{}, { outcome: 'rate-limit-once' }]);
    await receipt(w.records[0].postId, 'CONFIRMED');
    const bad = await receipt(w.records[1].postId, 'FAILED');
    await closed(bad.postId);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/auth/login');
    await page.getByPlaceholder('Email Address').fill('owner-a@example.test');
    await page
      .getByPlaceholder('Password', { exact: true })
      .fill('LocalFixture123!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/agency/);
    await page
      .getByRole('link', { name: 'Action dashboard', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Agency action dashboard' })
    ).toBeVisible();
    await page
      .getByLabel('Client filter', { exact: true })
      .selectOption(f.client.id);
    await page
      .getByLabel('State filter', { exact: true })
      .selectOption('PARTIAL');
    const item = page.locator(`[data-action-id="${w.revisionId}"]`);
    await expect(item).toContainText('1/2 confirmed');
    await item.getByRole('button', { name: 'Inspect revision 1' }).click();
    const detail = page.getByRole('region', { name: 'Action detail' });
    await expect(detail).toContainText(w.body.posts[0].value[0].content);
    await detail
      .getByLabel('Action owner', { exact: true })
      .selectOption('fixture-user-a-owner');
    await detail
      .getByLabel('Operator disposition', { exact: true })
      .selectOption('ACKNOWLEDGED');
    await detail
      .getByLabel('Operator investigation note', { exact: true })
      .fill('<img src=x onerror=alert(1)> confirmed target retained');
    const save = detail.getByRole('button', { name: 'Save operator record' });
    await expect(save).toBeEnabled();
    await save.focus();
    await expect(save).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('status', { name: 'Action status' })
    ).toContainText('receipts are unchanged');
    await expect(
      detail.getByRole('heading', { name: 'Revision 1: partial' })
    ).toBeVisible();
    expect(await detail.locator('img[src="x"]').count()).toBe(0);
    if (mobile)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(361);
    await detail.screenshot({
      path: `docs/agency/evidence/screenshots/phase-4-${
        mobile ? 'mobile' : 'desktop'
      }-partial.png`,
    });
    const retry = detail.getByRole('button', {
      name: 'Retry known-safe failed target',
    });
    await expect(retry).toBeEnabled();
    await retry.focus();
    await expect(retry).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('status', { name: 'Action status' })
    ).toContainText('Queued only');
    await receipt(bad.postId, 'CONFIRMED');
    await page.reload();
    await page.goto('/agency/actions?revision=' + w.revisionId);
    await expect(
      page
        .getByRole('region', { name: 'Action detail' })
        .getByRole('heading', { name: 'Revision 1: published' })
    ).toBeVisible();
    expect(mutations(w.records[0].postId)).toHaveLength(1);
    expect(mutations(w.records[1].postId)).toHaveLength(1);
    expect(errors).toEqual([]);
    await page.getByRole('region', { name: 'Action detail' }).screenshot({
      path: `docs/agency/evidence/screenshots/phase-4-${
        mobile ? 'mobile' : 'desktop'
      }-published.png`,
    });
  });

test('T04-03 browser: unknown result requires checking evidence and never offers resend', async ({
  page,
  request,
}) => {
  const f = await fixture(),
    w = await scheduled(request, f, [{ outcome: 'uncertain' }]);
  await receipt(w.postId, 'UNKNOWN');
  await page.goto('/auth/login');
  await page.getByPlaceholder('Email Address').fill('owner-a@example.test');
  await page
    .getByPlaceholder('Password', { exact: true })
    .fill('LocalFixture123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/agency/);
  await page.goto('/agency/actions?revision=' + w.revisionId);
  const detail = page.getByRole('region', { name: 'Action detail' });
  await expect(
    detail.getByRole('heading', { name: 'Revision 1: unknown' })
  ).toBeVisible();
  await expect(
    detail.getByRole('button', { name: 'Retry known-safe failed target' })
  ).toHaveCount(0);
  await expect(detail).toContainText('Do not resend');
  await detail.getByRole('button', { name: 'Check existing receipt' }).click();
  await expect(
    page.getByRole('status', { name: 'Action status' })
  ).toContainText('confirmed');
  await expect(
    detail.getByRole('heading', { name: 'Revision 1: published' })
  ).toBeVisible();
  expect(mutations(w.postId)).toHaveLength(1);
});

test('T04-03 browser: a later processing check obtains fresh evidence without resending', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const f = await fixture(),
    w = await scheduled(request, f, [
      { outcome: 'pending', processingMs: 15000 },
    ]);
  await receipt(w.postId, 'PENDING');
  await page.goto('/auth/login');
  await page.getByPlaceholder('Email Address').fill('owner-a@example.test');
  await page
    .getByPlaceholder('Password', { exact: true })
    .fill('LocalFixture123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/agency/);
  await page.goto('/agency/actions?revision=' + w.revisionId);
  const region = page.getByRole('region', { name: 'Action detail' });
  await expect(
    region.getByRole('heading', { name: 'Revision 1: processing' })
  ).toBeVisible();
  const operations: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/reconcile') && r.method() === 'POST')
      operations.push(r.postDataJSON().operationId);
  });
  await region.getByRole('button', { name: 'Check existing receipt' }).click();
  await expect(
    page.getByRole('status', { name: 'Action status' })
  ).toContainText('processing');
  const acceptedAt = +new Date(mutations(w.postId)[0].time);
  await expect
    .poll(() => Date.now(), { timeout: 20000 })
    .toBeGreaterThan(acceptedAt + 15000);
  const check = region.getByRole('button', { name: 'Check existing receipt' });
  await expect(check).toBeEnabled();
  await check.click();
  await expect(
    region.getByRole('heading', { name: 'Revision 1: published' })
  ).toBeVisible();
  expect(operations).toHaveLength(2);
  expect(operations[0]).not.toBe(operations[1]);
  expect(mutations(w.postId)).toHaveLength(1);
});
