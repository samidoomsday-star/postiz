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
  const rows = [];
  const selectedHistories = [];
  const selectedIds = new Set();
  let unexecuted = 0;
  async function select(row) {
    if (selectedIds.has(row.id)) return false;
    const workflowId =
      row.attempt > 0
        ? `agency-retry_${row.id}_${row.attempt}`
        : 'post_' + row.postId;
    let history;
    try {
      history = await client.workflow.getHandle(workflowId).fetchHistory();
    } catch (error) {
      // Negative fixtures can have receipt rows without ever executing a job.
      // Only NOT_FOUND excludes a candidate; all other failures remain gates.
      if (error.code === 5 || error.name === 'WorkflowNotFoundError') {
        unexecuted++;
        return false;
      }
      throw error;
    }
    if (!history.events?.length)
      throw new Error('Selected workflow has no events');
    selectedIds.add(row.id);
    rows.push(row);
    selectedHistories.push({ workflowId, history });
    return true;
  }
  for (const state of ['UNKNOWN', 'PENDING', 'FAILED', 'CONFIRMED']) {
    const candidates = await db.agencyDispatch.findMany({
      where: { stage: 'publish', part: 0, state },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    let found = false;
    for (const row of candidates)
      if (await select(row)) {
        found = true;
        break;
      }
    if (!found)
      throw new Error(
        'No executed history for required dispatch state ' + state
      );
  }
  const latest = await db.agencyDispatch.findMany({
    where: {
      stage: 'publish',
      part: 0,
      state: { in: ['CONFIRMED', 'UNKNOWN', 'FAILED', 'PENDING'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  for (const row of latest) {
    if (rows.length >= 6) break;
    await select(row);
  }
  if (rows.length !== 6) throw new Error('Six executed histories required');
  let count = 0;
  async function* histories() {
    for (const selected of selectedHistories) yield selected;
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
      ') replayed with unchanged workflow code; replay executes no activities. Excluded ' +
      unexecuted +
      ' unexecuted receipt candidates; retry histories use their attempt execution IDs.'
  );
} finally {
  await connection.close();
  await db.$disconnect();
}
