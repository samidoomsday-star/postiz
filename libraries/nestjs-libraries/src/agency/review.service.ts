import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AgencyReviewInvitation,
  AgencyReviewerSession,
  Prisma,
} from '@prisma/client';
import { IntegrationManager } from '../integrations/integration.manager';
import { randomInt, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma/prisma.service';
import { EmailService } from '../services/email.service';
import { AgencyService } from './agency.service';
import { ApprovalService } from './approval.service';
import { AgencyActor, allowsChannel } from './policy';
import { digest, FrozenPayload } from './revision';
import {
  csrfToken,
  escapeMail,
  reviewHash,
  reviewSecret,
  reviewWeek,
  reviewOptions,
  safeEqual,
  verificationHash,
} from './review.security';

export const REVIEW_COOKIE = 'agency_review';
export const REVIEW_CHALLENGE_COOKIE = 'agency_review_challenge';
export type ReviewContext = {
  session: AgencyReviewerSession;
  invitation: AgencyReviewInvitation;
  actor: AgencyActor;
};
const denied = () =>
  new UnauthorizedException(
    'Review access is unavailable or expired. Ask your agency for a new invitation.'
  );
const missing = () => new NotFoundException('Review not found');
type InputCommand = {
  expectedRevision: number;
  operationId: string;
  comment?: string;
};
@Injectable()
export class ReviewService {
  constructor(
    private db: PrismaService,
    private agency: AgencyService,
    private approval: ApprovalService,
    private email: EmailService,
    private providers: IntegrationManager
  ) {}
  private async locked<T>(
    org: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.agency.lockPolicy(tx, org);
        return fn(tx);
      },
      { maxWait: 15000, timeout: 20000 }
    );
  }
  private async limit(scope: string, key: string, limit: number) {
    const slot = Math.floor(Date.now() / 900000);
    const id = verificationHash('rate:' + scope, key + ':' + slot);
    const row = await this.db.agencyReviewThrottle.upsert({
      where: { id },
      create: { id, count: 1, expiresAt: new Date((slot + 2) * 900000) },
      update: { count: { increment: 1 } },
    });
    if (row.count > limit)
      throw new HttpException('Too many attempts. Try again later.', 429);
  }
  private ensureMail() {
    if (
      !this.email.hasProvider() ||
      !process.env.EMAIL_FROM_ADDRESS ||
      !process.env.EMAIL_FROM_NAME
    )
      throw new ServiceUnavailableException(
        'Review email delivery is not configured'
      );
    if (
      process.env.AGENCY_TEST_MODE === 'true' &&
      (!['127.0.0.1', 'localhost'].includes(process.env.EMAIL_HOST || '') ||
        process.env.EMAIL_PORT !== '11025')
    )
      throw new ServiceUnavailableException(
        'Synthetic review mail requires the local sink'
      );
  }
  private async mail(to: string, subject: string, html: string) {
    this.ensureMail();
    try {
      // Direct existing transport: secrets never enter Temporal history or email-service console output.
      await this.email.emailService.sendEmail(
        to,
        subject,
        html,
        process.env.EMAIL_FROM_NAME!,
        process.env.EMAIL_FROM_ADDRESS!
      );
    } catch {
      throw new ServiceUnavailableException(
        'Review email delivery failed. Ask your agency to retry.'
      );
    }
  }
  private async live(invitation: AgencyReviewInvitation, verified = false) {
    if (
      invitation.revokedAt ||
      +invitation.expiresAt <= Date.now() ||
      (verified && (!invitation.verifiedAt || !invitation.exchangedAt))
    )
      throw denied();
    const actor: AgencyActor = {
      type: 'user',
      id: invitation.reviewerId,
      organizationId: invitation.organizationId,
    };
    try {
      const member = await this.agency.membership(actor);
      if (member.user.email.trim().toLowerCase() !== invitation.email)
        throw denied();
      await this.agency.client(actor, invitation.clientId);
      await this.agency.admin({
        type: 'user',
        id: invitation.creatorId,
        organizationId: invitation.organizationId,
      });
    } catch {
      throw denied();
    }
  }
  actor(session: AgencyReviewerSession): AgencyActor {
    return {
      type: 'user',
      id: session.reviewerId,
      organizationId: session.organizationId,
      reviewSessionId: session.id,
      reviewInvitationId: session.invitationId,
    };
  }
  async invite(
    actor: AgencyActor,
    input: {
      clientId: string;
      email: string;
      name: string;
      channelIds?: string[];
      expiresAt?: string;
    }
  ) {
    await this.agency.admin(actor);
    const client = await this.agency.client(actor, input?.clientId);
    this.ensureMail();
    if (
      typeof input.email !== 'string' ||
      input.email.length > 254 ||
      !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(input.email.trim()) ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 100
    )
      throw new BadRequestException(
        'Reviewer name and valid email are required'
      );
    const address = input.email.trim().toLowerCase();
    if (process.env.AGENCY_TEST_MODE === 'true' && !address.endsWith('.test'))
      throw new BadRequestException(
        'Synthetic invitations require a .test recipient'
      );
    const channelIds = input.channelIds || [];
    if (
      !Array.isArray(channelIds) ||
      channelIds.length > 100 ||
      channelIds.some((id) => typeof id !== 'string')
    )
      throw new BadRequestException('Invalid channel scope');
    for (const id of channelIds)
      if (
        (await this.agency.channel(actor, id, 'content:read')).customerId !==
        client.id
      )
        throw missing();
    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt)
      : new Date(Date.now() + 7 * 86400000);
    if (
      !Number.isFinite(+expiresAt) ||
      +expiresAt <= Date.now() ||
      +expiresAt > Date.now() + 7 * 86400000
    )
      throw new BadRequestException('Invitation must expire within seven days');
    const token = 'rvi_' + reviewSecret();
    const invitation = await this.locked(actor.organizationId, async (tx) => {
      await this.agency.admin(actor);
      await this.agency.client(actor, client.id);
      for (const id of channelIds)
        if (
          (await this.agency.channel(actor, id, 'content:read')).customerId !==
          client.id
        )
          throw missing();
      const users = await tx.user.findMany({
        where: {
          email: { equals: address, mode: 'insensitive' },
          providerName: 'LOCAL',
        },
      });
      if (users.length > 1)
        throw new ConflictException('Email identity is ambiguous');
      const user =
        users[0] ||
        (await tx.user.upsert({
          where: {
            email_providerName: { email: address, providerName: 'LOCAL' },
          },
          create: {
            email: address,
            name: input.name.trim(),
            providerName: 'LOCAL',
            password: null,
            timezone: 0,
            activated: true,
            sendSuccessEmails: false,
            sendFailureEmails: false,
            sendStreakEmails: false,
          },
          update: {},
        }));
      if (user.deletedAt || !user.activated)
        throw new BadRequestException('Reviewer identity is unavailable');
      const member = await tx.userOrganization.findUnique({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: actor.organizationId,
          },
        },
      });
      if (member?.disabled)
        throw new BadRequestException('Reviewer membership is disabled');
      if (!member)
        await tx.userOrganization.create({
          data: {
            userId: user.id,
            organizationId: actor.organizationId,
            role: 'USER',
          },
        });
      const previous = await tx.agencyReviewInvitation.findMany({
        where: {
          organizationId: actor.organizationId,
          clientId: client.id,
          reviewerId: user.id,
          revokedAt: null,
        },
      });
      await tx.agencyReviewInvitation.updateMany({
        where: { id: { in: previous.map((i) => i.id) } },
        data: { revokedAt: new Date() },
      });
      await tx.agencyReviewerSession.updateMany({
        where: { invitationId: { in: previous.map((i) => i.id) } },
        data: { revokedAt: new Date() },
      });
      const inv = await tx.agencyReviewInvitation.create({
        data: {
          organizationId: actor.organizationId,
          clientId: client.id,
          reviewerId: user.id,
          reviewerName: input.name.trim(),
          email: address,
          creatorId: actor.id,
          channelIds: [...new Set(channelIds)],
          tokenHash: reviewHash(token),
          expiresAt,
        },
      });
      await this.agency.audit(
        tx,
        actor,
        'review.invitation_created',
        inv.id,
        client.id,
        { reviewerId: user.id, channelIds, expiresAt }
      );
      return inv;
    });
    try {
      await this.mail(
        address,
        'Client review invitation',
        `<p>${escapeMail(
          invitation.reviewerName
        )}, review content for ${escapeMail(
          client.name
        )}.</p><p><a href="${escapeMail(
          process.env.FRONTEND_URL!
        )}/review#invite=${token}">Open client review</a></p><p>Verify your email with a separate code. This invitation expires ${invitation.expiresAt.toISOString()}.</p>`
      );
    } catch (error) {
      await this.locked(actor.organizationId, async (tx) => {
        await tx.agencyReviewInvitation.update({
          where: { id: invitation.id },
          data: { revokedAt: new Date() },
        });
        await this.agency.audit(
          tx,
          actor,
          'review.delivery_failed',
          invitation.id,
          client.id
        );
      });
      throw error;
    }
    return this.invitationProjection(invitation);
  }
  private invitationProjection(inv: AgencyReviewInvitation) {
    return {
      id: inv.id,
      clientId: inv.clientId,
      reviewerId: inv.reviewerId,
      name: inv.reviewerName,
      email: inv.email,
      channelIds: inv.channelIds,
      expiresAt: inv.expiresAt,
      revokedAt: inv.revokedAt,
      verifiedAt: inv.verifiedAt,
      exchangedAt: inv.exchangedAt,
    };
  }
  async invitations(actor: AgencyActor, clientId: string) {
    await this.agency.admin(actor);
    await this.agency.client(actor, clientId);
    return (
      await this.db.agencyReviewInvitation.findMany({
        where: { organizationId: actor.organizationId, clientId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    ).map((i) => this.invitationProjection(i));
  }
  async revokeInvitation(actor: AgencyActor, id: string) {
    await this.agency.admin(actor);
    return this.locked(actor.organizationId, async (tx) => {
      await this.agency.admin(actor);
      const inv = await tx.agencyReviewInvitation.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!inv) throw missing();
      await tx.agencyReviewInvitation.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await tx.agencyReviewerSession.updateMany({
        where: { invitationId: id },
        data: { revokedAt: new Date() },
      });
      await this.agency.audit(
        tx,
        actor,
        'review.invitation_revoked',
        id,
        inv.clientId
      );
      return { revoked: true };
    });
  }
  async challenge(token: unknown, ip: string) {
    await this.limit('challenge-ip', ip, 80);
    if (typeof token !== 'string' || !/^rvi_[A-Za-z0-9_-]{43}$/.test(token))
      throw denied();
    await this.limit('challenge-invite', reviewHash(token), 3);
    const inv = await this.db.agencyReviewInvitation.findUnique({
      where: { tokenHash: reviewHash(token) },
    });
    if (!inv || inv.exchangedAt) throw denied();
    await this.live(inv);
    const id = randomUUID(),
      nonce = reviewSecret(),
      code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(
      Math.min(+inv.expiresAt, Date.now() + 10 * 60000)
    );
    await this.locked(inv.organizationId, async (tx) => {
      const current = await tx.agencyReviewInvitation.findUniqueOrThrow({
        where: { id: inv.id },
      });
      await this.live(current);
      if (current.exchangedAt) throw denied();
      await tx.agencyReviewChallenge.create({
        data: {
          id,
          invitationId: inv.id,
          codeHash: verificationHash(id, code),
          browserHash: reviewHash(nonce),
          expiresAt,
        },
      });
    });
    try {
      await this.mail(
        inv.email,
        'Client review verification code',
        `<p>Your client review verification code is <strong>${code}</strong>.</p><p>Enter it only in the review page you opened. It expires in ten minutes. If you did not request it, ignore this message.</p>`
      );
    } catch (error) {
      await this.db.agencyReviewChallenge.update({
        where: { id },
        data: { consumedAt: new Date() },
      });
      throw error;
    }
    return { id, nonce, expiresAt };
  }
  async verify(
    input: { challengeId: string; code: string },
    nonce: unknown,
    ip: string
  ) {
    await this.limit('verify-ip', ip, 100);
    if (
      !input ||
      typeof input.challengeId !== 'string' ||
      input.challengeId.length !== 36 ||
      typeof input.code !== 'string' ||
      !/^\d{6}$/.test(input.code) ||
      typeof nonce !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(nonce)
    )
      throw denied();
    const challenge = await this.db.agencyReviewChallenge.findUnique({
      where: { id: input.challengeId },
    });
    if (!challenge) throw denied();
    const invitation = await this.db.agencyReviewInvitation.findUnique({
      where: { id: challenge.invitationId },
    });
    if (!invitation) throw denied();
    const secret = reviewSecret();
    const result = await this.locked(invitation.organizationId, async (tx) => {
      const inv = await tx.agencyReviewInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });
      await this.live(inv);
      const ch = await tx.agencyReviewChallenge.findUniqueOrThrow({
        where: { id: challenge.id },
      });
      if (
        inv.exchangedAt ||
        ch.consumedAt ||
        +ch.expiresAt <= Date.now() ||
        ch.attempts >= 5 ||
        !safeEqual(ch.browserHash, reviewHash(nonce))
      )
        return { invalid: true };
      if (!safeEqual(ch.codeHash, verificationHash(ch.id, input.code))) {
        await tx.agencyReviewChallenge.update({
          where: { id: ch.id },
          data: {
            attempts: { increment: 1 },
            ...(ch.attempts >= 4 ? { consumedAt: new Date() } : {}),
          },
        });
        return { invalid: true };
      }
      const now = new Date();
      await tx.agencyReviewChallenge.update({
        where: { id: ch.id },
        data: { consumedAt: now },
      });
      await tx.agencyReviewInvitation.update({
        where: { id: inv.id },
        data: { verifiedAt: now, exchangedAt: now },
      });
      const session = await tx.agencyReviewerSession.create({
        data: {
          invitationId: inv.id,
          organizationId: inv.organizationId,
          clientId: inv.clientId,
          reviewerId: inv.reviewerId,
          secretHash: reviewHash(secret),
          createdAt: now,
          expiresAt: new Date(Math.min(+inv.expiresAt, +now + 86400000)),
        },
      });
      await this.agency.audit(
        tx,
        {
          type: 'user',
          id: inv.reviewerId,
          organizationId: inv.organizationId,
        },
        'review.email_verified',
        inv.id,
        inv.clientId
      );
      return { session };
    });
    if (!result.session) throw denied();
    return { session: result.session, secret };
  }
  async authenticate(secret: unknown): Promise<ReviewContext> {
    if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret))
      throw denied();
    const session = await this.db.agencyReviewerSession.findUnique({
      where: { secretHash: reviewHash(secret) },
    });
    if (!session || session.revokedAt || +session.expiresAt <= Date.now())
      throw denied();
    const invitation = await this.db.agencyReviewInvitation.findUnique({
      where: { id: session.invitationId },
    });
    if (
      !invitation ||
      invitation.organizationId !== session.organizationId ||
      invitation.clientId !== session.clientId ||
      invitation.reviewerId !== session.reviewerId
    )
      throw denied();
    await this.live(invitation, true);
    return { session, invitation, actor: this.actor(session) };
  }
  async profile(ctx: ReviewContext) {
    const client = await this.agency.client(ctx.actor, ctx.session.clientId);
    return {
      client: client.name,
      reviewer: ctx.invitation.reviewerName,
      expiresAt: ctx.session.expiresAt,
      csrf: csrfToken(ctx.session),
    };
  }
  async logout(ctx: ReviewContext) {
    await this.locked(ctx.session.organizationId, async (tx) => {
      await tx.agencyReviewerSession.update({
        where: { id: ctx.session.id },
        data: { revokedAt: new Date() },
      });
      await this.agency.audit(
        tx,
        ctx.actor,
        'review.session_closed',
        ctx.session.id,
        ctx.session.clientId
      );
    });
    return { closed: true };
  }
  private async contextMeta(ctx: ReviewContext, id: string) {
    const work = await this.db.agencyWork.findFirst({
      where: {
        id,
        organizationId: ctx.session.organizationId,
        clientId: ctx.session.clientId,
      },
    });
    if (!work) throw missing();
    if (
      !(await this.db.agencyReviewRequest.findFirst({
        where: { workId: id, reviewerId: ctx.session.reviewerId },
      }))
    )
      throw missing();
    const revision = await this.db.agencyRevision.findUniqueOrThrow({
      where: { workId_version: { workId: id, version: work.currentVersion } },
    });
    const payload = revision.payload as unknown as FrozenPayload;
    if (digest(payload) !== revision.payloadHash)
      throw new ConflictException('Review integrity check failed');
    for (const t of payload.targets)
      if (!allowsChannel(ctx.invitation.channelIds, t.channelId))
        throw missing();
    const request = await this.db.agencyReviewRequest.findUnique({
      where: { revisionId: revision.id },
    });
    let available =
      !!request &&
      request.reviewerId === ctx.session.reviewerId &&
      +request.expiresAt > Date.now() &&
      ['IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED'].includes(request.status);
    const decision =
      request?.status === 'APPROVED' &&
      (await this.db.agencyReviewDecision.findUnique({
        where: { requestId: request.id },
      }));
    if (decision && decision.reviewInvitationId)
      for (const target of payload.targets) {
        if (
          !(await this.agency.can(
            {
              type: 'user',
              id: request!.reviewerId,
              organizationId: work.organizationId,
              reviewInvitationId: decision.reviewInvitationId,
            },
            work.clientId,
            'review:decide',
            target.channelId
          ))
        )
          available = false;
      }
    for (const t of payload.targets) {
      if (
        !(await this.agency.can(
          ctx.actor,
          work.clientId,
          'review:decide',
          t.channelId
        ))
      )
        throw denied();
      const channel = await this.db.integration.findFirst({
        where: {
          id: t.channelId,
          organizationId: work.organizationId,
          customerId: work.clientId,
          deletedAt: null,
          ownershipQuarantined: false,
          disabled: false,
          refreshNeeded: false,
        },
      });
      if (
        !channel ||
        channel.internalId !== t.accountId ||
        channel.providerIdentifier !== t.provider
      )
        available = false;
    }
    return { work, revision, payload, request, available };
  }
  private async allowedIds(
    actor: AgencyActor,
    clientId: string,
    scope?: string[]
  ) {
    const rows = await this.db.integration.findMany({
      where: {
        organizationId: actor.organizationId,
        customerId: clientId,
        deletedAt: null,
        ownershipQuarantined: false,
      },
      select: { id: true },
    });
    const ids = [];
    for (const row of rows)
      if (
        (!scope?.length || scope.includes(row.id)) &&
        (await this.agency.can(
          actor,
          clientId,
          scope ? 'review:decide' : 'content:read',
          row.id
        ))
      )
        ids.push(row.id);
    return ids;
  }
  private async history(
    actor: AgencyActor,
    workId: string,
    clientId: string,
    scope?: string[]
  ) {
    const ids = await this.allowedIds(actor, clientId, scope);
    const revisions = await this.db.$queryRaw<
      { id: string; version: number }[]
    >`SELECT r.id,r.version FROM "AgencyRevision" r WHERE r."workId"=${workId} AND r."organizationId"=${actor.organizationId} AND r."clientId"=${clientId}
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'targets') t WHERE NOT (t->>'channelId'=ANY(${ids}::text[]))) ORDER BY r.version DESC LIMIT 100`;
    const comments = await this.db.agencyReviewComment.findMany({
      where: { revisionId: { in: revisions.map((r) => r.id) } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const decisions = await this.db.agencyReviewDecision.findMany({
      where: { revisionId: { in: revisions.map((r) => r.id) } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return [
      ...comments.map((c) => ({
        id: c.id,
        revision: revisions.find((r) => r.id === c.revisionId)!.version,
        kind: 'COMMENT',
        body: c.body,
        author: c.actorId === actor.id ? 'You' : 'Agency member',
        at: c.createdAt,
      })),
      ...decisions.map((d) => ({
        id: d.id,
        revision: revisions.find((r) => r.id === d.revisionId)!.version,
        kind: d.decision,
        body: d.comment,
        author: d.actorId === actor.id ? 'You' : 'Reviewer',
        at: d.createdAt,
      })),
    ]
      .sort((a, b) => +b.at - +a.at)
      .slice(0, 100)
      .reverse();
  }
  async detail(ctx: ReviewContext, id: string) {
    const meta = await this.contextMeta(ctx, id);
    if (!meta.available)
      return {
        id,
        available: false,
        message:
          'This review is superseded, canceled, expired or unavailable. Ask your agency for a fresh request.',
      };
    const view = await this.approval.view(ctx.actor, id);
    const inFlight = !!(await this.db.agencyDispatch.count({
      where: {
        workId: id,
        revisionId: meta.revision.id,
        state: { in: ['CLAIMED', 'PENDING', 'UNKNOWN'] },
      },
    }));
    return {
      id,
      available: true,
      status: meta.work.status,
      revision: {
        id: meta.revision.id,
        version: meta.revision.version,
        hash: meta.revision.payloadHash,
        timezone: meta.payload.timezone,
        targets: meta.payload.targets.map((t) => ({
          channelId: t.channelId,
          accountId: t.accountId,
          name: t.name,
          provider: t.provider,
          publishAt: t.publishAt,
          settings: reviewOptions(
            t.settings,
            this.providers.getSocialIntegration(t.provider).dto
          ),
          parts: t.parts.map((p) => ({
            id: p.id,
            message: p.message,
            delay: p.delay,
            dueAt: p.dueAt,
            media: p.media.map((m) => ({
              id: m.snapshotId,
              hash: m.hash,
              alt: m.alt,
              mime: m.mime,
            })),
          })),
        })),
      },
      canDecide: meta.request?.status === 'IN_REVIEW',
      expiresAt: meta.request!.expiresAt,
      inFlight,
      decision: view.decision
        ? { decision: view.decision.decision, comment: view.decision.comment }
        : null,
      history: await this.history(
        ctx.actor,
        id,
        meta.work.clientId,
        ctx.invitation.channelIds
      ),
    };
  }
  async list(ctx: ReviewContext, week?: string, page = '0') {
    const range = reviewWeek(week);
    if (!range || !/^\d{1,4}$/.test(page))
      throw new BadRequestException('Use a valid UTC week start and page');
    const scope = ctx.invitation.channelIds;
    const rows = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT w.id FROM "AgencyWork" w JOIN "AgencyRevision" r ON r."workId"=w.id AND r.version=w."currentVersion" JOIN "AgencyReviewRequest" q ON q."revisionId"=r.id
      WHERE w."organizationId"=${ctx.session.organizationId} AND w."clientId"=${
      ctx.session.clientId
    } AND q."reviewerId"=${
      ctx.session.reviewerId
    } AND q.status IN ('IN_REVIEW','APPROVED','CHANGES_REQUESTED') AND q."expiresAt">now()
      AND (${
        scope.length
      }=0 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'targets') t WHERE NOT (t->>'channelId'=ANY(${scope}::text[]))))
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'targets') t WHERE (t->>'publishAt')::timestamptz>=${
        range.start
      } AND (t->>'publishAt')::timestamptz<${range.end})
      ORDER BY r."createdAt" DESC,w.id LIMIT 21 OFFSET ${Number(page) * 20}`;
    const items = [];
    for (const row of rows.slice(0, 20))
      items.push(await this.detail(ctx, row.id));
    return {
      week: range.start.toISOString().slice(0, 10),
      end: range.end.toISOString(),
      page: Number(page),
      hasMore: rows.length > 20,
      items,
    };
  }
  async decide(
    ctx: ReviewContext,
    id: string,
    input: InputCommand,
    decision: 'APPROVED' | 'CHANGES_REQUESTED'
  ) {
    await this.limit('decision-session', ctx.session.id, 120);
    const meta = await this.contextMeta(ctx, id);
    if (!meta.available)
      throw new ConflictException(
        'This review is no longer current. Reload the review list.'
      );
    return this.approval.decide(ctx.actor, id, input, decision);
  }
  async bulk(
    ctx: ReviewContext,
    input: {
      items: {
        workId: string;
        decision: 'APPROVED' | 'CHANGES_REQUESTED';
        expectedRevision: number;
        operationId: string;
        comment?: string;
      }[];
    }
  ) {
    if (
      !input ||
      !Array.isArray(input.items) ||
      !input.items.length ||
      input.items.length > 30 ||
      new Set(input.items.map((i) => i?.workId)).size !== input.items.length ||
      input.items.some(
        (i) =>
          !i ||
          typeof i.workId !== 'string' ||
          !['APPROVED', 'CHANGES_REQUESTED'].includes(i.decision)
      )
    )
      throw new BadRequestException('Choose 1–30 distinct review items');
    const results = [];
    for (const item of input.items) {
      try {
        const outcome = await this.decide(
          ctx,
          item.workId,
          item,
          item.decision
        );
        results.push({ workId: item.workId, ok: true, outcome });
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        results.push({
          workId: item.workId,
          ok: false,
          status: error.getStatus(),
          message:
            error.getStatus() === 404 ? 'Review not found' : error.message,
        });
      }
    }
    return { results };
  }
  async media(
    ctx: ReviewContext,
    workId: string,
    revisionId: string,
    snapshotId: string
  ) {
    const meta = await this.contextMeta(ctx, workId);
    if (!meta.available || meta.revision.id !== revisionId) throw missing();
    return this.approval.snapshot(ctx.actor, revisionId, snapshotId);
  }
  async staffHistory(actor: AgencyActor, workId: string) {
    const view = await this.approval.view(actor, workId);
    return this.history(actor, workId, view.clientId);
  }
  async comment(
    actor: AgencyActor,
    workId: string,
    input: InputCommand,
    ctx?: ReviewContext
  ) {
    if (actor.type !== 'user')
      throw new ForbiddenException('Human review feedback required');
    if (
      typeof input?.comment !== 'string' ||
      !input.comment.trim() ||
      input.comment.length > 4000 ||
      !Number.isSafeInteger(input.expectedRevision) ||
      !/^[a-f0-9-]{36}$/i.test(input.operationId || '')
    )
      throw new BadRequestException(
        'Comment, expected revision and operation ID are required'
      );
    if (ctx) await this.limit('comment-session', ctx.session.id, 60);
    return this.locked(actor.organizationId, async (tx) => {
      const work = await tx.agencyWork.findFirst({
        where: { id: workId, organizationId: actor.organizationId },
      });
      if (!work) throw missing();
      const revision = await tx.agencyRevision.findUniqueOrThrow({
        where: { workId_version: { workId, version: work.currentVersion } },
      });
      if (ctx) {
        const meta = await this.contextMeta(ctx, workId);
        if (!meta.available)
          throw new ConflictException('Review no longer current');
      } else {
        for (const t of (revision.payload as unknown as FrozenPayload).targets)
          await this.agency.assert(
            actor,
            work.clientId,
            'draft:write',
            t.channelId
          );
      }
      const hash = digest({ workId, input });
      const prior = await tx.agencyCommand.findUnique({
        where: {
          organizationId_actorType_actorId_operationId: {
            organizationId: actor.organizationId,
            actorType: actor.type,
            actorId: actor.id,
            operationId: input.operationId,
          },
        },
      });
      if (prior) {
        if (prior.action !== 'review.comment' || prior.payloadHash !== hash)
          throw new ConflictException('Operation ID reused');
        return prior.result;
      }
      if (work.currentVersion !== input.expectedRevision)
        throw new ConflictException(
          'Revision changed. Reload before commenting.'
        );
      const c = await tx.agencyReviewComment.create({
        data: {
          organizationId: actor.organizationId,
          clientId: work.clientId,
          workId,
          revisionId: revision.id,
          actorId: actor.id,
          body: input.comment.trim(),
        },
      });
      const result = { id: c.id, revision: revision.version };
      await tx.agencyCommand.create({
        data: {
          organizationId: actor.organizationId,
          actorType: actor.type,
          actorId: actor.id,
          operationId: input.operationId,
          action: 'review.comment',
          workId,
          payloadHash: hash,
          result,
        },
      });
      await this.agency.audit(
        tx,
        actor,
        'review.comment_added',
        c.id,
        work.clientId,
        { revisionId: revision.id }
      );
      return result;
    });
  }
}
