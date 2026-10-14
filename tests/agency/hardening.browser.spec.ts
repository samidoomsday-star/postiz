import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { verified, submitted } from './review.helpers';
import { draft } from './approval.helpers';
const db = new PrismaClient();
test.afterAll(() => db.$disconnect());
test('T05-06: DST repeated local hour shows distinct UTC offsets and approves the exact Unicode revision', async ({
  request,
  playwright,
  page,
}) => {
  const v = await verified(request, playwright);
  try {
    const works = [];
    // Next year's first Sunday in November keeps the fixture in the future.
    const year = new Date().getUTCFullYear() + 1;
    const day = 1 + ((7 - new Date(Date.UTC(year, 10, 1)).getUTCDay()) % 7);
    const instants = [5, 6].map((hour) =>
      new Date(Date.UTC(year, 10, day, hour, 30)).toISOString()
    );
    const week = new Date(Date.UTC(year, 10, day - 6))
      .toISOString()
      .slice(0, 10);
    for (const utc of instants) {
      const body = draft({}, 600000);
      body.date = utc;
      body.displayTimezone = 'America/New_York';
      body.posts[0].value[0].content = 'ঢাকা DST review ' + utc;
      works.push(await submitted(request, v.inv, body));
    }
    await page.context().addCookies((await v.portal.storageState()).cookies);
    await page.goto('/review');
    await page.getByLabel('Week begins (UTC)').fill(week);
    for (const [index, offset] of ['GMT-4', 'GMT-5'].entries()) {
      const card = page.locator(`[data-review-work="${works[index].workId}"]`);
      await expect(card).toContainText('ঢাকা DST review');
      await expect(card).toContainText('America/New_York');
      await expect(card.locator('time')).toContainText('01:30');
      await expect(card.locator('time')).toContainText(offset);
      await expect(card.locator('time')).toHaveAttribute(
        'datetime',
        instants[index]
      );
    }
    const first = page.locator(`[data-review-work="${works[0].workId}"]`);
    await first
      .getByRole('button', { name: 'Approve this revision', exact: true })
      .click();
    await expect(
      page.getByRole('status', { name: 'Review status' })
    ).toContainText('Revision approved');
    const revision = await db.agencyRevision.findUniqueOrThrow({
        where: { id: works[0].revisionId },
      }),
      decision = await db.agencyReviewDecision.findFirstOrThrow({
        where: { revisionId: revision.id },
      });
    expect(decision.payloadHash).toBe(revision.payloadHash);
    expect((revision.payload as any).targets[0].publishAt).toBe(
      instants[0]
    );
  } finally {
    await v.portal.dispose();
  }
});
