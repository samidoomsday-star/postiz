import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgencyDispatch, Prisma } from '@prisma/client';
import { TemporalService } from 'nestjs-temporal-core';
import { PrismaService } from '../database/prisma/prisma.service';
import { IntegrationManager } from '../integrations/integration.manager';
import { SocialAbstract } from '../integrations/social.abstract';
import { AgencyReconciliation } from '../integrations/social/social.integrations.interface';
import { AgencyService } from './agency.service';
import { ApprovalService } from './approval.service';
import { AgencyActor, AgencyAction } from './policy';
import { digest, FrozenPayload } from './revision';
import {
  actionCopy,
  actionStates,
  actionUrgency,
  receiptMeaning,
} from './action.projection';
import { syntheticModeEnabled } from '@gitroom/helpers/testing/synthetic-mode';

const missing = () => new NotFoundException('Action not found');
type ActionCommand = {
  expectedRevision: number;
  operationId: string;
  expectedActionVersion?: number;
  ownerId?: string | null;
  disposition?: string;
  note?: string;
  dispatchId?: string;
  expectedAttempt?: number;
};
type Meta = { work: any; revision: any; payload: FrozenPayload };
type Filter = {
  client?: string;
  owner?: string;
  state?: string;
  urgency?: string;
  page?: string;
};
const bounded = async <T>(promise: Promise<T>): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Read-only provider check timed out')),
          5000
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout!);
  }
};
@Injectable()
export class ActionService {
  constructor(
    private db: PrismaService,
    private agency: AgencyService,
    private approval: ApprovalService,
    private providers: IntegrationManager,
    private temporal: TemporalService
  ) {}
  private async staff(actor: AgencyActor) {
    if (
      actor.type !== 'user' ||
      actor.reviewSessionId ||
      actor.reviewInvitationId ||
      actor.reviewAssignment
    )
      throw new ForbiddenException('Staff action access required');
    await this.agency.membership(actor);
  }
  private async authorize(
    actor: AgencyActor,
    meta: Meta,
    action: AgencyAction
  ) {
    for (const target of meta.payload.targets)
      await this.agency.assert(
        actor,
        meta.work.clientId,
        action,
        target.channelId
      );
  }
  private async meta(actor: AgencyActor, revisionId: string): Promise<Meta> {
    const revision = await this.db.agencyRevision.findFirst({
      where: { id: revisionId, organizationId: actor.organizationId },
    });
    if (!revision) throw missing();
    const work = await this.db.agencyWork.findFirst({
      where: { id: revision.workId, organizationId: actor.organizationId },
    });
    if (!work || work.clientId !== revision.clientId) throw missing();
    const payload = revision.payload as unknown as FrozenPayload;
    if (digest(payload) !== revision.payloadHash || !payload.targets.length)
      throw new ConflictException('Revision integrity check failed');
    const meta = { work, revision, payload };
    await this.authorize(actor, meta, 'content:read');
    // Current ownership is resolved before projecting frozen channel metadata.
    for (const target of payload.targets)
      if (
        !(await this.db.integration.findFirst({
          where: {
            id: target.channelId,
            organizationId: actor.organizationId,
            customerId: work.clientId,
            ownershipQuarantined: false,
          },
        }))
      )
        throw missing();
    return meta;
  }
  private async channels(actor: AgencyActor) {
    await this.staff(actor);
    return this.agency.staffReadScope(actor);
  }

  private async query(actor: AgencyActor, filter: Filter, only?: string) {
    for (const key of ['client', 'owner', 'state', 'urgency', 'page'] as const)
      if (filter[key] !== undefined && typeof filter[key] !== 'string')
        throw new BadRequestException('Action filters must be single values');
    const scope = await this.channels(actor);
    if (filter.client && !scope.clients.some((c) => c.id === filter.client))
      throw missing();
    if (filter.state && !actionStates.includes(filter.state as any))
      throw new BadRequestException('Invalid action state');
    if (filter.urgency && !['HIGH', 'NORMAL', 'LOW'].includes(filter.urgency))
      throw new BadRequestException('Invalid urgency');
    if (filter.owner && filter.owner.length > 100)
      throw new BadRequestException('Invalid owner');
    const page = filter.page || '0';
    if (!/^\d{1,4}$/.test(page)) throw new BadRequestException('Invalid page');
    // Every target must be in the readable current client/channel scope. Apply
    // scope, state, owner and urgency in SQL before limit/offset/window count.
    // This bounded interactive query loses ~500ms to PostgreSQL JIT compiling
    // repeated classifications. Keep its scope local to this transaction/pool use.
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL jit = off`;
        return tx.$queryRaw<any[]>(Prisma.sql`
      WITH target_facts AS MATERIALIZED (
        SELECT r.id AS "revisionId",bool_and(i.id IS NOT NULL) AS readable,
          bool_or(i.disabled OR i."refreshNeeded" OR i."deletedAt" IS NOT NULL OR i."internalId"<>t->>'accountId' OR i."providerIdentifier"<>t->>'provider') AS blocked,
          min((t->>'publishAt')::timestamptz) AS "scheduledAt"
        FROM "AgencyRevision" r CROSS JOIN LATERAL jsonb_array_elements(r.payload->'targets') t
        LEFT JOIN "Integration" i ON i.id=t->>'channelId' AND i."organizationId"=r."organizationId" AND i."customerId"=r."clientId" AND NOT i."ownershipQuarantined" AND i.id=ANY(${
          scope.ids
        }::text[])
        WHERE r."organizationId"=${
          actor.organizationId
        } AND r."clientId"=ANY(${scope.clients.map(
          (client) => client.id
        )}::text[])
          ${
            filter.client
              ? Prisma.sql`AND r."clientId"=${filter.client}`
              : Prisma.empty
          }
          ${only ? Prisma.sql`AND r.id=${only}` : Prisma.empty}
        GROUP BY r.id
      ), receipt_facts AS MATERIALIZED (
        SELECT p."revisionId",count(*) FILTER(WHERE p.stage='publish') AS total,
          count(*) FILTER(WHERE p.stage='publish' AND p.state='CONFIRMED') AS confirmed,
          bool_or(p.state='UNKNOWN' OR (p.state='CLAIMED' AND p."claimedAt"<now()-interval '5 minutes')) AS unknown,
          bool_or(p.state='FAILED') AS failed,bool_or(p.state IN ('CLAIMED','PENDING')) AS processing,
          bool_or(p.state='READY' AND p.stage='publish' AND (SELECT (t->'parts'->p.part->>'dueAt')::timestamptz FROM jsonb_array_elements(r.payload->'targets') t WHERE t->>'channelId'=p."channelId")<now()-(${
            syntheticModeEnabled() ? 2000 : 120000
          }*interval '1 millisecond')) AS stalled,
          max(p."updatedAt") AS "receiptUpdatedAt"
        FROM "AgencyDispatch" p JOIN "AgencyRevision" r ON r.id=p."revisionId" AND r."organizationId"=p."organizationId"
        WHERE p."organizationId"=${actor.organizationId}
          ${only ? Prisma.sql`AND p."revisionId"=${only}` : Prisma.empty}
          ${
            filter.client
              ? Prisma.sql`AND p."clientId"=${filter.client}`
              : Prisma.empty
          }
        GROUP BY p."revisionId"
      ), facts AS MATERIALIZED (
        SELECT r.id,r."workId",r.version,r."payloadHash",r."createdAt",r.payload->>'timezone' AS timezone,w.status,w."currentVersion",w."clientId",c.name AS "clientName",
          a."ownerId",a.disposition,COALESCE(a.version,0) AS "actionVersion",COALESCE(a.note,'') AS note,a."updatedAt" AS "actionUpdatedAt",
          q.status AS "reviewStatus",q."expiresAt",d."decision",d."reviewInvitationId",
          tf."scheduledAt",
          COALESCE(s.confirmed,0)::int AS confirmed,COALESCE(s.total,0)::int AS total,COALESCE(s.unknown,false) AS unknown,COALESCE(s.failed,false) AS failed,COALESCE(s.processing,false) AS processing,COALESCE(s.stalled,false) AS stalled,
          COALESCE(s."receiptUpdatedAt",r."createdAt") AS "receiptUpdatedAt",
          tf.blocked,
          (q.status='APPROVED' AND q."expiresAt">now() AND d.decision='APPROVED' AND d."payloadHash"=r."payloadHash"
           AND EXISTS(SELECT 1 FROM "UserOrganization" m JOIN "User" u ON u.id=m."userId" WHERE m."organizationId"=r."organizationId" AND m."userId"=q."reviewerId" AND NOT m.disabled AND u.activated AND u."deletedAt" IS NULL)
           AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'targets') t WHERE NOT (
             (d."reviewInvitationId" IS NULL AND EXISTS(SELECT 1 FROM "AgencyGrant" g WHERE g."organizationId"=r."organizationId" AND g."clientId"=r."clientId" AND g."userId"=q."reviewerId" AND g.role='REVIEWER' AND g."revokedAt" IS NULL AND (g."expiresAt" IS NULL OR g."expiresAt">now()) AND (cardinality(g."channelIds")=0 OR t->>'channelId'=ANY(g."channelIds"))))
             OR (d."reviewInvitationId" IS NOT NULL AND EXISTS(SELECT 1 FROM "AgencyReviewInvitation" v JOIN "User" u ON u.id=v."reviewerId" JOIN "UserOrganization" m ON m."userId"=v."creatorId" AND m."organizationId"=v."organizationId" JOIN "User" issuer ON issuer.id=m."userId" WHERE v.id=d."reviewInvitationId" AND v."organizationId"=r."organizationId" AND v."clientId"=r."clientId" AND v."reviewerId"=q."reviewerId" AND v.email=lower(trim(u.email)) AND v."revokedAt" IS NULL AND v."expiresAt">now() AND v."verifiedAt" IS NOT NULL AND v."exchangedAt" IS NOT NULL AND NOT m.disabled AND m.role IN ('ADMIN','SUPERADMIN') AND issuer.activated AND issuer."deletedAt" IS NULL AND (cardinality(v."channelIds")=0 OR t->>'channelId'=ANY(v."channelIds"))))
           ))) AS "approvalValid"
        FROM "AgencyRevision" r JOIN "AgencyWork" w ON w.id=r."workId" JOIN "Customer" c ON c.id=r."clientId" AND c."orgId"=r."organizationId" AND c."deletedAt" IS NULL
        LEFT JOIN "AgencyActionRecord" a ON a."revisionId"=r.id LEFT JOIN "AgencyReviewRequest" q ON q."revisionId"=r.id LEFT JOIN "AgencyReviewDecision" d ON d."requestId"=q.id
        JOIN target_facts tf ON tf."revisionId"=r.id AND tf.readable
        LEFT JOIN receipt_facts s ON s."revisionId"=r.id
        WHERE r."organizationId"=${
          actor.organizationId
        } AND c."deletedAt" IS NULL AND jsonb_array_length(r.payload->'targets')>0
          AND r."clientId"=ANY(${scope.clients.map(
            (client) => client.id
          )}::text[])
          AND (r.version=w."currentVersion" OR COALESCE(s.total,0)>0)
          ${
            filter.client
              ? Prisma.sql`AND r."clientId"=${filter.client}`
              : Prisma.empty
          }
          ${only ? Prisma.sql`AND r.id=${only}` : Prisma.empty}
      ), classified AS MATERIALIZED (
        SELECT *,CASE WHEN total>0 AND confirmed=total THEN 'PUBLISHED'
          WHEN confirmed>0 AND confirmed<total THEN 'PARTIAL' WHEN unknown THEN 'UNKNOWN' WHEN failed THEN 'FAILED'
          WHEN status='CANCELED' AND NOT processing THEN 'CANCELED' WHEN version<>"currentVersion" AND NOT processing THEN 'SUPERSEDED'
          WHEN blocked THEN 'CHANNEL_BLOCKED'
          WHEN status IN ('INVALIDATED','REVOKED') OR (status IN ('APPROVED','SCHEDULED') AND NOT COALESCE("approvalValid",false)) OR (status='APPROVED' AND total=0 AND "scheduledAt"<=now()) OR (status='IN_REVIEW' AND "expiresAt"<=now()) THEN 'APPROVAL_INVALIDATED'
          WHEN stalled THEN 'DUE_STALLED' WHEN processing THEN 'PROCESSING' WHEN total>0 AND status='SCHEDULED' THEN 'SCHEDULED'
          WHEN status='IN_REVIEW' THEN 'REVIEW_PENDING' WHEN status='CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED' ELSE 'SAVED' END AS state
        FROM facts
      ), urgent AS (SELECT *,CASE WHEN state IN ('UNKNOWN','PARTIAL','FAILED','CHANNEL_BLOCKED','DUE_STALLED','APPROVAL_INVALIDATED') THEN 'HIGH' WHEN state IN ('REVIEW_PENDING','CHANGES_REQUESTED','PROCESSING') THEN 'NORMAL' ELSE 'LOW' END AS urgency FROM classified)
      SELECT *,count(*) OVER()::int AS count FROM urgent WHERE true
        ${filter.state ? Prisma.sql`AND state=${filter.state}` : Prisma.empty}
        ${
          filter.urgency
            ? Prisma.sql`AND urgency=${filter.urgency}`
            : Prisma.empty
        }
        ${
          filter.owner === 'unassigned'
            ? Prisma.sql`AND "ownerId" IS NULL`
            : filter.owner
            ? Prisma.sql`AND "ownerId"=${
                filter.owner === 'me' ? actor.id : filter.owner
              }`
            : Prisma.empty
        }
      ORDER BY CASE urgency WHEN 'HIGH' THEN 0 WHEN 'NORMAL' THEN 1 ELSE 2 END,"receiptUpdatedAt" DESC,id LIMIT 21 OFFSET ${
        Number(page) * 20
      }`);
      },
      { maxWait: 15000, timeout: 15000 }
    );
  }
  private summary(row: any) {
    const {
      count: _count,
      currentVersion: _currentVersion,
      reviewInvitationId: _invitationId,
      approvalValid,
      ...rest
    } = row;
    return {
      ...rest,
      approvalValid: !!approvalValid,
      urgency: actionUrgency(row.state),
      reason: actionCopy[row.state],
      disposition: row.disposition || 'OPEN',
      lastUpdate: [row.receiptUpdatedAt, row.actionUpdatedAt, row.createdAt]
        .filter(Boolean)
        .sort((a, b) => +b - +a)[0],
    };
  }
  async list(actor: AgencyActor, filter: Filter) {
    const rows = await this.query(actor, filter);
    const count =
      rows[0]?.count ??
      (Number(filter.page || 0) > 0
        ? (await this.query(actor, { ...filter, page: '0' }))[0]?.count || 0
        : 0);
    return {
      items: rows.slice(0, 20).map((row) => this.summary(row)),
      count,
      page: Number(filter.page || 0),
      hasMore: rows.length > 20,
    };
  }
  private async can(actor: AgencyActor, meta: Meta, action: AgencyAction) {
    try {
      await this.authorize(actor, meta, action);
      return true;
    } catch {
      return false;
    }
  }
  async owners(actor: AgencyActor, id: string) {
    await this.staff(actor);
    const meta = await this.meta(actor, id);
    const members = await this.db.userOrganization.findMany({
      where: {
        organizationId: actor.organizationId,
        disabled: false,
        user: { activated: true, deletedAt: null },
      },
      select: { userId: true, user: { select: { name: true } } },
      take: 200,
    });
    const owners = [];
    for (const m of members)
      if (
        await this.can(
          { type: 'user', id: m.userId, organizationId: actor.organizationId },
          meta,
          'content:read'
        )
      )
        owners.push({ id: m.userId, name: m.user.name || 'Agency member' });
    return owners;
  }
  async detail(actor: AgencyActor, id: string) {
    await this.staff(actor);
    const meta = await this.meta(actor, id);
    const row = (await this.query(actor, {}, id))[0];
    if (!row) throw missing();
    const receipts = await this.db.agencyDispatch.findMany({
      where: { revisionId: id },
      orderBy: [{ channelId: 'asc' }, { part: 'asc' }, { stage: 'asc' }],
    });
    const publisher = await this.can(actor, meta, 'publish:schedule');
    const evidence = await this.db.agencyRecoveryEvidence.findMany({
      where: { revisionId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const audits = await this.db.agencyAudit.findMany({
      where: {
        organizationId: actor.organizationId,
        clientId: meta.work.clientId,
        OR: [
          {
            resourceId: {
              in: [id, meta.work.id, ...receipts.map((d) => d.id)],
            },
          },
          { metadata: { path: ['revisionId'], equals: id } },
          { metadata: { path: ['workId'], equals: meta.work.id } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        actorType: true,
        actorId: true,
        createdAt: true,
      },
    });
    const recoveryReceipts = [];
    for (const d of receipts) {
      const target = meta.payload.targets.find(
        (t) => t.channelId === d.channelId
      )!;
      const provider = this.providers.getSocialIntegration(target.provider);
      const eligibility =
        publisher &&
        meta.work.currentVersion === meta.revision.version &&
        meta.work.status === 'SCHEDULED' &&
        !!row.approvalValid &&
        !row.blocked;
      const canRetry =
        eligibility &&
        d.stage === 'publish' &&
        d.state === 'FAILED' &&
        target.parts.length === 1 &&
        !!provider.verifyFailedPublication;
      const probe =
        !!provider.reconcilePublication ||
        (d.state === 'PENDING' &&
          provider.checkPostStatus !==
            SocialAbstract.prototype.checkPostStatus);
      const canResume =
        eligibility &&
        d.state === 'READY' &&
        d.part === 0 &&
        d.stage === 'publish' &&
        receipts
          .filter((r) => r.channelId === d.channelId)
          .every((r) => r.state === 'READY');
      recoveryReceipts.push({
        id: d.id,
        channelId: d.channelId,
        channelName: target.name,
        part: d.part,
        stage: d.stage,
        state: d.state,
        meaning: receiptMeaning(d.state),
        attempt: d.attempt,
        claimedAt: d.claimedAt,
        updatedAt: d.updatedAt,
        providerId: d.providerId,
        providerUrl: this.safeUrl(d.providerUrl),
        reason: d.reason,
        canRetry,
        canResume,
        canReconcile:
          publisher &&
          probe &&
          (['PENDING', 'UNKNOWN'].includes(d.state) ||
            (d.state === 'CLAIMED' &&
              !!d.claimedAt &&
              +d.claimedAt <= Date.now() - 300000)),
        manualResolution:
          !probe && ['UNKNOWN', 'CLAIMED'].includes(d.state)
            ? 'Check the platform account and timestamp manually. Record evidence below; no resend or publication status change is permitted.'
            : null,
      });
    }
    return {
      ...this.summary(row),
      current: meta.work.currentVersion === meta.revision.version,
      revision: {
        id,
        version: meta.revision.version,
        hash: meta.revision.payloadHash,
        timezone: meta.payload.timezone,
        targets: meta.payload.targets.map((t) => ({
          channelId: t.channelId,
          name: t.name,
          provider: t.provider,
          accountId: t.accountId,
          publishAt: t.publishAt,
          parts: t.parts.map((p) => ({
            id: p.id,
            message: p.message,
            dueAt: p.dueAt,
          })),
        })),
      },
      receipts: recoveryReceipts,
      evidence: evidence.map((e) => ({
        ...e,
        providerUrl: this.safeUrl(e.providerUrl),
      })),
      audits,
      owners: await this.owners(actor, id),
      permitted: {
        edit: await this.can(actor, meta, 'draft:write'),
        publish: publisher,
      },
      manualGuide:
        'If evidence is unavailable, investigate the platform and record a note. Acknowledgment or dismissal never confirms publication; uncertain attempts stay blocked from resend.',
    };
  }
  private safeUrl(url: string | null) {
    if (!url) return null;
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && !u.username && !u.password
        ? u.toString()
        : null;
    } catch {
      return null;
    }
  }
  private async command(
    actor: AgencyActor,
    id: string,
    action: string,
    input: ActionCommand,
    fn: (tx: Prisma.TransactionClient, meta: Meta) => Promise<any>
  ) {
    await this.staff(actor);
    if (
      !input ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1 ||
      !/^[a-f0-9-]{36}$/i.test(input.operationId || '')
    )
      throw new BadRequestException(
        'expectedRevision and UUID operationId required'
      );
    return this.db.$transaction(
      async (tx) => {
        await this.agency.lockPolicy(tx, actor.organizationId);
        const meta = await this.meta(actor, id);
        if (action !== 'action.update')
          await this.authorize(actor, meta, 'publish:schedule');
        const hash = digest({ id, action, input });
        const where = {
          organizationId: actor.organizationId,
          actorType: actor.type,
          actorId: actor.id,
          operationId: input.operationId,
        };
        const prior = await tx.agencyCommand.findUnique({
          where: { organizationId_actorType_actorId_operationId: where },
        });
        if (prior) {
          if (prior.payloadHash !== hash)
            throw new ConflictException('Operation ID reused');
          return prior.result;
        }
        if (meta.revision.version !== input.expectedRevision)
          throw new ConflictException('Revision changed; reload action');
        const result = await fn(tx, meta);
        await tx.agencyCommand.create({
          data: {
            ...where,
            workId: meta.work.id,
            action,
            payloadHash: hash,
            result,
          },
        });
        await this.agency.audit(tx, actor, action, id, meta.work.clientId, {
          revisionId: id,
          outcome: result.outcome || result.disposition || 'RECORDED',
          dispatchId: input.dispatchId || null,
        });
        return result;
      },
      { maxWait: 15000, timeout: 20000 }
    );
  }
  async update(actor: AgencyActor, id: string, input: ActionCommand) {
    if (
      !['OPEN', 'ACKNOWLEDGED', 'DISMISSED'].includes(
        input?.disposition || ''
      ) ||
      typeof input.note !== 'string' ||
      input.note.length > 2000 ||
      !Number.isSafeInteger(input.expectedActionVersion) ||
      input.expectedActionVersion! < 0 ||
      (input.ownerId !== null &&
        (typeof input.ownerId !== 'string' || input.ownerId.length > 100))
    )
      throw new BadRequestException(
        'Owner, disposition, note and expectedActionVersion required'
      );
    if (input.disposition === 'DISMISSED' && !input.note.trim())
      throw new BadRequestException(
        'Explain the dismissal; publication results remain unchanged'
      );
    return this.command(actor, id, 'action.update', input, async (tx, meta) => {
      if (
        input.ownerId &&
        !(await this.owners(actor, id)).some((o) => o.id === input.ownerId)
      )
        throw missing();
      const record = await tx.agencyActionRecord.findUnique({
        where: { revisionId: id },
      });
      if ((record?.version || 0) !== input.expectedActionVersion)
        throw new ConflictException('Action changed; reload before updating');
      const data = {
        ownerId: input.ownerId,
        disposition: input.disposition!,
        note: input.note.trim(),
        version: (record?.version || 0) + 1,
      };
      const row = record
        ? await tx.agencyActionRecord.update({ where: { id: record.id }, data })
        : await tx.agencyActionRecord.create({
            data: {
              ...data,
              organizationId: actor.organizationId,
              clientId: meta.work.clientId,
              workId: meta.work.id,
              revisionId: id,
            },
          });
      return {
        id,
        ownerId: row.ownerId,
        disposition: row.disposition,
        version: row.version,
      };
    });
  }
  private async dispatch(
    tx: Prisma.TransactionClient,
    meta: Meta,
    input: ActionCommand
  ) {
    if (
      typeof input.dispatchId !== 'string' ||
      !Number.isSafeInteger(input.expectedAttempt) ||
      input.expectedAttempt! < 0
    )
      throw new BadRequestException('Dispatch and expectedAttempt required');
    const row = await tx.agencyDispatch.findFirst({
      where: {
        id: input.dispatchId,
        revisionId: meta.revision.id,
        organizationId: meta.work.organizationId,
        clientId: meta.work.clientId,
      },
    });
    if (!row) throw missing();
    if (row.attempt !== input.expectedAttempt)
      throw new ConflictException('Attempt changed; reload receipts');
    const target = meta.payload.targets.find(
      (t) => t.channelId === row.channelId
    );
    if (!target) throw missing();
    const channel = await this.db.integration.findFirst({
      where: {
        id: row.channelId,
        organizationId: row.organizationId,
        customerId: row.clientId,
        deletedAt: null,
        ownershipQuarantined: false,
        disabled: false,
        refreshNeeded: false,
        internalId: target.accountId,
        providerIdentifier: target.provider,
      },
    });
    if (!channel)
      throw new ConflictException(
        'Restore the same channel account before recovery'
      );
    return {
      row,
      target,
      channel,
      provider: this.providers.getSocialIntegration(target.provider),
    };
  }
  private async evidence(
    tx: Prisma.TransactionClient,
    actor: AgencyActor,
    row: AgencyDispatch,
    kind: string,
    outcome: string,
    result?: { postId: string; releaseURL: string }
  ) {
    await tx.agencyRecoveryEvidence.create({
      data: {
        organizationId: row.organizationId,
        clientId: row.clientId,
        workId: row.workId,
        revisionId: row.revisionId,
        dispatchId: row.id,
        attempt: row.attempt,
        kind,
        outcome,
        actorId: actor.id,
        previousState: row.state,
        previousReason: row.reason,
        claimedAt: row.claimedAt,
        providerId: result?.postId,
        providerUrl: result?.releaseURL,
      },
    });
  }
  async retry(actor: AgencyActor, id: string, input: ActionCommand) {
    const result = await this.command(
      actor,
      id,
      'action.retry',
      input,
      async (tx, meta) => {
        const { row, target, channel, provider } = await this.dispatch(
          tx,
          meta,
          input
        );
        if (
          row.state !== 'FAILED' ||
          row.stage !== 'publish' ||
          target.parts.length !== 1 ||
          !provider.verifyFailedPublication ||
          !row.claimedAt
        )
          throw new ConflictException(
            'No supported known-safe failed target; never resend an uncertain attempt'
          );
        // Earlier execution must be closed, and only an opt-in provider proof
        // permits rearming this target. No generic exception implies safe retry.
        try {
          const old = await this.temporal.client
            .getRawClient()
            .workflow.getHandle(
              row.attempt
                ? `agency-retry_${row.id}_${row.attempt}`
                : `post_${row.postId}`
            )
            .describe();
          if (old.status.name === 'RUNNING')
            throw new ConflictException(
              'Previous workflow is still running; wait for closure'
            );
        } catch (error) {
          if ((error as Error).name !== 'WorkflowNotFoundError') throw error;
        }
        let noSideEffect = false;
        try {
          noSideEffect =
            (await bounded(
              provider.verifyFailedPublication(
                channel.token,
                {
                  localId: row.postId,
                  stage: row.stage,
                  attempt: row.attempt,
                  claimedAt: row.claimedAt.toISOString(),
                },
                channel
              )
            )) === true;
        } catch {
          /* Provider/SDK failures never expose credential-bearing details. */
        }
        if (!noSideEffect)
          throw new ConflictException(
            'Provider could not prove no side effect; investigate manually'
          );

        await this.approval.recoveryEligibility(
          actor,
          meta.work,
          meta.revision,
          tx
        );
        await this.evidence(tx, actor, row, 'RETRY', 'NO_SIDE_EFFECT');
        const attempt = row.attempt + 1;
        await tx.agencyDispatch.update({
          where: { id: row.id },
          data: {
            state: 'READY',
            attempt,
            claimedAt: null,
            reason: null,
            result: Prisma.JsonNull,
            pendingData: Prisma.JsonNull,
            actorType: actor.type,
            actorId: actor.id,
          },
        });
        await tx.post.update({
          where: { id: row.postId },
          data: {
            state: 'QUEUE',
            error: null,
            agencyActorType: actor.type,
            agencyActorId: actor.id,
          },
        });
        return {
          id,
          dispatchId: row.id,
          attempt,
          postId: row.postId,
          queue: target.provider.split('-')[0],
          outcome: 'QUEUED',
        };
      }
    );
    // Repeated enqueues use the same attempt execution ID. The activity claim
    // rejects every earlier execution, and successful targets are untouched.
    const row = await this.db.agencyDispatch.findFirst({
      where: { id: result.dispatchId, attempt: result.attempt, state: 'READY' },
    });
    if (row) {
      try {
        await this.temporal.client
          .getRawClient()
          .workflow.signalWithStart('postWorkflowV112', {
            workflowId: `agency-retry_${result.dispatchId}_${result.attempt}`,
            taskQueue: 'main',
            signal: 'poke',
            signalArgs: [],
            workflowIdConflictPolicy: 'USE_EXISTING',
            args: [
              {
                postId: result.postId,
                taskQueue: result.queue,
                organizationId: actor.organizationId,
              },
            ],
          });
      } catch {
        /* READY remains visible; repeating the same operation retries only enqueue. */
      }
    }
    return result;
  }
  async resume(actor: AgencyActor, id: string, input: ActionCommand) {
    const result = await this.command(
      actor,
      id,
      'action.resume',
      input,
      async (tx, meta) => {
        const { row, target } = await this.dispatch(tx, meta, input);
        if (
          row.state !== 'READY' ||
          row.part !== 0 ||
          row.stage !== 'publish' ||
          (await tx.agencyDispatch.count({
            where: {
              revisionId: id,
              channelId: row.channelId,
              state: { not: 'READY' },
            },
          }))
        )
          throw new ConflictException(
            'Only an entirely unclaimed queued target can resume'
          );
        await this.approval.recoveryEligibility(
          actor,
          meta.work,
          meta.revision,
          tx
        );
        await tx.agencyDispatch.updateMany({
          where: { revisionId: id, channelId: row.channelId, state: 'READY' },
          data: { actorType: actor.type, actorId: actor.id },
        });
        await tx.post.updateMany({
          where: {
            agencyRevisionId: id,
            integrationId: row.channelId,
            deletedAt: null,
          },
          data: {
            state: 'QUEUE',
            error: null,
            agencyActorType: actor.type,
            agencyActorId: actor.id,
          },
        });
        return {
          id,
          dispatchId: row.id,
          attempt: row.attempt,
          postId: row.postId,
          queue: target.provider.split('-')[0],
          outcome: 'QUEUED',
        };
      }
    );
    const row = await this.db.agencyDispatch.findFirst({
      where: { id: result.dispatchId, state: 'READY', attempt: result.attempt },
    });
    if (row)
      try {
        await this.temporal.client
          .getRawClient()
          .workflow.signalWithStart('postWorkflowV112', {
            workflowId: row.attempt
              ? `agency-retry_${row.id}_${row.attempt}`
              : `post_${row.postId}`,
            taskQueue: 'main',
            signal: 'poke',
            signalArgs: [],
            workflowIdConflictPolicy: 'USE_EXISTING',
            args: [
              {
                postId: row.postId,
                taskQueue: result.queue,
                organizationId: actor.organizationId,
              },
            ],
          });
      } catch {
        /* Remains queued; safe enqueue can be repeated. */
      }
    return result;
  }
  async reconcile(actor: AgencyActor, id: string, input: ActionCommand) {
    const result = await this.command(
      actor,
      id,
      'action.reconcile',
      input,
      async (tx, meta) => {
        const { row, channel, provider } = await this.dispatch(tx, meta, input);
        if (row.state === 'CONFIRMED')
          return { id, dispatchId: row.id, outcome: 'CONFIRMED' };
        if (
          !['UNKNOWN', 'PENDING', 'CLAIMED'].includes(row.state) ||
          !row.claimedAt
        )
          throw new ConflictException('Receipt does not need reconciliation');
        if (row.state === 'CLAIMED' && +row.claimedAt > Date.now() - 300000)
          throw new ConflictException(
            'Mutation may still be running; wait before checking'
          );
        let outcome = 'UNSUPPORTED',
          confirmed:
            | Extract<AgencyReconciliation, { status: 'confirmed' }>
            | undefined;
        try {
          if (
            row.state === 'PENDING' &&
            row.stage === 'publish' &&
            provider.checkPostStatus !==
              SocialAbstract.prototype.checkPostStatus
          ) {
            const probe = await bounded(
              provider.checkPostStatus(channel.token, row.pendingData, channel)
            );
            if (probe.status === 'completed')
              confirmed = {
                status: 'confirmed',
                postId: probe.postId,
                releaseURL: probe.releaseURL,
              };
            else
              outcome =
                probe.status === 'ready'
                  ? 'READY_FOR_EXISTING_FINALIZATION'
                  : 'PROCESSING';
          } else if (provider.reconcilePublication) {
            const probe = await bounded(
              provider.reconcilePublication(
                channel.token,
                {
                  localId: row.postId,
                  stage: row.stage,
                  attempt: row.attempt,
                  claimedAt: row.claimedAt.toISOString(),
                },
                channel
              )
            );
            if (probe.status === 'confirmed') confirmed = probe;
            else outcome = 'UNKNOWN';
          }
        } catch {
          outcome = 'CHECK_UNAVAILABLE';
        }
        if (
          confirmed &&
          (typeof confirmed.postId !== 'string' ||
            typeof confirmed.releaseURL !== 'string' ||
            !confirmed.postId ||
            confirmed.postId.length > 1000 ||
            !this.safeUrl(confirmed.releaseURL))
        ) {
          confirmed = undefined;
          outcome = 'UNKNOWN';
        }
        if (confirmed) {
          outcome = 'CONFIRMED';
          await this.evidence(tx, actor, row, 'RECONCILE', outcome, confirmed);
          await tx.agencyDispatch.update({
            where: { id: row.id },
            data: {
              state: 'CONFIRMED',
              providerId: confirmed.postId,
              providerUrl: confirmed.releaseURL,
              result: [
                {
                  id: row.postId,
                  postId: confirmed.postId,
                  releaseURL: confirmed.releaseURL,
                  status: 'published',
                },
              ],
            },
          });
          if (row.stage === 'finalize')
            await tx.agencyDispatch.updateMany({
              where: {
                revisionId: row.revisionId,
                channelId: row.channelId,
                part: row.part,
                stage: 'publish',
                state: 'PENDING',
              },
              data: {
                state: 'CONFIRMED',
                providerId: confirmed.postId,
                providerUrl: confirmed.releaseURL,
                result: [
                  {
                    id: row.postId,
                    postId: confirmed.postId,
                    releaseURL: confirmed.releaseURL,
                    status: 'published',
                  },
                ],
              },
            });
        }
        if (!confirmed)
          await this.evidence(tx, actor, row, 'RECONCILE', outcome);
        return { id, dispatchId: row.id, postId: row.postId, outcome };
      }
    );
    if (result.outcome === 'CONFIRMED')
      await this.approval.projectRecoveryReceipt(
        id,
        result.postId ||
          (
            await this.db.agencyDispatch.findUniqueOrThrow({
              where: { id: result.dispatchId },
            })
          ).postId
      );
    return result;
  }
}
