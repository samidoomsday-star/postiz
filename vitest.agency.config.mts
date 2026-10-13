import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      '@gitroom/helpers': root + 'libraries/helpers/src',
      '@gitroom/nestjs-libraries': root + 'libraries/nestjs-libraries/src',
      '@gitroom/backend': root + 'apps/backend/src',
      '@gitroom/orchestrator': root + 'apps/orchestrator/src',
    },
  },
  test: {
    include: ['tests/agency/**/*.unit.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 2,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    passWithNoTests: false,
    reporters: ['default', 'json'],
    outputFile: { json: '.agency/results/unit-results.json' },
  },
});
