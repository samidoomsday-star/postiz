/** Real production browser page usability after login; local synthetic only. */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
if (
  process.env.AGENCY_TEST_MODE !== 'true' ||
  process.env.AGENCY_TEST_ACK !== 'LOCAL_SYNTHETIC_ONLY'
)
  throw Error('Synthetic mode required');
const login = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: 'LOCAL',
    email: 'performance-0@example.test',
    password: 'LocalFixture123!',
  }),
});
if (login.status !== 200) throw Error('Login failed');
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
});
try {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  await context.addCookies([
    {
      name: 'auth',
      value: login.headers.get('auth'),
      url: 'http://localhost:4200',
      httpOnly: false,
      sameSite: 'Strict',
    },
    {
      name: 'showorg',
      value: 'fixture-performance-agency',
      url: 'http://localhost:4200',
      sameSite: 'Strict',
    },
  ]);
  const page = await context.newPage(),
    samples = [],
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await page.goto('http://localhost:4200/agency/actions', {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('[data-action-id]').first().waitFor();
    await page
      .getByLabel('Client filter', { exact: true })
      .selectOption('fixture-performance-client-0');
    await page
      .getByText('200 matching revisions · Page 1', { exact: true })
      .waitFor();
    samples.push(performance.now() - start);
  }
  const result = {
    date: new Date().toISOString(),
    navigation:
      'authenticated full navigation through usable client filter and loaded scoped results',
    samplesMs: samples,
    maxMs: Math.max(...samples),
    thresholdMs: 3000,
    errors,
    passed: Math.max(...samples) <= 3000 && errors.length === 0,
  };
  writeFileSync(
    '.agency/results/performance-page.json',
    JSON.stringify(result, null, 2) + '\n'
  );
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
} finally {
  await browser.close();
}
