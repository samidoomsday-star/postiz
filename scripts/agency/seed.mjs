import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const database = new URL(process.env.DATABASE_URL || '');
if (
  process.env.AGENCY_TEST_MODE !== 'true' ||
  process.env.AGENCY_TEST_ACK !== 'LOCAL_SYNTHETIC_ONLY' ||
  database.pathname !== '/postiz_agency_test' ||
  !['localhost', '127.0.0.1', 'postgres'].includes(database.hostname)
) {
  throw new Error(
    'Fixture seed refuses databases outside isolated synthetic mode'
  );
}

const prisma = new PrismaClient();
const password = 'LocalFixture123!'; // Public synthetic fixture, never a real account credential.
try {
  for (const agency of ['a', 'b']) {
    const orgId = `fixture-agency-${agency}`;
    await prisma.organization.upsert({
      where: { id: orgId },
      update: {},
      create: { id: orgId, name: `Synthetic Agency ${agency.toUpperCase()}` },
    });
    for (const role of ['owner', 'editor']) {
      const userId = `fixture-user-${agency}-${role}`;
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          email: `${role}-${agency}@example.test`,
          name: `Synthetic ${role} ${agency}`,
          providerName: 'LOCAL',
          password: bcrypt.hashSync(password, 10),
          timezone: 360,
          sendSuccessEmails: false,
          sendFailureEmails: false,
          sendStreakEmails: false,
        },
      });
      await prisma.userOrganization.upsert({
        where: { userId_organizationId: { userId, organizationId: orgId } },
        update: {},
        create: {
          userId,
          organizationId: orgId,
          role: role === 'owner' ? 'SUPERADMIN' : 'USER',
        },
      });
    }
    for (const client of ['1', '2']) {
      const clientId = `fixture-client-${agency}-${client}`;
      await prisma.customer.upsert({
        where: { id: clientId },
        update: {},
        create: {
          id: clientId,
          name: `Synthetic Client ${agency}${client}`,
          orgId,
        },
      });
      await prisma.integration.upsert({
        where: { id: `fixture-channel-${agency}-${client}` },
        update: {},
        create: {
          id: `fixture-channel-${agency}-${client}`,
          internalId: `synthetic-${agency}-${client}`,
          organizationId: orgId,
          customerId: clientId,
          name: `Synthetic channel ${agency}${client}`,
          providerIdentifier: 'synthetic',
          type: 'social',
          token: 'synthetic-token',
          profile: `synthetic-${agency}-${client}`,
          picture: '/postiz.svg',
          ownershipQuarantined: false,
        },
      });
    }
  }
  for (const agency of ['a', 'b']) {
    for (const client of ['1', '2'])
      for (const role of ['EDITOR', 'PUBLISHER']) {
        const data = {
          organizationId: `fixture-agency-${agency}`,
          userId: `fixture-user-${agency}-owner`,
          clientId: `fixture-client-${agency}-${client}`,
          role,
        };
        await prisma.agencyGrant.upsert({
          where: { organizationId_userId_clientId_role: data },
          update: {},
          create: data,
        });
      }
    const data = {
      organizationId: `fixture-agency-${agency}`,
      userId: `fixture-user-${agency}-editor`,
      clientId: `fixture-client-${agency}-1`,
      role: 'EDITOR',
    };
    await prisma.agencyGrant.upsert({
      where: { organizationId_userId_clientId_role: data },
      update: {},
      create: data,
    });
  }
  const file = '.agency/fixture-access.json';
  const access = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  for (const name of ['a', 'b', 'a1Draft', 'a1Publish']) {
    const agency = name === 'b' ? 'b' : 'a';
    const previous =
      access[name] &&
      (await prisma.agencyCredential.findUnique({
        where: {
          secretHash: createHash('sha256').update(access[name]).digest('hex'),
        },
      }));
    if (previous && !previous.revokedAt && +previous.expiresAt > Date.now())
      continue;
    const secret = 'agk_' + randomBytes(32).toString('base64url');
    await prisma.agencyCredential.create({
      data: {
        organizationId: `fixture-agency-${agency}`,
        creatorId: `fixture-user-${agency}-owner`,
        name: `Fixture ${name}`,
        secretHash: createHash('sha256').update(secret).digest('hex'),
        prefix: secret.slice(0, 12),
        clientIds: name.startsWith('a1')
          ? ['fixture-client-a-1']
          : [`fixture-client-${agency}-1`, `fixture-client-${agency}-2`],
        actions:
          name === 'a1Draft'
            ? ['content:read', 'draft:write']
            : ['content:read', 'draft:write', 'publish:schedule'],
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    access[name] = secret;
  }
  writeFileSync(file, JSON.stringify(access), { mode: 0o600 });
  console.log(
    'Synthetic fixtures ready: two agencies, four clients/channels, owner/editor identities. No live credentials.'
  );
} finally {
  await prisma.$disconnect();
}
