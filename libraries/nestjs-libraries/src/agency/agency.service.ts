import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Integration, Post } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  AgencyAction,
  AgencyActor,
  actions,
  allowsChannel,
  live,
  roleActions,
  roles,
  AgencyRole,
} from './policy';

const hashSecret = (secret: string) =>
  createHash('sha256').update(secret).digest('hex');
const channelProjection = {
  id: true,
  name: true,
  providerIdentifier: true,
  customerId: true,
  disabled: true,
  ownershipQuarantined: true,
} as const;
const credentialProjection = {
  id: true,
  name: true,
  prefix: true,
  clientIds: true,
  channelIds: true,
  actions: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  lastUsedAt: true,
} as const;
const postProjection = {
  id: true,
  content: true,
  state: true,
  publishDate: true,
  clientId: true,
  integrationId: true,
  group: true,
  parentPostId: true,
  releaseId: true,
  releaseURL: true,
} as const;
const denied = () => new NotFoundException('Resource not found');

@Injectable()
export class AgencyService {
  constructor(private db: PrismaService) {}

  async membership(actor: AgencyActor) {
    if (actor.type !== 'user')
      throw new ForbiddenException('Staff access required');
    const member = await this.db.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId: actor.id,
          organizationId: actor.organizationId,
        },
      },
      include: { user: true, organization: true },
    });
    if (
      !member ||
      member.disabled ||
      !member.user.activated ||
      member.user.deletedAt ||
      member.organization.deletedAt
    ) {
      throw new UnauthorizedException('Inactive membership');
    }
    return member;
  }

  async admin(actor: AgencyActor) {
    if (actor.reviewSessionId || actor.reviewInvitationId || actor.reviewAssignment) throw new ForbiddenException('Review access cannot administer');
    const member = await this.membership(actor);
    if (!['ADMIN', 'SUPERADMIN'].includes(member.role))
      throw new ForbiddenException('Agency administration required');
    return member;
  }

  async authenticateCredential(secret: string): Promise<AgencyActor> {
    if (!/^agk_[A-Za-z0-9_-]{43}$/.test(secret))
      throw new UnauthorizedException('Invalid credential');
    const key = await this.db.agencyCredential.findUnique({
      where: { secretHash: hashSecret(secret) },
    });
    if (!key || !live(key))
      throw new UnauthorizedException('Invalid credential');
    const actor: AgencyActor = {
      type: 'credential',
      id: key.id,
      organizationId: key.organizationId,
    };
    await this.credential(actor);
    await this.db.agencyCredential.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });
    return actor;
  }

  private async credential(actor: AgencyActor, asOf = Date.now()) {
    const key = await this.db.agencyCredential.findFirst({
      where: { id: actor.id, organizationId: actor.organizationId },
    });
    if (!key || !live(key, asOf))
      throw new UnauthorizedException('Invalid credential');
    // Losing the creating administrator's membership/role invalidates its keys.
    try {
      await this.admin({
        type: 'user',
        id: key.creatorId,
        organizationId: key.organizationId,
      });
    } catch {
      throw new UnauthorizedException('Invalid credential');
    }
    return key;
  }

  async client(actor: AgencyActor, clientId: string) {
    if (typeof clientId !== 'string' || !clientId.trim()) throw denied();
    const client = await this.db.customer.findFirst({
      where: { id: clientId, orgId: actor.organizationId, deletedAt: null },
    });
    if (!client) throw denied();
    return client;
  }

  async can(
    actor: AgencyActor,
    clientId: string,
    action: AgencyAction,
    channelId?: string,
    asOf = Date.now()
  ) {
    await this.client(actor, clientId);
    if (actor.type === 'credential') {
      if (action === 'review:decide') return false;
      const key = await this.credential(actor, asOf);
      return (
        key.clientIds.includes(clientId) &&
        key.actions.includes(action) &&
        allowsChannel(key.channelIds, channelId)
      );
    }
    const member = await this.membership(actor);
    if (actor.reviewSessionId || actor.reviewInvitationId) {
      if (action !== 'review:decide' || !actor.reviewInvitationId) return false;
      if (actor.reviewSessionId) {
        const session = await this.db.agencyReviewerSession.findFirst({ where: { id: actor.reviewSessionId, invitationId: actor.reviewInvitationId, organizationId: actor.organizationId, clientId, reviewerId: actor.id, revokedAt: null, expiresAt: { gt: new Date(asOf) } } });
        if (!session) return false;
      }
      return this.invitationPermission(actor, clientId, actor.reviewInvitationId, channelId, asOf, true);
    }
    if (
      action === 'content:read' &&
      ['ADMIN', 'SUPERADMIN'].includes(member.role)
    )
      return true;
    const grants = await this.db.agencyGrant.findMany({
      where: {
        organizationId: actor.organizationId,
        userId: actor.id,
        clientId,
      },
    });
    const granted = grants.some(
      (g) =>
        live(g, asOf) &&
        (roleActions[g.role as AgencyRole] || []).includes(action) &&
        allowsChannel(g.channelIds, channelId)
    );
    if (granted) return true;
    if (action === 'review:decide' && actor.reviewAssignment) return this.invitationPermission(actor, clientId, undefined, channelId, asOf, false);
    return false;
  }

  async invitationPermission(actor: AgencyActor, clientId: string, invitationId?: string, channelId?: string, asOf = Date.now(), verified = true) {
    if (actor.type !== 'user') return false;
    const member = await this.membership(actor);
    const invitations = await this.db.agencyReviewInvitation.findMany({ where: { ...(invitationId ? { id: invitationId } : {}), organizationId: actor.organizationId, clientId, reviewerId: actor.id, email: member.user.email.trim().toLowerCase(), revokedAt: null, expiresAt: { gt: new Date(asOf) }, ...(verified ? { verifiedAt: { not: null }, exchangedAt: { not: null } } : {}) } });
    for (const invitation of invitations) {
      if (!allowsChannel(invitation.channelIds, channelId)) continue;
      try { await this.admin({ type: 'user', id: invitation.creatorId, organizationId: invitation.organizationId }); return true; } catch { /* Lost issuer rights invalidate this permission. */ }
    }
    return false;
  }

  async assert(
    actor: AgencyActor,
    clientId: string,
    action: AgencyAction,
    channelId?: string,
    asOf = Date.now()
  ) {
    if (!(await this.can(actor, clientId, action, channelId, asOf))) throw denied();
  }

  async channel(actor: AgencyActor, id: string, action: AgencyAction) {
    if (typeof id !== 'string' || !id.trim()) throw denied();
    const channel = await this.db.integration.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        deletedAt: null,
        ownershipQuarantined: false,
      },
    });
    if (!channel?.customerId) throw denied();
    await this.assert(actor, channel.customerId, action, id);
    return channel;
  }

  async clients(actor: AgencyActor) {
    // Limit in SQL before exposing client names. Administrators may read their agency.
    let ids: string[] | undefined;
    if (actor.type === 'credential') {
      const key = await this.credential(actor);
      ids = key.actions.includes('content:read') ? key.clientIds : [];
    } else {
      const member = await this.membership(actor);
      if (!['ADMIN', 'SUPERADMIN'].includes(member.role)) {
        ids = (
          await this.db.agencyGrant.findMany({
            where: { organizationId: actor.organizationId, userId: actor.id },
          })
        )
          .filter(
            (g) =>
              live(g) &&
              (roleActions[g.role as AgencyRole] || []).includes('content:read')
          )
          .map((g) => g.clientId);
      }
    }
    return this.db.customer.findMany({
      where: {
        orgId: actor.organizationId,
        deletedAt: null,
        ...(ids ? { id: { in: ids } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  async channels(actor: AgencyActor, clientId: string) {
    await this.assert(actor, clientId, 'content:read');
    const channels = await this.db.integration.findMany({
      where: {
        organizationId: actor.organizationId,
        customerId: clientId,
        deletedAt: null,
        ownershipQuarantined: false,
      },
      select: channelProjection,
    });
    const allowed = [];
    for (const channel of channels)
      if (await this.can(actor, clientId, 'content:read', channel.id))
        allowed.push(channel);
    return allowed;
  }

  async posts(actor: AgencyActor, clientId: string, search = '', page = 0) {
    await this.assert(actor, clientId, 'content:read');
    const channelIds = (await this.channels(actor, clientId)).map((c) => c.id);
    const where: Prisma.PostWhereInput = {
      organizationId: actor.organizationId,
      clientId,
      integrationId: { in: channelIds },
      ownershipQuarantined: false,
      deletedAt: null,
      ...(search
        ? { content: { contains: search.slice(0, 200), mode: 'insensitive' } }
        : {}),
    };
    const [items, count] = await this.db.$transaction([
      this.db.post.findMany({
        where,
        select: postProjection,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 50,
        skip: Math.min(Math.max(page, 0), 10000) * 50,
      }),
      this.db.post.count({ where }),
    ]);
    return { items, count };
  }

  async post(
    actor: AgencyActor,
    id: string,
    action: AgencyAction = 'content:read'
  ) {
    const post = await this.db.post.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        ownershipQuarantined: false,
        deletedAt: null,
      },
    });
    if (!post?.clientId) throw denied();
    await this.channel(actor, post.integrationId, action);
    await this.assert(actor, post.clientId, action, post.integrationId);
    return post;
  }

  async postView(actor: AgencyActor, id: string) {
    const post = await this.post(actor, id);
    return Object.fromEntries(
      Object.keys(postProjection).map((key) => [key, post[key as keyof Post]])
    );
  }

  async validateDraft(actor: AgencyActor, orgId: string, body: any) {
    if (orgId !== actor.organizationId) throw denied();
    if (
      body.tags?.length ||
      body.order ||
      body.inter ||
      body.shortLink ||
      body.republish ||
      body.type !== 'draft'
    ) {
      throw new BadRequestException(
        'This operation is unavailable until its agency policy is supported'
      );
    }
    if (!body.posts?.length || body.posts.length > 20)
      throw new BadRequestException('Choose 1–20 targets');
    let clientId: string | undefined;
    for (const target of body.posts) {
      const channel = await this.channel(
        actor,
        target.integration.id,
        'draft:write'
      );
      if (channel.disabled || channel.refreshNeeded)
        throw new BadRequestException('Channel unavailable');
      if (clientId && clientId !== channel.customerId)
        throw new BadRequestException('Targets must belong to one client');
      clientId = channel.customerId!;
      if (body.type !== 'draft')
        await this.assert(actor, clientId, 'publish:schedule', channel.id);
      if (target.settings?.__type !== channel.providerIdentifier)
        throw new BadRequestException('Provider does not match the channel');
      if (target.group) {
        const members = await this.db.post.findMany({
          where: { group: target.group },
        });
        if (
          !members.length ||
          members.some(
            (p) =>
              p.organizationId !== orgId ||
              p.clientId !== clientId ||
              p.integrationId !== channel.id ||
              p.ownershipQuarantined ||
              p.state !== 'DRAFT'
          )
        )
          throw denied();
      }
      for (const value of target.value) {
        if (value.id) {
          const old = await this.post(actor, value.id, 'draft:write');
          if (old.clientId !== clientId || old.integrationId !== channel.id)
            throw denied();
          if (old.state !== 'DRAFT')
            throw new BadRequestException(
              'This post was already published or queued'
            );
        }
        const images = [];
        for (const image of value.image || []) {
          const media = await this.media(actor, image.id);
          if (media.clientId !== clientId || media.status !== 'ready')
            throw denied();
          // Always use persisted URLs, never arbitrary supplied fetch destinations.
          images.push({ id: media.id, path: media.path, alt: media.alt || '' });
        }
        if (images.length && body.type !== 'draft')
          throw new BadRequestException(
            'Media publication awaits bounded provider access in Phase 2'
          );
        value.image = images;
      }
    }
    return clientId!;
  }

  async bindPosts(
    actor: AgencyActor,
    clientId: string,
    ids: string[],
    scheduled = false
  ) {
    await this.db.$transaction(async (tx) => {
      await this.lockPolicy(tx, actor.organizationId);
      await tx.post.updateMany({
        where: { id: { in: ids }, organizationId: actor.organizationId },
        data: {
          clientId,
          agencyActorType: actor.type,
          agencyActorId: actor.id,
          ownershipQuarantined: false,
        },
      });
      await this.audit(
        tx,
        actor,
        scheduled ? 'publication.queued' : 'draft.saved',
        ids[0],
        clientId
      );
    });
  }

  async assertDispatch(_integration: Integration, _posts: Post[]): Promise<never> {
    throw new ForbiddenException('An approved immutable dispatch claim is required');
  }

  async lockPolicy(tx: Prisma.TransactionClient, orgId: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'agency-policy:' + orgId}, 0))::text`;
  }

  async media(actor: AgencyActor, id: string) {
    if (typeof id !== 'string' || !id.trim()) throw denied();
    const media = await this.db.media.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        ownershipQuarantined: false,
        deletedAt: null,
      },
    });
    if (!media?.clientId) throw denied();
    await this.assert(actor, media.clientId, 'content:read');
    return media;
  }

  async mediaPath(actor: AgencyActor, path: string) {
    if (process.env.STORAGE_PROVIDER !== 'local') throw denied();
    const media = await this.db.media.findFirst({
      where: {
        organizationId: actor.organizationId,
        ownershipQuarantined: false,
        deletedAt: null,
        path: `${process.env.FRONTEND_URL}/uploads/${path}`,
      },
    });
    if (!media) throw denied();
    await this.media(actor, media.id);
    return { allowed: true };
  }

  async audit(
    tx: Prisma.TransactionClient,
    actor: AgencyActor,
    action: string,
    resourceId: string,
    clientId?: string,
    metadata: Prisma.InputJsonObject = {}
  ) {
    // Callers provide a deliberately small fixed projection, never request bodies/secrets.
    return tx.agencyAudit.create({
      data: {
        organizationId: actor.organizationId,
        actorType: actor.type,
        actorId: actor.id,
        action,
        resourceId,
        clientId,
        metadata,
      },
    });
  }

  async createClient(actor: AgencyActor, name: string) {
    await this.admin(actor);
    if (typeof name !== 'string' || !name.trim() || name.length > 100)
      throw new BadRequestException(
        'Client name required (maximum 100 characters)'
      );
    return this.db.$transaction(async (tx) => {
      await this.lockPolicy(tx, actor.organizationId);
      await this.admin(actor);
      const client = await tx.customer.create({
        data: { orgId: actor.organizationId, name: name.trim() },
        select: { id: true, name: true },
      });
      await this.audit(tx, actor, 'client.created', client.id, client.id);
      return client;
    });
  }

  async management(actor: AgencyActor) {
    await this.admin(actor);
    const org = actor.organizationId;
    const [
      members,
      grants,
      channels,
      credentials,
      audits,
      media,
      quarantinedPosts,
    ] = await this.db.$transaction([
      this.db.userOrganization.findMany({
        where: { organizationId: org },
        select: {
          userId: true,
          role: true,
          disabled: true,
          user: { select: { email: true, name: true } },
        },
      }),
      this.db.agencyGrant.findMany({ where: { organizationId: org } }),
      this.db.integration.findMany({
        where: { organizationId: org, deletedAt: null },
        select: channelProjection,
      }),
      this.db.agencyCredential.findMany({
        where: { organizationId: org },
        select: credentialProjection,
      }),
      this.db.agencyAudit.findMany({
        where: { organizationId: org },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.db.media.findMany({
        where: {
          organizationId: org,
          ownershipQuarantined: true,
          deletedAt: null,
        },
        select: { id: true, name: true, status: true },
      }),
      this.db.post.findMany({
        where: {
          organizationId: org,
          ownershipQuarantined: true,
          deletedAt: null,
        },
        select: { id: true, group: true },
        take: 100,
      }),
    ]);
    return {
      members,
      grants,
      channels,
      credentials,
      audits,
      quarantinedMedia: media,
      quarantinedPosts,
      legacyCredentials: 'disabled',
    };
  }

  private async validateChannels(
    actor: AgencyActor,
    clientIds: string[],
    channelIds: string[]
  ) {
    if (
      !Array.isArray(clientIds) ||
      !clientIds.length ||
      clientIds.length > 100 ||
      clientIds.some((id) => typeof id !== 'string') ||
      !Array.isArray(channelIds) ||
      channelIds.length > 200 ||
      channelIds.some((id) => typeof id !== 'string')
    )
      throw new BadRequestException(
        'Explicit clients and channel IDs required'
      );
    for (const id of clientIds) await this.client(actor, id);
    for (const id of channelIds) {
      const channel = await this.db.integration.findFirst({
        where: {
          id,
          organizationId: actor.organizationId,
          customerId: { in: clientIds },
          ownershipQuarantined: false,
          deletedAt: null,
        },
      });
      if (!channel) throw denied();
    }
  }

  private expiry(input: unknown, maxDays: number, required = false) {
    if (!input && !required) return null;
    const expiry = new Date(String(input));
    if (
      !Number.isFinite(+expiry) ||
      +expiry <= Date.now() ||
      +expiry > Date.now() + maxDays * 86400000
    )
      throw new BadRequestException(`Expiry must be within ${maxDays} days`);
    return expiry;
  }

  async grant(
    actor: AgencyActor,
    input: {
      userId: string;
      clientId: string;
      role: string;
      channelIds?: string[];
      expiresAt?: string;
    }
  ) {
    await this.admin(actor);
    if (typeof input.userId !== 'string' || !input.userId.trim())
      throw new BadRequestException('Staff user ID required');
    if (!(roles as readonly string[]).includes(input.role))
      throw new BadRequestException('Choose an explicit agency role');
    await this.membership({
      type: 'user',
      id: input.userId,
      organizationId: actor.organizationId,
    });
    await this.validateChannels(
      actor,
      [input.clientId],
      input.channelIds || []
    );
    const expiresAt = this.expiry(input.expiresAt, 365);
    return this.db.$transaction(async (tx) => {
      await this.lockPolicy(tx, actor.organizationId);
      await this.admin(actor);
      const grant = await tx.agencyGrant.upsert({
        where: {
          organizationId_userId_clientId_role: {
            organizationId: actor.organizationId,
            userId: input.userId,
            clientId: input.clientId,
            role: input.role,
          },
        },
        create: {
          organizationId: actor.organizationId,
          userId: input.userId,
          clientId: input.clientId,
          role: input.role,
          channelIds: input.channelIds || [],
          expiresAt,
        },
        update: {
          channelIds: input.channelIds || [],
          expiresAt,
          revokedAt: null,
        },
      });
      await this.audit(tx, actor, 'grant.assigned', grant.id, grant.clientId, {
        userId: grant.userId,
        role: grant.role,
        channelIds: grant.channelIds,
      });
      return grant;
    });
  }

  async revokeGrant(actor: AgencyActor, id: string) {
    await this.admin(actor);
    const grant = await this.db.agencyGrant.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!grant) throw denied();
    await this.db.$transaction(async (tx) => {
      await this.lockPolicy(tx, actor.organizationId);
      await this.admin(actor);
      await tx.agencyGrant.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, actor, 'grant.revoked', id, grant.clientId);
    });
    return { revoked: true };
  }

  async createCredential(
    actor: AgencyActor,
    input: {
      name: string;
      clientIds: string[];
      channelIds?: string[];
      actions?: string[];
      expiresAt: string;
    }
  ) {
    await this.admin(actor);
    await this.validateChannels(actor, input.clientIds, input.channelIds || []);
    const scopes = input.actions || ['content:read', 'draft:write'];
    if (
      !Array.isArray(scopes) ||
      !scopes.length ||
      scopes.some((a) => !(actions as readonly string[]).includes(a) || a === 'review:decide')
    )
      throw new BadRequestException('Unsupported credential action');
    if (
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 100
    )
      throw new BadRequestException('Credential name required');
    const expiresAt = this.expiry(input.expiresAt, 90, true)!;
    const secret = 'agk_' + randomBytes(32).toString('base64url');
    const credential = await this.db.$transaction(async (tx) => {
      await this.lockPolicy(tx, actor.organizationId);
      await this.admin(actor);
      const key = await tx.agencyCredential.create({
        data: {
          organizationId: actor.organizationId,
          creatorId: actor.id,
          name: input.name.trim(),
          secretHash: hashSecret(secret),
          prefix: secret.slice(0, 12),
          clientIds: [...new Set(input.clientIds)],
          channelIds: [...new Set(input.channelIds || [])],
          actions: [...new Set(scopes)],
          expiresAt,
        },
        select: credentialProjection,
      });
      await this.audit(tx, actor, 'credential.created', key.id, undefined, {
        clientIds: key.clientIds,
        actions: key.actions,
      });
      return key;
    });
    return { ...credential, secret };
  }

  async revokeCredential(actor: AgencyActor, id: string) {
    await this.admin(actor);
    const key = await this.db.agencyCredential.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!key) throw denied();
    await this.db.$transaction(async (tx) => {
      await this.lockPolicy(tx, actor.organizationId);
      await this.admin(actor);
      await tx.agencyCredential.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, actor, 'credential.revoked', id);
    });
    return { revoked: true };
  }

  async assignChannel(actor: AgencyActor, id: string, clientId: string) {
    await this.admin(actor);
    await this.client(actor, clientId);
    const channel = await this.db.integration.findFirst({
      where: { id, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!channel) throw denied();
    return this.db.$transaction(async (tx) => {
      await this.lockPolicy(tx, actor.organizationId);
      await this.admin(actor);
      // Reassignment must quarantine old content, not silently reinterpret its scope.
      await tx.post.updateMany({
        where: { integrationId: id, organizationId: actor.organizationId },
        data: {
          ownershipQuarantined: true,
          clientId: null,
          agencyActorId: null,
          agencyActorType: null,
        },
      });
      await tx.post.updateMany({
        where: {
          integrationId: id,
          organizationId: actor.organizationId,
          state: 'QUEUE',
        },
        data: { state: 'DRAFT' },
      });
      const result = await tx.integration.update({
        where: { id },
        data: { customerId: clientId, ownershipQuarantined: false },
        select: channelProjection,
      });
      await this.audit(tx, actor, 'channel.assigned', id, clientId);
      return result;
    });
  }

  async mapMedia(actor: AgencyActor, id: string, clientId: string) {
    await this.admin(actor);
    await this.client(actor, clientId);
    const media = await this.db.media.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        ownershipQuarantined: true,
        deletedAt: null,
      },
    });
    if (
      !media ||
      process.env.STORAGE_PROVIDER !== 'local' ||
      !media.path.startsWith(`${process.env.FRONTEND_URL}/uploads/`)
    )
      throw denied();
    return this.db.$transaction(async (tx) => {
      await this.lockPolicy(tx, actor.organizationId);
      await this.admin(actor);
      const result = await tx.media.update({
        where: { id },
        data: { clientId, ownershipQuarantined: false },
        select: { id: true, clientId: true },
      });
      await this.audit(tx, actor, 'media.mapped', id, clientId);
      return result;
    });
  }

  async mapPost(actor: AgencyActor, id: string, clientId: string) {
    await this.admin(actor);
    await this.client(actor, clientId);
    const post = await this.db.post.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        ownershipQuarantined: true,
        deletedAt: null,
      },
    });
    if (!post) throw denied();
    const group = await this.db.post.findMany({ where: { group: post.group } });
    for (const p of group) {
      const channel = await this.db.integration.findFirst({
        where: {
          id: p.integrationId,
          organizationId: actor.organizationId,
          customerId: clientId,
          ownershipQuarantined: false,
          deletedAt: null,
        },
      });
      if (
        p.organizationId !== actor.organizationId ||
        !channel ||
        p.state === 'QUEUE'
      )
        throw denied();
      for (const image of JSON.parse(p.image || '[]')) {
        const m = await this.media(actor, image.id);
        if (m.clientId !== clientId) throw denied();
      }
    }
    return this.db.$transaction(async (tx) => {
      await this.lockPolicy(tx, actor.organizationId);
      await this.admin(actor);
      await tx.post.updateMany({
        where: { id: { in: group.map((p) => p.id) } },
        data: {
          clientId,
          ownershipQuarantined: false,
          agencyActorId: null,
          agencyActorType: null,
        },
      });
      await this.audit(tx, actor, 'content.mapped', id, clientId);
      return { mapped: true };
    });
  }
}
