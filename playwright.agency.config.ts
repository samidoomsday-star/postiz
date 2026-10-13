import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

if (process.env.AGENCY_TEST_MODE !== 'true' || process.env.AGENCY_TEST_ACK !== 'LOCAL_SYNTHETIC_ONLY') {
  throw new Error('Run agency integration/browser tests through scripts/agency/with-env.sh');
}
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export default defineConfig({
  testDir: './tests/agency',
  timeout: 45000,
  expect: { timeout: 20000 },
  workers: 1,
  retries: 0,
  fullyParallel: false,
  outputDir: '.agency/results/browser-artifacts',
  reporter: [['list'], ['json', { outputFile: '.agency/results/integration-results.json' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(executable ? { launchOptions: { executablePath: executable } } : {}),
  },
  projects: [
    { name: 'api', testMatch: '**/*.api.spec.ts' },
    { name: 'chromium', testMatch: '**/*.browser.spec.ts', use: { ...devices['Desktop Chrome'] } },
  ],
});
