import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mail } from './review.helpers';
async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('Email Address').fill('owner-a@example.test');
  await page
    .getByPlaceholder('Password', { exact: true })
    .fill('LocalFixture123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/agency/);
  await expect(
    page.getByLabel('Client channels').getByText('Synthetic channel a1')
  ).toBeVisible();
}
for (const mobile of [false, true])
  test(`T03-04 ${
    mobile ? '360px keyboard' : 'desktop'
  }: staff invites, client requests changes, fresh revision is approved and scheduled`, async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(120000);
    if (mobile) await page.setViewportSize({ width: 360, height: 740 });
    await login(page);
    const email = 'browser-review-' + randomUUID() + '@client.example.test',
      content = 'ঢাকা review journey ' + randomUUID();
    const section = page.getByLabel('Client review invitations');
    await section
      .getByLabel('Reviewer name', { exact: true })
      .fill('Browser Client');
    await section.getByLabel('Reviewer email', { exact: true }).fill(email);
    const inviteResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith('/agency/review-invitations') &&
        r.request().method() === 'POST'
    );
    await section
      .getByRole('button', { name: 'Send review invitation' })
      .click();
    const invite = await (await inviteResponse).json();
    expect(invite.reviewerId).toBeTruthy();
    await page.getByLabel('Draft content', { exact: true }).fill(content);
    const saveResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith('/agency/posts') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    const [work] = await (await saveResponse).json();
    let card = page.locator(`[data-work-id="${work.workId}"]`);
    await card
      .getByLabel('Designated reviewer')
      .selectOption(invite.reviewerId);
    await card
      .getByRole('button', { name: 'Request review', exact: true })
      .click();
    await expect(card.getByRole('heading').first()).toContainText('IN_REVIEW');
    const html = await mail(request, email, 'Client review invitation'),
      token = /review#invite=(rvi_[A-Za-z0-9_-]{43})/.exec(html)?.[1];
    if (!token) throw new Error('Local invitation missing');
    const ctx = await browser.newContext({
        viewport: mobile
          ? { width: 360, height: 740 }
          : { width: 1280, height: 900 },
      }),
      review = await ctx.newPage();
    try {
      const errors: string[] = [];
      review.on('pageerror', (e) => errors.push(e.message));
      await review.goto('http://localhost:4200/review#invite=' + token);
      await expect(review).toHaveURL('http://localhost:4200/review');
      const send = review.getByRole('button', {
        name: 'Send verification code',
      });
      if (mobile) {
        await send.focus();
        await review.keyboard.press('Enter');
      } else await send.click();
      await expect(
        review.getByRole('status', { name: 'Review status' })
      ).toContainText('verification code was sent');
      const codeHtml = await mail(
          request,
          email,
          'Client review verification code'
        ),
        code = /<strong>(\d{6})<\/strong>/.exec(codeHtml)?.[1];
      if (!code) throw new Error('Local verification missing');
      await review.getByLabel('Email verification code').fill(code);
      await review
        .getByRole('button', { name: 'Verify email', exact: true })
        .click();
      let clientCard = review.locator(`[data-review-work="${work.workId}"]`);
      await expect(clientCard).toContainText(content);
      await expect(clientCard).toContainText('Asia/Dhaka');
      await expect(clientCard).toContainText('synthetic-a-1');
      if (mobile)
        expect(
          await review.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        ).toBe(true);
      await clientCard
        .getByLabel('Feedback (visible to your agency)')
        .fill('<img src=x onerror="window.reviewXss=1"> Public feedback');
      await clientCard
        .getByRole('button', { name: 'Add feedback', exact: true })
        .click();
      await expect(clientCard.getByLabel('Review feedback')).toContainText(
        '<img src=x'
      );
      expect(
        await review.evaluate(() => Boolean((window as any).reviewXss))
      ).toBe(false);
      await clientCard
        .getByLabel('Requested changes', { exact: true })
        .fill('Make the draft more specific');
      const changes = clientCard.getByRole('button', {
        name: 'Request changes',
        exact: true,
      });
      if (mobile) {
        await expect(changes).toBeEnabled();
        await changes.focus();
        await expect(changes).toBeFocused();
        await review.keyboard.press('Enter');
      } else await changes.click();
      await expect(clientCard.getByRole('heading').first()).toContainText(
        'CHANGES REQUESTED'
      );
      await page.reload();
      card = page.locator(`[data-work-id="${work.workId}"]`);
      await card.getByRole('button', { name: 'Show review feedback' }).click();
      await expect(card).toContainText('Make the draft more specific');
      await card.getByRole('button', { name: 'Edit as new revision' }).click();
      await page
        .getByLabel('Draft content', { exact: true })
        .fill(content + ' revised');
      await page
        .getByRole('button', { name: 'Save new revision', exact: true })
        .click();
      await expect(card.getByRole('heading').first()).toContainText(
        'Revision 2'
      );
      await card
        .getByLabel('Designated reviewer')
        .selectOption(invite.reviewerId);
      await card
        .getByRole('button', { name: 'Request review', exact: true })
        .click();
      await expect(card.getByRole('heading').first()).toContainText(
        'IN_REVIEW'
      );
      await review.getByRole('button', { name: 'Reload reviews' }).click();
      clientCard = review.locator(`[data-review-work="${work.workId}"]`);
      await expect(clientCard.getByRole('heading').first()).toContainText(
        'Revision 2'
      );
      await expect(clientCard).toContainText(content + ' revised');
      await expect(clientCard.getByLabel('Review feedback')).toContainText(
        'Make the draft more specific'
      );
      const approve = clientCard.getByRole('button', {
        name: 'Approve this revision',
      });
      await expect(approve).toBeEnabled();
      await approve.focus();
      await expect(approve).toBeFocused();
      await review.keyboard.press('Enter');
      await expect(clientCard.getByRole('heading').first()).toContainText(
        'APPROVED'
      );
      await expect(
        review.getByRole('status', { name: 'Review status' })
      ).toContainText('must schedule it separately');
      await page.reload();
      card = page.locator(`[data-work-id="${work.workId}"]`);
      const schedule = card.getByRole('button', {
        name: 'Schedule approved revision',
      });
      await expect(schedule).toBeEnabled();
      await schedule.focus();
      await expect(schedule).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(card.getByRole('heading').first()).toContainText(
        'SCHEDULED'
      );
      await card.getByRole('button', { name: 'Cancel queued work' }).click();
      await expect(card.getByRole('heading').first()).toContainText('CANCELED');
      expect(errors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
