import { Client, Connection } from '@temporalio/client';
import { Worker } from '@temporalio/worker';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
if (
  process.env.AGENCY_TEST_MODE !== 'true' ||
  process.env.AGENCY_TEST_ACK !== 'LOCAL_SYNTHETIC_ONLY' ||
  new URL(process.env.DATABASE_URL).pathname !== '/postiz_agency_test'
)
  throw new Error('Replay refuses customer settings');
const db = new PrismaClient();
const connection = await Connection.connect({
  address: process.env.TEMPORAL_ADDRESS,
});
try {
  const client = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE,
  });
  const samples = [];
  for (const state of ['UNKNOWN', 'PENDING', 'FAILED', 'CONFIRMED']) {
    const row = await db.agencyDispatch.findFirst({
      where: { stage: 'publish', part: 0, state },
      orderBy: { createdAt: 'desc' },
    });
    if (row) samples.push(row);
  }
  const latest = await db.agencyDispatch.findMany({
    where: {
      stage: 'publish',
      part: 0,
      state: { in: ['CONFIRMED', 'UNKNOWN', 'FAILED', 'PENDING'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 6,
  });
  const rows = [
    ...new Map([...samples, ...latest].map((row) => [row.id, row])).values(),
  ].slice(0, 6);
  if (!rows.length) throw new Error('No executed histories available');
  let count = 0;
  async function* histories() {
    for (const row of rows) {
      const workflowId = 'post_' + row.postId;
      yield {
        workflowId,
        history: await client.workflow.getHandle(workflowId).fetchHistory(),
      };
    }
  }
  for await (const result of Worker.runReplayHistories(
    {
      workflowsPath: resolve(
        'apps/orchestrator/dist/apps/orchestrator/src/workflows/index.js'
      ),
      bundlerOptions: {
        webpackConfigHook: (config) => {
          config.resolve.alias = {
            ...config.resolve.alias,
            '@gitroom/helpers': resolve(
              'apps/orchestrator/dist/libraries/helpers/src'
            ),
            '@gitroom/nestjs-libraries': resolve(
              'apps/orchestrator/dist/libraries/nestjs-libraries/src'
            ),
            '@gitroom/orchestrator': resolve(
              'apps/orchestrator/dist/apps/orchestrator/src'
            ),
          };
          return config;
        },
      },
    },
    histories()
  )) {
    if (result.error) throw result.error;
    count++;
  }
  console.log(
    'PASS: ' +
      count +
      ' persisted Temporal histories (' +
      [...new Set(rows.map((row) => row.state))].join(', ') +
      ') replayed with unchanged workflow code; replay executes no activities.'
  );
} finally {
  await connection.close();
  await db.$disconnect();
}
