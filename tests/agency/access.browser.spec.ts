import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('Email Address').fill(email);
  await page
    .getByPlaceholder('Password', { exact: true })
    .fill('LocalFixture123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/agency/);
  await expect(page.getByLabel('Active client', { exact: true })).toBeVisible();
}
test('T01-01 browser: editor sees only assigned client and saves a real draft', async ({
  page,
}) => {
  await login(page, 'editor-a@example.test');
  const clients = page
    .getByLabel('Active client', { exact: true })
    .locator('option');
  await expect(clients).toHaveText(['Choose client', 'Synthetic Client a1']);
  await expect(
    page.getByRole('heading', { name: 'Client access', exact: true })
  ).toHaveCount(0);
  const content = `Scoped browser content ${randomUUID()}`;
  await page.getByLabel('Draft content', { exact: true }).fill(content);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status', { name: 'Workspace status' })).toContainText('Saved');
  await expect(
    page.getByLabel('Client posts').getByText(content, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Synthetic Client b1', { exact: true })
  ).toHaveCount(0);
});
test('T01-02 browser: admin creates a draft-only credential, dismisses its secret, and revokes it', async ({
  page,
}) => {
  await login(page, 'owner-a@example.test');
  const section = page.locator('section', {
    has: page.getByRole('heading', { name: 'Scoped automation credentials' }),
  });
  const name = `Browser key ${randomUUID()}`;
  await section.getByLabel('Credential name', { exact: true }).fill(name);
  await section
    .getByRole('button', { name: 'Create credential', exact: true })
    .click();
  await expect(
    page.getByLabel('Credential secret', { exact: true })
  ).toContainText('agk_');
  await page.getByRole('button', { name: 'Dismiss secret' }).click();
  await expect(
    page.getByLabel('Credential secret', { exact: true })
  ).toHaveCount(0);
  const row = section.locator('li').filter({ hasText: name });
  await expect(row).toContainText('draft:write');
  await expect(row).not.toContainText('publish:schedule');
  await row
    .getByRole('button', { name: 'Revoke credential', exact: true })
    .click();
  await expect(row).toContainText('revoked');
  await page.reload();
  await expect(
    page.getByLabel('Credential secret', { exact: true })
  ).toHaveCount(0);
});
test.describe('mobile scoped workspace', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('T01-01 mobile: client content and draft controls fit the viewport', async ({
    page,
  }) => {
    await login(page, 'editor-a@example.test');
    await expect(
      page.getByRole('button', { name: 'Save draft' })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.getByLabel('Draft content', { exact: true }).focus();
    await expect(
      page.getByLabel('Draft content', { exact: true })
    ).toBeFocused();
  });
});
