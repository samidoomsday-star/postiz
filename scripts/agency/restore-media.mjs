/** T05-03: actual DB dump/restore plus original/snapshot byte recovery, guarded binary. */
import { request } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const url = new URL(process.env.DATABASE_URL || '');
if (
  process.env.AGENCY_TEST_MODE !== 'true' ||
  process.env.AGENCY_TEST_ACK !== 'LOCAL_SYNTHETIC_ONLY' ||
  url.pathname !== '/postiz_agency_test' ||
  !['localhost', '127.0.0.1'].includes(url.hostname)
)
  throw Error('Disposable local synthetic restore only');
const db = new PrismaClient(),
  http = await request.newContext(),
  temp = mkdtempSync(resolve('.agency/restore-'));
const owned =
  'agency_migration_fixture_media_' +
  randomUUID().replaceAll('-', '').slice(0, 12);
const docker = [
  'compose',
  '-f',
  'compose.agency.yaml',
  'exec',
  '-T',
  'postgres',
];
const run = (args, input) =>
  execFileSync('docker', [...docker, ...args], {
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 128 * 1024 * 1024,
  });
let created = false,
  restored;
const previousUploads = process.env.UPLOAD_DIRECTORY;
try {
  const login = await http.post('http://localhost:3000/auth/login', {
    data: {
      provider: 'LOCAL',
      email: 'owner-a@example.test',
      password: 'LocalFixture123!',
    },
  });
  if (login.status() !== 200) throw Error('Login failed');
  const headers = { auth: login.headers().auth, showorg: 'fixture-agency-a' };
  const uploaded = await http.post(
    'http://localhost:3000/agency/clients/fixture-client-a-1/media',
    {
      headers,
      multipart: {
        file: {
          name: 'restore.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=',
            'base64'
          ),
        },
        alt: 'Synthetic restore bytes',
      },
    }
  );
  if (uploaded.status() !== 201) throw Error('Upload failed');
  const media = await uploaded.json();
  const saved = await http.post('http://localhost:3000/agency/posts', {
    headers,
    data: {
      type: 'draft',
      shortLink: false,
      tags: [],
      displayTimezone: 'Asia/Dhaka',
      date: new Date(Date.now() + 600000).toISOString(),
      posts: [
        {
          integration: { id: 'fixture-channel-a-1' },
          settings: { __type: 'synthetic' },
          value: [{ content: 'Synthetic restore fixture', image: [media] }],
        },
      ],
    },
  });
  if (saved.status() !== 201) throw Error('Snapshot creation failed');
  const [work] = await saved.json();
  const snapshot = await db.agencyMediaSnapshot.findFirstOrThrow({
    where: { revisionId: work.revisionId },
  });
  const source = await db.media.findUniqueOrThrow({ where: { id: media.id } });
  const sourceRelative = decodeURIComponent(
    new URL(source.path).pathname.slice('/uploads/'.length)
  );
  const backup = join(temp, 'backup'),
    recovery = join(temp, 'restored');
  mkdirSync(join(backup, '.agency-revisions'), { recursive: true });
  mkdirSync(join(backup, sourceRelative, '..'), { recursive: true });
  cpSync(join(previousUploads, sourceRelative), join(backup, sourceRelative));
  cpSync(
    join(previousUploads, '.agency-revisions', snapshot.fileName),
    join(backup, '.agency-revisions', snapshot.fileName)
  );
  const dump = run([
    'pg_dump',
    '-U',
    'postiz_agency',
    '-d',
    'postiz_agency_test',
    '-Fc',
  ]);
  run(['createdb', '-U', 'postiz_agency', owned]);
  created = true;
  run(
    ['pg_restore', '-U', 'postiz_agency', '-d', owned, '--exit-on-error'],
    dump
  );
  cpSync(backup, recovery, { recursive: true });
  process.env.UPLOAD_DIRECTORY = recovery;
  const restoreUrl = new URL(url);
  restoreUrl.pathname = '/' + owned;
  restored = new PrismaClient({
    datasources: { db: { url: restoreUrl.toString() } },
  });
  const require = createRequire(import.meta.url),
    root = resolve('apps/backend/dist/libraries/nestjs-libraries/src');
  const { ApprovalService } = require(join(root, 'agency/approval.service.js'));
  const { AgencyService } = require(join(root, 'agency/agency.service.js'));
  const service = new ApprovalService(
    restored,
    new AgencyService(restored),
    null,
    null,
    null
  );
  await service.verifyMedia(work.revisionId);
  const original = readFileSync(
    join(recovery, '.agency-revisions', snapshot.fileName)
  );
  rmSync(join(recovery, '.agency-revisions', snapshot.fileName));
  let missingDenied = false;
  try {
    await service.verifyMedia(work.revisionId);
  } catch {
    missingDenied = true;
  }
  if (!missingDenied) throw Error('Missing snapshot accepted');
  writeFileSync(
    join(recovery, '.agency-revisions', snapshot.fileName),
    Buffer.from('tampered fixture')
  );
  let tamperDenied = false;
  try {
    await service.verifyMedia(work.revisionId);
  } catch {
    tamperDenied = true;
  }
  if (!tamperDenied) throw Error('Tampered snapshot accepted');
  writeFileSync(
    join(recovery, '.agency-revisions', snapshot.fileName),
    original
  );
  await service.verifyMedia(work.revisionId);
  const before = await db.agencyDispatch.findFirst({
    where: { state: 'UNKNOWN' },
  });
  if (!before) throw Error('No unknown receipt fixture');
  const after = await restored.agencyDispatch.findUniqueOrThrow({
    where: { id: before.id },
  });
  if (after.state !== 'UNKNOWN' || after.attempt !== before.attempt)
    throw Error('Receipt changed on restore');
  const grants = await db.agencyGrant.count(),
    copy = await restored.agencyGrant.count();
  if (grants !== copy) throw Error('Grant history lost');
  console.log(
    'PASS: real database dump/restore; private original and snapshot bytes; compiled eligibility rejects missing/tampered bytes; repaired backup verifies; grants and UNKNOWN/attempt preserved. No worker runs against restored state.'
  );
} finally {
  process.env.UPLOAD_DIRECTORY = previousUploads;
  await db.$disconnect();
  if (restored) await restored.$disconnect();
  await http.dispose();
  if (created) run(['dropdb', '-U', 'postiz_agency', owned]);
  rmSync(temp, { recursive: true, force: true });
}

// Imported provider SDK timers must not keep the completed rehearsal alive.
process.exit(0);
