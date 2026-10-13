import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { api, draft, staff } from './approval.helpers';
test('T02-02 browser: retained editor/calendar sends changes for internal review and schedules only that revision', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const owner = await staff(request);
  const saved = await request.post(api + '/agency/posts', {
    headers: owner,
    data: draft({}, 600000),
  });
  expect(saved.status()).toBe(201);
  const [record] = await saved.json();
  await page.goto('/auth/login');
  await page.getByPlaceholder('Email Address').fill('owner-a@example.test');
  await page
    .getByPlaceholder('Password', { exact: true })
    .fill('LocalFixture123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/agency/);
  let card = page.locator(`[data-work-id="${record.workId}"]`);
  await card.getByRole('button', { name: 'Edit as new revision' }).click();
  const content = 'Browser final copy ' + randomUUID();
  await page.getByLabel('Draft content', { exact: true }).fill(content);
  await page.getByRole('button', { name: 'Save new revision' }).click();
  await expect(card.getByRole('heading')).toContainText('Revision 2');
  await expect(card).toContainText(content);
  await expect(
    page
      .getByLabel('Client approval calendar')
      .getByRole('button', { name: 'DRAFT · ' + content, exact: true })
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: 'Schedule approved revision' })
  ).toHaveCount(0);
  await card
    .getByLabel('Designated reviewer')
    .selectOption('fixture-user-a-owner');
  await card
    .getByRole('button', { name: 'Request review', exact: true })
    .click();
  await expect(card).toContainText('IN_REVIEW');
  await card.getByLabel('Requested changes').fill('Make copy more specific');
  await card
    .getByRole('button', { name: 'Request changes', exact: true })
    .click();
  await expect(card).toContainText('CHANGES_REQUESTED');
  await card.getByRole('button', { name: 'Edit as new revision' }).click();
  await page
    .getByLabel('Draft content', { exact: true })
    .fill(content + ' revised');
  await page.getByRole('button', { name: 'Save new revision' }).click();
  await expect(card.getByRole('heading')).toContainText('Revision 3');
  await card
    .getByLabel('Designated reviewer')
    .selectOption('fixture-user-a-owner');
  await card
    .getByRole('button', { name: 'Request review', exact: true })
    .click();
  await card.getByRole('button', { name: 'Approve this revision' }).click();
  await expect(card).toContainText('APPROVED');
  await card
    .getByRole('button', { name: 'Schedule approved revision' })
    .click();
  await expect(card.getByRole('heading')).toContainText('SCHEDULED');
  await card.getByRole('button', { name: 'Cancel queued work' }).click();
  await expect(card.getByRole('heading')).toContainText('CANCELED');
});
