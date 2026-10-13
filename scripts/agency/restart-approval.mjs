import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const url = new URL(process.env.DATABASE_URL);
if (
  process.env.AGENCY_TEST_MODE !== 'true' ||
  process.env.AGENCY_TEST_ACK !== 'LOCAL_SYNTHETIC_ONLY' ||
  url.pathname !== '/postiz_agency_test' ||
  !['localhost', '127.0.0.1'].includes(url.hostname)
)
  throw new Error('Restart test refuses customer settings');
const db = new PrismaClient();
const api = 'http://localhost:3000';
async function call(path, body, headers = {}) {
  const response = await fetch(api + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error('Restart test HTTP ' + response.status + ' at ' + path);
  return { value: await response.json(), headers: response.headers };
}
try {
  const login = await call('/auth/login', {
    provider: 'LOCAL',
    email: 'owner-a@example.test',
    password: 'LocalFixture123!',
  });
  const headers = {
    auth: login.headers.get('auth'),
    showorg: 'fixture-agency-a',
  };
  const input = {
    type: 'draft',
    date: new Date(Date.now() + 20000).toISOString(),
    shortLink: false,
    tags: [],
    posts: [
      {
        integration: { id: 'fixture-channel-a-1' },
        settings: { __type: 'synthetic' },
        value: [
          { content: 'Synthetic worker restart ' + randomUUID(), image: [] },
        ],
      },
    ],
  };
  const {
    value: [r],
  } = await call('/agency/posts', input, headers);
  const command = () => ({ expectedRevision: 1, operationId: randomUUID() });
  await call(
    `/agency/works/${r.workId}/submit`,
    { ...command(), reviewerId: 'fixture-user-a-owner' },
    headers
  );
  await call(`/agency/works/${r.workId}/approve`, command(), headers);
  await call(`/agency/works/${r.workId}/schedule`, command(), headers);
  for (const action of ['stop', 'start']) {
    const result = spawnSync('python3', ['scripts/agency/runtime.py', action], {
      env: process.env,
      encoding: 'utf8',
    });
    if (result.status !== 0)
      throw new Error('Owned app restart failed: ' + result.stderr);
  }
  const deadline = Date.now() + 45000;
  let receipt;
  while (Date.now() < deadline) {
    receipt = await db.agencyDispatch.findFirst({
      where: { postId: r.postId, stage: 'publish' },
    });
    if (receipt?.state === 'CONFIRMED') break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (receipt?.state !== 'CONFIRMED')
    throw new Error('Restarted worker did not confirm approved revision');
  const calls = readFileSync(process.env.AGENCY_PROVIDER_LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((x) => JSON.parse(x))
    .filter((x) => x.localId === r.postId && x.operation === 'accepted');
  if (calls.length !== 1)
    throw new Error('Restart duplicated or lost provider mutation');
  console.log(
    'PASS: approved persisted queue survived owned app/worker restart and produced exactly one confirmed synthetic mutation.'
  );
} finally {
  await db.$disconnect();
}
