import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// This automatic adoption is only for our known synthetic db-push database.
// Customer installations follow MIGRATIONS.md, including backup and drift review.
const url = new URL(process.env.DATABASE_URL || '');
if (
  process.env.AGENCY_TEST_MODE !== 'true' ||
  process.env.AGENCY_TEST_ACK !== 'LOCAL_SYNTHETIC_ONLY' ||
  url.pathname !== '/postiz_agency_test' ||
  !['localhost', '127.0.0.1'].includes(url.hostname)
) {
  throw new Error('Automatic migration adoption refuses a customer database');
}
const schema = 'libraries/nestjs-libraries/src/database/prisma/schema.prisma';
const db = new PrismaClient();
const run = (args, capture = false) => {
  const r = spawnSync('pnpm', ['exec', 'prisma', ...args], {
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (r.status !== 0)
    throw new Error('Prisma migration command failed; inspect private logs');
  return r.stdout;
};
try {
  const tables =
    await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
  const names = tables.map((t) => t.tablename);
  if (names.includes('Organization') && !names.includes('_prisma_migrations')) {
    // Compare only inherited models, preserving independently owned Mastra tables.
    const baseline = '.agency/migration-baseline.prisma';
    const { writeFileSync } = await import('node:fs');
    // Baseline schema is retained as a reviewed companion to baseline SQL.
    writeFileSync(
      baseline,
      readFileSync('docs/agency/evidence/upstream-schema.prisma', 'utf8'),
      { mode: 0o600 }
    );
    const diff = run(
      [
        'migrate',
        'diff',
        '--from-schema-datamodel',
        baseline,
        '--to-schema-datasource',
        baseline,
        '--script',
      ],
      true
    );
    // Extra Mastra tables are reviewed once. Any change to an inherited model blocks adoption.
    const inherited = [
      ...readFileSync(baseline, 'utf8').matchAll(/^model (\w+) /gm),
    ].map((m) => m[1]);
    if (inherited.some((name) => diff.includes(`"${name}"`)))
      throw new Error(
        'Inherited database schema drift: do not adopt automatically'
      );
    run([
      'migrate',
      'resolve',
      '--schema',
      schema,
      '--applied',
      '20261013000000_upstream_baseline',
    ]);
  }
  run(['migrate', 'deploy', '--schema', schema]);
} finally {
  await db.$disconnect();
}
