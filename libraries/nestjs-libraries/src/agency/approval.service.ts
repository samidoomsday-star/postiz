import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Post,
  Integration,
  CreationMethod,
  State,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  realpathSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import sharp from 'sharp';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { AgencyService } from './agency.service';
import { AgencyAction, AgencyActor } from './policy';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { TemporalService } from 'nestjs-temporal-core';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { stripLinks } from '@gitroom/helpers/utils/strip.links';
import { sanitizePostContent } from '@gitroom/helpers/utils/sanitize.post.content';
import { syntheticModeEnabled } from '@gitroom/helpers/testing/synthetic-mode';
import { activityInfo } from '@temporalio/activity';
import {
  digest,
  bytesHash,
  FrozenPayload,
  FrozenTarget,
  FrozenPart,
  assetCapability,
  verifyAssetCapability,
} from './revision';

const missing = () => new NotFoundException('Resource not found');
class MediaChanged extends ConflictException {
  constructor(readonly revisionId: string) {
    super('Media changed; create and review a new revision');
  }
}
type Command = {
  expectedRevision: number;
  operationId: string;
  reviewerId?: string;
  expiresAt?: string;
  comment?: string;
};
type Claim = {
  cached: boolean;
  rows: any[];
  target: FrozenTarget;
  parts: FrozenPart[];
  integration: Integration;
  result?: any[];
};
@Injectable()
export class ApprovalService {
  constructor(
    private db: PrismaService,
    private agency: AgencyService,
    private posts: PostsService,
    private providers: IntegrationManager,
    private temporal: TemporalService
  ) {}

  private payload(revision: {
    payload: Prisma.JsonValue;
    payloadHash: string;
  }): FrozenPayload {
    if (digest(revision.payload) !== revision.payloadHash)
      throw new ConflictException('Revision integrity check failed');
    return revision.payload as unknown as FrozenPayload;
  }
  private sourceBytes(media: { path: string }) {
    if (process.env.STORAGE_PROVIDER !== 'local')
      throw new BadRequestException('Private local media required');
    const url = new URL(media.path);
    if (
      url.origin !== new URL(process.env.FRONTEND_URL!).origin ||
      !url.pathname.startsWith('/uploads/')
    )
      throw new BadRequestException('Media is not privately owned');
    const base = realpathSync(process.env.UPLOAD_DIRECTORY!);
    const path = realpathSync(
      resolve(base, decodeURIComponent(url.pathname.slice('/uploads/'.length)))
    );
    if (
      !path.startsWith(base + sep) ||
      !statSync(path).isFile() ||
      statSync(path).size > 20 * 1024 * 1024
    )
      throw new BadRequestException('Unsupported private media path/size');
    return readFileSync(path);
  }
  private fingerprint(media: any) {
    return digest({
      path: media.path,
      alt: media.alt || '',
      thumbnail: media.thumbnail,
      status: media.status,
      type: media.type,
      clientId: media.clientId,
      deletedAt: media.deletedAt,
      ownershipQuarantined: media.ownershipQuarantined,
    });
  }
  private snapshotPath(fileName: string) {
    if (!/^[a-f0-9-]{36}\.(jpg|png|gif|webp|mp4|webm)$/.test(fileName))
      throw missing();
    return resolve(
      process.env.UPLOAD_DIRECTORY!,
      '.agency-revisions',
      fileName
    );
  }
  private async freeze(
    actor: AgencyActor,
    revisionId: string,
    mediaId: string,
    jpeg: boolean
  ) {
    const media = await this.agency.media(actor, mediaId);
    if (media.status !== 'ready' || media.thumbnail)
      throw new BadRequestException(
        'Use ready media without a mutable external thumbnail'
      );
    const original = this.sourceBytes(media);
    let bytes = original;
    let extension = extname(new URL(media.path).pathname)
      .slice(1)
      .toLowerCase()
      .replace('jpeg', 'jpg');
    const mimeMap = {
      jpg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      webm: 'video/webm',
    };
    if (!mimeMap[extension])
      throw new BadRequestException('Unsupported media format');
    if (
      jpeg &&
      mimeMap[extension].startsWith('image/') &&
      extension !== 'jpg'
    ) {
      bytes = await sharp(original).jpeg().toBuffer();
      extension = 'jpg';
    }
    const id = randomUUID();
    const fileName = id + '.' + extension;
    mkdirSync(resolve(process.env.UPLOAD_DIRECTORY!, '.agency-revisions'), {
      recursive: true,
      mode: 0o700,
    });
    writeFileSync(this.snapshotPath(fileName), bytes, {
      flag: 'wx',
      mode: 0o400,
    });
    return {
      id,
      organizationId: actor.organizationId,
      clientId: media.clientId!,
      revisionId,
      sourceMediaId: mediaId,
      sourceHash: bytesHash(original),
      sourceFingerprint: this.fingerprint(media),
      contentHash: bytesHash(bytes),
      fileName,
      mime: mimeMap[extension] as string,
      size: bytes.length,
    };
  }
  private async verifyMedia(revisionId: string) {
    const snapshots = await this.db.agencyMediaSnapshot.findMany({
      where: { revisionId },
    });
    for (const s of snapshots) {
      const media = await this.db.media.findFirst({
        where: {
          id: s.sourceMediaId,
          organizationId: s.organizationId,
          clientId: s.clientId,
          deletedAt: null,
          ownershipQuarantined: false,
        },
      });
      try {
        if (
          !media ||
          media.status !== 'ready' ||
          this.fingerprint(media) !== s.sourceFingerprint ||
          bytesHash(this.sourceBytes(media)) !== s.sourceHash ||
          bytesHash(readFileSync(this.snapshotPath(s.fileName))) !==
            s.contentHash
        )
          throw new MediaChanged(revisionId);
      } catch {
        throw new MediaChanged(revisionId);
      }
    }
  }
  private async revision(work: any, tx: Prisma.TransactionClient = this.db) {
    const revision = await tx.agencyRevision.findUnique({
      where: {
        workId_version: { workId: work.id, version: work.currentVersion },
      },
    });
    if (!revision) throw missing();
    this.payload(revision);
    return revision;
  }
  private async authorize(
    actor: AgencyActor,
    work: any,
    payload: FrozenPayload,
    action: AgencyAction,
    asOf = Date.now()
  ) {
    if (work.organizationId !== actor.organizationId) throw missing();
    for (const target of payload.targets)
      await this.agency.assert(
        actor,
        work.clientId,
        action,
        target.channelId,
        asOf
      );
  }
  private async assertTargets(work: any, payload: FrozenPayload) {
    for (const target of payload.targets) {
      const channel = await this.db.integration.findFirst({
        where: {
          id: target.channelId,
          organizationId: work.organizationId,
          customerId: work.clientId,
          ownershipQuarantined: false,
          deletedAt: null,
          disabled: false,
          refreshNeeded: false,
        },
      });
      if (
        !channel ||
        channel.internalId !== target.accountId ||
        channel.providerIdentifier !== target.provider
      )
        throw new ConflictException(
          'Channel ownership/account changed; review a new revision'
        );
    }
  }
  private async locked<T>(
    orgId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await this.agency.lockPolicy(tx, orgId);
          return fn(tx);
        },
        { maxWait: 15000, timeout: 20000 }
      );
    } catch (error) {
      if (error instanceof MediaChanged)
        await this.db.$transaction(async (tx) => {
          await this.agency.lockPolicy(tx, orgId);
          const rev = await tx.agencyRevision.findUnique({
            where: { id: error.revisionId },
          });
          if (!rev || rev.organizationId !== orgId) return;
          await tx.agencyWork.updateMany({
            where: {
              id: rev.workId,
              currentVersion: rev.version,
              status: { in: ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED'] },
            },
            data: { status: 'INVALIDATED' },
          });
          await tx.agencyReviewRequest.updateMany({
            where: { revisionId: rev.id },
            data: { status: 'INVALIDATED' },
          });
          const ready = await tx.agencyDispatch.findMany({
            where: { revisionId: rev.id, state: 'READY' },
            select: { postId: true },
          });
          await tx.post.updateMany({
            where: { id: { in: ready.map((r) => r.postId) }, state: 'QUEUE' },
            data: { state: 'DRAFT' },
          });
        });
      throw error;
    }
  }

  async save(
    actor: AgencyActor,
    body: any,
    workId?: string,
    command?: Command
  ) {
    const input = plainToInstance(CreatePostDto, body);
    if ((await validate(input)).length)
      throw new BadRequestException('Invalid draft payload');
    body = input;
    if (body.type !== 'draft')
      throw new BadRequestException(
        'Create a draft, review its exact revision, then schedule it'
      );
    if (workId) {
      const work = await this.db.agencyWork.findFirst({
        where: { id: workId, organizationId: actor.organizationId },
      });
      if (!work) throw missing();
      await this.authorize(
        actor,
        work,
        this.payload(await this.revision(work)),
        'draft:write'
      );
      this.validateCommand(command!);
    }
    // Old IDs are checked for scope, then never reused by a new immutable revision.
    for (const target of body.posts || [])
      for (const value of target.value || [])
        if (value.id) {
          const old = await this.agency.post(actor, value.id, 'draft:write');
          if (old.integrationId !== target.integration.id) throw missing();
          if (workId && old.agencyWorkId !== workId) throw missing();
        }
    const clean = {
      ...body,
      posts: (body.posts || []).map((t) => ({
        ...t,
        group: undefined,
        value: t.value.map((v) => ({ ...v, id: undefined })),
      })),
    };
    const clientId = await this.agency.validateDraft(
      actor,
      actor.organizationId,
      clean
    );
    const checks = await this.posts.validatePosts(
      actor.organizationId,
      clean.posts
    );
    if (
      checks.some(
        (p) => p.emptyContent || !p.valid || p.errors !== true || p.tooLong
      )
    )
      throw new BadRequestException('Content or platform settings are invalid');
    let timezone = String(body.displayTimezone || 'Asia/Dhaka');
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('Invalid display timezone');
    }
    if (
      new Set(clean.posts.map((t) => t.integration.id)).size !==
      clean.posts.length
    )
      throw new BadRequestException(
        'Duplicate channel targets are not allowed'
      );
    const revisionId = randomUUID();
    const newWorkId = workId || randomUUID();
    const snapshots: any[] = [];
    const targets: FrozenTarget[] = [];
    try {
      for (const t of clean.posts) {
        const channel = await this.agency.channel(
          actor,
          t.integration.id,
          'draft:write'
        );
        const provider = this.providers.getSocialIntegration(
          channel.providerIdentifier
        );
        if (t.value.length > 10 || t.value.some((v) => v.image.length > 8))
          throw new BadRequestException('Too many parts/media');
        if (t.value.some((v) => v.delay > 0) && !provider.comment)
          throw new BadRequestException(
            'This platform cannot safely publish delayed parts'
          );
        const at = new Date(t.date || body.date);
        if (!Number.isFinite(+at))
          throw new BadRequestException('Proposed UTC time required');
        let due = +at;
        const parts: FrozenPart[] = [];
        for (const v of t.value) {
          const content = provider.stripLinks?.()
            ? stripLinks(sanitizePostContent(v.content))
            : sanitizePostContent(v.content);
          if (
            !Number.isFinite(v.delay || 0) ||
            (v.delay || 0) < 0 ||
            (v.delay || 0) > 10080
          )
            throw new BadRequestException('Invalid part delay');
          if (parts.length) due += (v.delay || 0) * 60000;
          const media = [];
          for (const image of v.image) {
            const snap = await this.freeze(
              actor,
              revisionId,
              image.id,
              !!provider.convertToJPEG
            );
            snapshots.push(snap);
            if (
              snapshots.length > 100 ||
              snapshots.reduce((n, item) => n + item.size, 0) >
                100 * 1024 * 1024
            )
              throw new BadRequestException(
                'Revision media exceeds 100 assets or 100 MB'
              );
            const source = await this.agency.media(actor, image.id);
            media.push({
              snapshotId: snap.id,
              sourceMediaId: source.id,
              sourcePath: source.path,
              hash: snap.contentHash,
              mime: snap.mime,
              alt: source.alt || '',
            });
          }
          parts.push({
            id: randomUUID(),
            content,
            message: stripHtmlValidation(
              provider.editor,
              content,
              true,
              false,
              !/<\/?[a-z][\s\S]*>/i.test(content),
              provider.mentionFormat,
              !!provider.inlineImages?.(t.settings)
            ),
            delay: v.delay || 0,
            dueAt: new Date(due).toISOString(),
            media,
          });
        }
        targets.push({
          channelId: channel.id,
          accountId: channel.internalId,
          provider: channel.providerIdentifier,
          name: channel.name,
          editor: provider.editor,
          settings: JSON.parse(JSON.stringify(t.settings)),
          publishAt: at.toISOString(),
          parts,
        });
      }
      const payload: FrozenPayload = { timezone, targets };
      const perform = async (tx: Prisma.TransactionClient) => {
        // Revalidate after taking the policy lock, including grant and source changes.
        await this.agency.validateDraft(actor, actor.organizationId, clean);
        let work =
          workId &&
          (await tx.agencyWork.findFirst({
            where: { id: workId, organizationId: actor.organizationId },
          }));
        if (work && work.clientId !== clientId)
          throw new ConflictException(
            'A work item cannot move between clients'
          );
        const version = work ? work.currentVersion + 1 : 1;
        if (!work)
          work = await tx.agencyWork.create({
            data: {
              id: newWorkId,
              organizationId: actor.organizationId,
              clientId,
            },
          });
        if (workId) {
          await tx.agencyReviewRequest.updateMany({
            where: {
              workId,
              status: { in: ['IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED'] },
            },
            data: { status: 'SUPERSEDED' },
          });
          const claimed = await tx.agencyDispatch.findMany({
            where: {
              workId,
              state: { in: ['CLAIMED', 'PENDING', 'CONFIRMED', 'UNKNOWN'] },
            },
            select: { postId: true },
          });
          await tx.post.updateMany({
            where: {
              agencyWorkId: workId,
              state: 'QUEUE',
              id: { notIn: claimed.map((d) => d.postId) },
            },
            data: { state: 'DRAFT' },
          });
        }
        await tx.agencyRevision.create({
          data: {
            id: revisionId,
            workId: newWorkId,
            organizationId: actor.organizationId,
            clientId,
            version,
            payload: payload as unknown as Prisma.InputJsonValue,
            payloadHash: digest(payload),
            actorType: actor.type,
            actorId: actor.id,
          },
        });
        for (const snapshot of snapshots) {
          const source = await this.agency.media(actor, snapshot.sourceMediaId);
          if (
            this.fingerprint(source) !== snapshot.sourceFingerprint ||
            bytesHash(this.sourceBytes(source)) !== snapshot.sourceHash
          )
            throw new ConflictException('Media changed while saving');
          await tx.agencyMediaSnapshot.create({ data: snapshot });
        }
        for (const target of targets) {
          const group = randomUUID();
          let parentPostId: string | null = null;
          for (const part of target.parts) {
            await tx.post.create({
              data: {
                id: part.id,
                agencyWorkId: newWorkId,
                agencyRevisionId: revisionId,
                organizationId: actor.organizationId,
                clientId,
                agencyActorType: actor.type,
                agencyActorId: actor.id,
                ownershipQuarantined: false,
                integrationId: target.channelId,
                state: 'DRAFT',
                group,
                batchId: newWorkId,
                parentPostId,
                content: part.content,
                publishDate: new Date(target.publishAt),
                delay: part.delay,
                image: JSON.stringify(
                  part.media.map((m) => ({
                    id: m.sourceMediaId,
                    path: `${process.env.FRONTEND_URL}/uploads/immutable-preview`,
                    alt: m.alt,
                  }))
                ),
                settings: JSON.stringify(target.settings),
                creationMethod:
                  actor.type === 'user'
                    ? CreationMethod.WEB
                    : CreationMethod.API,
              },
            });
            parentPostId = part.id;
          }
        }
        await tx.agencyWork.update({
          where: { id: newWorkId },
          data: { currentVersion: version, status: 'DRAFT' },
        });
        await this.agency.audit(
          tx,
          actor,
          'revision.created',
          revisionId,
          clientId,
          { workId: newWorkId, version, hash: digest(payload) }
        );
        return targets.map((t) => ({
          postId: t.parts[0].id,
          integration: t.channelId,
          workId: newWorkId,
          revisionId,
          revision: version,
        }));
      };
      if (workId)
        return await this.command(
          actor,
          workId,
          'edit',
          { ...command!, body: clean } as any,
          perform
        );
      return await this.locked(actor.organizationId, perform);
    } finally {
      if (
        !(await this.db.agencyRevision.findUnique({
          where: { id: revisionId },
        }))
      )
        for (const s of snapshots) {
          try {
            unlinkSync(this.snapshotPath(s.fileName));
          } catch {
            /* failed uncommitted copies are not served */
          }
        }
    }
  }

  private validateCommand(input: Command) {
    if (
      !input ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1 ||
      !/^[a-f0-9-]{36}$/i.test(input.operationId || '')
    )
      throw new BadRequestException(
        'expectedRevision and UUID operationId required'
      );
  }
  private async command(
    actor: AgencyActor,
    workId: string,
    action: string,
    input: Command,
    operation: (
      tx: Prisma.TransactionClient,
      work: any,
      revision: any
    ) => Promise<any>
  ) {
    this.validateCommand(input);
    const requestHash = digest({ workId, action, input });
    return this.locked(actor.organizationId, async (tx) => {
      const work = await tx.agencyWork.findFirst({
        where: { id: workId, organizationId: actor.organizationId },
      });
      if (!work) throw missing();
      const revision = await this.revision(work, tx);
      // Authorization precedes idempotency projection; revocation never revives a command.
      if (action === 'approve' || action === 'changes')
        await this.authorize(
          actor,
          work,
          this.payload(revision),
          'review:decide'
        );
      else if (action === 'revoke' || action === 'cancel') {
        let admin = false;
        try {
          await this.agency.admin(actor);
          admin = true;
        } catch {
          /* explicit publisher/reviewer below */
        }
        if (!admin)
          await this.authorize(
            actor,
            work,
            this.payload(revision),
            action === 'revoke' ? 'review:decide' : 'publish:schedule'
          );
      } else
        await this.authorize(
          actor,
          work,
          this.payload(revision),
          action === 'schedule' ? 'publish:schedule' : 'draft:write'
        );
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
        if (prior.payloadHash !== requestHash)
          throw new ConflictException(
            'Operation ID reused for a different command'
          );
        return prior.result;
      }
      if (work.currentVersion !== input.expectedRevision)
        throw new ConflictException(
          'Revision changed; reload the current work item'
        );
      const result = await operation(tx, work, revision);
      await tx.agencyCommand.create({
        data: {
          organizationId: actor.organizationId,
          actorType: actor.type,
          actorId: actor.id,
          operationId: input.operationId,
          action,
          workId,
          payloadHash: requestHash,
          result,
        },
      });
      return result;
    });
  }
  async submit(actor: AgencyActor, workId: string, input: Command) {
    return this.command(
      actor,
      workId,
      'submit',
      input,
      async (tx, work, revision) => {
        if (work.status !== 'DRAFT')
          throw new ConflictException(
            'Only a new draft revision can enter review'
          );
        const payload = this.payload(revision);
        await this.assertTargets(work, payload);
        await this.verifyMedia(revision.id);
        if (payload.targets.some((t) => +new Date(t.publishAt) <= Date.now()))
          throw new ConflictException(
            'Proposed time passed; create a new revision'
          );
        if (!input.reviewerId)
          throw new BadRequestException('Designated reviewer required');
        const reviewer: AgencyActor = {
          type: 'user',
          id: input.reviewerId,
          organizationId: actor.organizationId,
          reviewAssignment: true,
        };
        await this.authorize(reviewer, work, payload, 'review:decide');
        const expiresAt = input.expiresAt
          ? new Date(input.expiresAt)
          : new Date(Date.now() + 7 * 86400000);
        if (
          !Number.isFinite(+expiresAt) ||
          +expiresAt <= Date.now() ||
          +expiresAt > Date.now() + 7 * 86400000
        )
          throw new BadRequestException(
            'Review expiry must be within seven days'
          );
        const request = await tx.agencyReviewRequest.create({
          data: {
            workId,
            revisionId: revision.id,
            reviewerId: input.reviewerId,
            expiresAt,
          },
        });
        await tx.agencyWork.update({
          where: { id: workId },
          data: { status: 'IN_REVIEW' },
        });
        await this.agency.audit(
          tx,
          actor,
          'review.submitted',
          request.id,
          work.clientId,
          { revisionId: revision.id, hash: revision.payloadHash }
        );
        return {
          workId,
          revision: work.currentVersion,
          requestId: request.id,
          status: 'IN_REVIEW',
        };
      }
    );
  }
  async decide(
    actor: AgencyActor,
    workId: string,
    input: Command,
    decision: 'APPROVED' | 'CHANGES_REQUESTED'
  ) {
    if (actor.type !== 'user')
      throw new ForbiddenException('Automation cannot approve');
    if (
      decision === 'CHANGES_REQUESTED' &&
      (typeof input.comment !== 'string' ||
        !input.comment.trim() ||
        input.comment.length > 4000)
    )
      throw new BadRequestException('A changes-request comment is required');
    return this.command(
      actor,
      workId,
      decision === 'APPROVED' ? 'approve' : 'changes',
      input,
      async (tx, work, revision) => {
        const request = await tx.agencyReviewRequest.findUnique({
          where: { revisionId: revision.id },
        });
        if (
          work.status !== 'IN_REVIEW' ||
          request?.status !== 'IN_REVIEW' ||
          request.reviewerId !== actor.id ||
          +request.expiresAt <= Date.now()
        )
          throw new ConflictException(
            'Review is not current or assigned to you'
          );
        await this.assertTargets(work, this.payload(revision));
        await this.verifyMedia(revision.id);
        const record = await tx.agencyReviewDecision.create({
          data: {
            requestId: request.id,
            revisionId: revision.id,
            payloadHash: revision.payloadHash,
            actorId: actor.id,
            reviewInvitationId: actor.reviewInvitationId || null,
            decision,
            comment: input.comment?.slice(0, 4000) || '',
          },
        });
        await tx.agencyReviewRequest.update({
          where: { id: request.id },
          data: { status: decision },
        });
        await tx.agencyWork.update({
          where: { id: workId },
          data: { status: decision },
        });
        await this.agency.audit(
          tx,
          actor,
          'review.' + decision.toLowerCase(),
          record.id,
          work.clientId,
          { revisionId: revision.id, hash: revision.payloadHash }
        );
        return {
          workId,
          revision: work.currentVersion,
          status: decision,
          decisionId: record.id,
        };
      }
    );
  }
  private async approved(
    work: any,
    revision: any,
    tx: Prisma.TransactionClient,
    asOf = Date.now()
  ) {
    const request = await tx.agencyReviewRequest.findUnique({
      where: { revisionId: revision.id },
    });
    const decision =
      request &&
      (await tx.agencyReviewDecision.findUnique({
        where: { requestId: request.id },
      }));
    if (
      !request ||
      request.status !== 'APPROVED' ||
      +request.expiresAt <= asOf ||
      decision?.decision !== 'APPROVED' ||
      decision.payloadHash !== revision.payloadHash
    )
      throw new ForbiddenException(
        'Current unexpired revision approval required'
      );
    await this.authorize(
      {
        type: 'user',
        id: request.reviewerId,
        organizationId: work.organizationId,
        ...(decision.reviewInvitationId ? { reviewInvitationId: decision.reviewInvitationId } : {}),
      },
      work,
      this.payload(revision),
      'review:decide',
      asOf
    );
  }
  async schedule(actor: AgencyActor, workId: string, input: Command) {
    const result = await this.command(
      actor,
      workId,
      'schedule',
      input,
      async (tx, work, revision) => {
        if (work.status !== 'APPROVED')
          throw new ConflictException(
            'Only the approved revision can be scheduled'
          );
        await this.approved(work, revision, tx);
        const payload = this.payload(revision);
        await this.assertTargets(work, payload);
        await this.verifyMedia(revision.id);
        if (payload.targets.some((t) => +new Date(t.publishAt) <= Date.now()))
          throw new ConflictException(
            'Proposed time passed; a new revision needs approval'
          );
        for (const target of payload.targets)
          for (let i = 0; i < target.parts.length; i++) {
            await tx.agencyDispatch.create({
              data: {
                organizationId: work.organizationId,
                clientId: work.clientId,
                workId,
                revisionId: revision.id,
                postId: target.parts[i].id,
                channelId: target.channelId,
                part: i,
                actorType: actor.type,
                actorId: actor.id,
              },
            });
          }
        await tx.post.updateMany({
          where: { agencyRevisionId: revision.id },
          data: {
            state: 'QUEUE',
            agencyActorType: actor.type,
            agencyActorId: actor.id,
          },
        });
        await tx.agencyWork.update({
          where: { id: workId },
          data: { status: 'SCHEDULED' },
        });
        await this.agency.audit(
          tx,
          actor,
          'publication.scheduled',
          workId,
          work.clientId,
          { revisionId: revision.id, hash: revision.payloadHash }
        );
        return {
          workId,
          revision: work.currentVersion,
          revisionId: revision.id,
          status: 'SCHEDULED',
          roots: payload.targets.map((t) => ({
            postId: t.parts[0].id,
            queue: t.provider.split('-')[0],
          })),
        };
      }
    );
    // Start/poke is safe to repeat: it never terminates an in-flight workflow,
    // and the unique immutable dispatch claim remains the mutation authority.
    const current = await this.db.agencyWork.findUniqueOrThrow({
      where: { id: workId },
    });
    if (
      current.currentVersion !== result.revision ||
      current.status !== 'SCHEDULED'
    )
      return { ...result, currentStatus: current.status, enqueued: false };
    let enqueued = true;
    for (const root of result.roots) {
      try {
        await this.temporal.client
          .getRawClient()
          .workflow.signalWithStart('postWorkflowV112', {
            workflowId: `post_${root.postId}`,
            taskQueue: 'main',
            signal: 'poke',
            signalArgs: [],
            workflowIdConflictPolicy: 'USE_EXISTING',
            args: [
              {
                taskQueue: root.queue,
                postId: root.postId,
                organizationId: actor.organizationId,
              },
            ],
          });
      } catch {
        enqueued = false;
      }
    }
    return { ...result, enqueued };
  }
  async revoke(
    actor: AgencyActor,
    workId: string,
    input: Command,
    cancel = false
  ) {
    return this.command(
      actor,
      workId,
      cancel ? 'cancel' : 'revoke',
      input,
      async (tx, work, revision) => {
        if (!cancel) {
          const request = await tx.agencyReviewRequest.findUnique({
            where: { revisionId: revision.id },
          });
          if (request?.reviewerId !== actor.id) await this.agency.admin(actor);
        }
        const inFlight = await tx.agencyDispatch.count({
          where: {
            revisionId: revision.id,
            state: { in: ['CLAIMED', 'PENDING', 'UNKNOWN'] },
          },
        });
        await tx.agencyWork.update({
          where: { id: workId },
          data: { status: cancel ? 'CANCELED' : 'REVOKED' },
        });
        await tx.agencyReviewRequest.updateMany({
          where: { revisionId: revision.id },
          data: { status: cancel ? 'CANCELED' : 'REVOKED' },
        });
        const unclaimed = await tx.agencyDispatch.findMany({
          where: { revisionId: revision.id, state: 'READY' },
          select: { postId: true },
        });
        await tx.post.updateMany({
          where: { id: { in: unclaimed.map((d) => d.postId) }, state: 'QUEUE' },
          data: { state: 'DRAFT' },
        });
        await this.agency.audit(
          tx,
          actor,
          cancel ? 'publication.canceled' : 'approval.revoked',
          workId,
          work.clientId,
          { revisionId: revision.id, inFlight: inFlight > 0 }
        );
        return {
          workId,
          revision: work.currentVersion,
          status: cancel ? 'CANCELED' : 'REVOKED',
          inFlight: inFlight > 0,
        };
      }
    );
  }

  async claim(
    integration: Integration,
    posts: Post[],
    stage = 'publish',
    parentId?: string
  ): Promise<Claim> {
    if (!posts.length)
      throw new ForbiddenException('Scoped revision content required');
    try {
      return await this.locked(integration.organizationId, async (tx) => {
        const first = await tx.post.findFirst({
          where: {
            id: posts[0].id,
            organizationId: integration.organizationId,
          },
        });
        if (!first?.agencyRevisionId || !first.agencyWorkId)
          throw new ForbiddenException('Legacy/unreviewed work cannot publish');
        const revision = await tx.agencyRevision.findUnique({
          where: { id: first.agencyRevisionId },
        });
        const work = await tx.agencyWork.findUnique({
          where: { id: first.agencyWorkId },
        });
        if (!revision || !work) throw missing();
        const payload = this.payload(revision);
        const target = payload.targets.find(
          (t) => t.channelId === integration.id
        );
        if (!target)
          throw new ForbiddenException(
            'Target is not in the approved revision'
          );
        const parts = posts.map((p) =>
          target.parts.find((part) => part.id === p.id)
        );
        if (
          parts.some((p) => !p) ||
          new Set(posts.map((p) => p.id)).size !== posts.length
        )
          throw new ForbiddenException('Parts are not in the approved target');
        const rows = [];
        for (const part of parts) {
          const index = target.parts.indexOf(part!);
          const row = await tx.agencyDispatch.findUnique({
            where: {
              revisionId_channelId_part_stage: {
                revisionId: revision.id,
                channelId: integration.id,
                part: index,
                stage,
              },
            },
          });
          if (row) rows.push(row);
          else if (stage === 'finalize' && parentId) {
            const parent = await tx.agencyDispatch.findFirst({
              where: {
                id: parentId,
                revisionId: revision.id,
                channelId: integration.id,
                part: index,
                stage: 'publish',
                state: 'PENDING',
              },
            });
            if (!parent)
              throw new ForbiddenException(
                'Finalization has no eligible pending parent'
              );
            rows.push(
              await tx.agencyDispatch.create({
                data: {
                  organizationId: work.organizationId,
                  clientId: work.clientId,
                  workId: work.id,
                  revisionId: revision.id,
                  postId: part!.id,
                  channelId: integration.id,
                  part: index,
                  stage,
                  actorType: parent.actorType,
                  actorId: parent.actorId,
                },
              })
            );
          } else
            throw new ForbiddenException(
              'Scheduling an approved revision is required'
            );
        }
        if (rows.every((r) => r.state === 'CONFIRMED')) {
          return {
            cached: true,
            rows,
            target,
            parts: parts as FrozenPart[],
            integration,
            result: rows.flatMap((r) => (r.result || []) as any[]),
          };
        }
        if (rows.some((r) => r.state !== 'READY'))
          throw new ForbiddenException(
            'This mutation is already claimed; reconcile its receipt before another action'
          );
        // A retry has its own execution identity. Delayed/redelivered activities
        // from an earlier attempt cannot consume the newly armed claim.
        for (const row of rows) if (row.attempt > 0) {
          let execution: string | undefined;
          try { execution = activityInfo().workflowExecution.workflowId; } catch { /* no worker context */ }
          if (execution !== `agency-retry_${row.id}_${row.attempt}`) throw new ForbiddenException('Recovery execution identity required');
        }
        if (
          work.currentVersion !== revision.version ||
          work.status !== 'SCHEDULED'
        )
          throw new ForbiddenException(
            'Revision is superseded, canceled or not scheduled'
          );
        await this.assertTargets(work, payload);
        await this.verifyMedia(revision.id);
        const claimedAt = new Date();
        await this.approved(work, revision, tx, +claimedAt);
        for (const row of rows)
          await this.authorize(
            {
              type: row.actorType as AgencyActor['type'],
              id: row.actorId,
              organizationId: row.organizationId,
            },
            work,
            payload,
            'publish:schedule',
            +claimedAt
          );
        for (const p of posts) {
          const current = await tx.post.findUnique({ where: { id: p.id } });
          const part = parts.find((part) => part!.id === p.id)!;
          if (
            !current ||
            current.deletedAt ||
            current.ownershipQuarantined ||
            current.state !== 'QUEUE' ||
            current.agencyRevisionId !== revision.id ||
            current.integrationId !== target.channelId ||
            current.clientId !== work.clientId ||
            +new Date(part!.dueAt) > +claimedAt
          )
            throw new ForbiddenException('Part is not currently eligible');
        }
        const fresh = await tx.integration.findUnique({
          where: { id: integration.id },
        });
        if (
          !fresh ||
          fresh.organizationId !== work.organizationId ||
          fresh.customerId !== work.clientId ||
          fresh.internalId !== target.accountId ||
          fresh.providerIdentifier !== target.provider ||
          fresh.disabled ||
          fresh.refreshNeeded
        )
          throw new ForbiddenException('Channel is not eligible');
        for (const row of rows)
          await tx.agencyDispatch.update({
            where: { id: row.id },
            data: { state: 'CLAIMED', claimedAt },
          });
        await this.agency.audit(
          tx,
          {
            type: rows[0].actorType as AgencyActor['type'],
            id: rows[0].actorId,
            organizationId: work.organizationId,
          },
          'dispatch.claimed',
          rows[0].id,
          work.clientId,
          {
            revisionId: revision.id,
            hash: revision.payloadHash,
            stage,
            parts: rows.map((r) => r.part),
          }
        );
        return {
          cached: false,
          rows,
          target,
          parts: parts as FrozenPart[],
          integration: fresh,
        };
      });
    } catch (error) {
      // Retained workflow versions already understand this nonretryable type.
      // Policy denials must terminate rather than enter provider retry timers.
      if (error instanceof HttpException && error.getStatus() < 500)
        throw new BadBody(
          integration.providerIdentifier,
          '{}',
          '{}',
          'Agency dispatch blocked: ' + error.message
        );
      throw error;
    }
  }
  async projectState(postId: string, state: State, err?: unknown) {
    const post = await this.db.post.findUnique({ where: { id: postId } });
    if (!post?.agencyRevisionId) return false;
    await this.locked(post.organizationId, async (tx) => {
      const dispatch = await tx.agencyDispatch.findFirst({
        where: { postId, stage: 'publish' },
      });
      if (dispatch?.state === 'CONFIRMED') {
        await tx.post.update({
          where: { id: postId },
          data: {
            state: 'PUBLISHED',
            releaseId: dispatch.providerId,
            releaseURL: dispatch.providerUrl,
            error: null,
          },
        });
      } else if (state === 'ERROR') {
        const current = await tx.post.findUniqueOrThrow({
          where: { id: postId },
        });
        if (current.state === 'QUEUE' && !(dispatch?.attempt > 0 && ['READY','CLAIMED'].includes(dispatch.state)))
          await tx.post.update({
            where: { id: postId },
            data: {
              state: 'ERROR',
              error:
                typeof err === 'string'
                  ? err.slice(0, 1000)
                  : 'Publishing did not return a confirmed receipt',
            },
          });
      }
      // Only the immutable claim receipt can project published state. A stale
      // workflow cannot requeue, overwrite or falsely publish this revision.
    });
    return true;
  }
  async projectReceipt(postId: string, remoteId: string, url: string) {
    const post = await this.db.post.findUnique({ where: { id: postId } });
    if (!post?.agencyRevisionId) return false;
    const receipt = await this.db.agencyDispatch.findFirst({
      where: { postId, stage: 'publish', state: 'CONFIRMED' },
    });
    if (
      !receipt ||
      receipt.providerId !== remoteId ||
      receipt.providerUrl !== url
    )
      throw new ForbiddenException('Confirmed immutable receipt required');
    await this.projectState(postId, State.PUBLISHED);
    return true;
  }
  async providerParts(claim: Claim) {
    return claim.parts.map((part) => {
      const dispatch = claim.rows.find((r) => r.postId === part.id)!;
      return {
        id: part.id,
        message: part.message,
        settings: claim.target.settings,
        media: part.media.map((m) => ({
          id: m.sourceMediaId,
          alt: m.alt,
          path: `${process.env.NEXT_PUBLIC_BACKEND_URL}/agency/assets/${
            m.snapshotId
          }?cap=${assetCapability(m.snapshotId, dispatch.id)}`,
        })),
      };
    });
  }
  async commentParent(
    claim: Claim,
    rootRemoteId: string,
    previousRemoteId?: string
  ) {
    const root = await this.db.agencyDispatch.findFirst({
      where: {
        revisionId: claim.rows[0].revisionId,
        channelId: claim.target.channelId,
        part: 0,
        stage: 'publish',
        state: 'CONFIRMED',
      },
    });
    const previous =
      claim.rows[0].part > 1 &&
      (await this.db.agencyDispatch.findFirst({
        where: {
          revisionId: claim.rows[0].revisionId,
          channelId: claim.target.channelId,
          part: claim.rows[0].part - 1,
          stage: 'publish',
          state: 'CONFIRMED',
        },
      }));
    if (
      root?.providerId !== rootRemoteId ||
      (claim.rows[0].part > 1 &&
        (!previous || previous.providerId !== previousRemoteId))
    )
      throw new ForbiddenException(
        'Comment parent is not the approved target receipt'
      );
  }
  async finish(claim: Claim, responses: any[]) {
    // Failure injection is opt-in synthetic-only, after a real local mutation.
    if (syntheticModeEnabled() && claim.target.settings.failReceiptWrite) {
      try {
        await this.db
          .$executeRaw`SELECT agency_intentionally_missing_receipt_function()`;
      } catch {
        throw new Error(
          'Synthetic database receipt write failed after provider acceptance'
        );
      }
    }
    await this.locked(claim.integration.organizationId, async (tx) => {
      for (const row of claim.rows) {
        const result = responses.find((r) => r.id === row.postId);
        if (!result)
          throw new Error('Provider did not return a target receipt');
        const updated = await tx.agencyDispatch.updateMany({
          where: { id: row.id, attempt: row.attempt, state: { in: ['CLAIMED','PENDING'] } },
          data: {
            state: result.status === 'pending' ? 'PENDING' : 'CONFIRMED',
            providerId: result.postId || null,
            providerUrl: result.releaseURL || null,
            result: [result],
            pendingData: result.pendingData || Prisma.JsonNull,
          },
        });
        if (updated.count !== 1) throw new ConflictException('Dispatch attempt is no longer current');
      }
      await this.agency.audit(
        tx,
        {
          type: claim.rows[0].actorType as AgencyActor['type'],
          id: claim.rows[0].actorId,
          organizationId: claim.integration.organizationId,
        },
        'dispatch.receipt',
        claim.rows[0].id,
        claim.rows[0].clientId,
        {
          states: responses.map((r) =>
            r.status === 'pending' ? 'PENDING' : 'CONFIRMED'
          ),
        }
      );
      const remaining = await tx.agencyDispatch.count({
        where: {
          revisionId: claim.rows[0].revisionId,
          stage: 'publish',
          state: { not: 'CONFIRMED' },
        },
      });
      if (!remaining)
        await tx.agencyWork.updateMany({
          where: {
            id: claim.rows[0].workId,
            currentVersion: (
              await tx.agencyRevision.findUniqueOrThrow({
                where: { id: claim.rows[0].revisionId },
              })
            ).version,
            status: 'SCHEDULED',
          },
          data: { status: 'PUBLISHED' },
        });
    });
  }
  async failed(claim: Claim, known: boolean) {
    await this.locked(claim.integration.organizationId, async (tx) => {
      await tx.agencyDispatch.updateMany({
        where: {
          OR: claim.rows.map(r => ({ id: r.id, attempt: r.attempt })),
          state: { in: ['CLAIMED', 'PENDING'] },
        },
        data: {
          state: known ? 'FAILED' : 'UNKNOWN',
          reason: known ? 'PROVIDER_REJECTION' : 'MUTATION_OUTCOME_UNCERTAIN',
        },
      });
      await this.agency.audit(
        tx,
        {
          type: claim.rows[0].actorType as AgencyActor['type'],
          id: claim.rows[0].actorId,
          organizationId: claim.integration.organizationId,
        },
        'dispatch.' + (known ? 'failed' : 'unknown'),
        claim.rows[0].id,
        claim.rows[0].clientId
      );
    });
  }
  wrapPending(claim: Claim, responses: any[]) {
    return responses.map((r) =>
      r.status === 'pending'
        ? {
            ...r,
            pendingData: {
              agencyDispatchId: claim.rows.find((d) => d.postId === r.id)!.id,
            },
          }
        : r
    );
  }
  async pending(integration: Integration, ticket: any) {
    if (typeof ticket?.agencyDispatchId !== 'string')
      throw new ForbiddenException('Revision-bound pending receipt required');
    const row = await this.db.agencyDispatch.findFirst({
      where: {
        id: ticket.agencyDispatchId,
        organizationId: integration.organizationId,
        channelId: integration.id,
        stage: 'publish',
        state: { in: ['PENDING', 'CONFIRMED'] },
      },
    });
    if (!row) throw missing();
    const current = await this.db.integration.findUniqueOrThrow({
      where: { id: row.channelId },
    });
    const revision = await this.db.agencyRevision.findUniqueOrThrow({
      where: { id: row.revisionId },
    });
    const target = this.payload(revision).targets.find(
      (t) => t.channelId === row.channelId
    )!;
    if (
      current.organizationId !== row.organizationId ||
      current.customerId !== row.clientId ||
      current.deletedAt ||
      current.ownershipQuarantined ||
      current.internalId !== target.accountId ||
      current.providerIdentifier !== target.provider
    )
      throw new ForbiddenException('Pending account changed');
    return { row, integration: current, target };
  }
  private async projectPublished(revisionId: string) {
    await this.locked(
      (
        await this.db.agencyRevision.findUniqueOrThrow({
          where: { id: revisionId },
        })
      ).organizationId,
      async (tx) => {
        const rev = await tx.agencyRevision.findUniqueOrThrow({
          where: { id: revisionId },
        });
        if (
          !(await tx.agencyDispatch.count({
            where: {
              revisionId,
              stage: 'publish',
              state: { not: 'CONFIRMED' },
            },
          }))
        )
          await tx.agencyWork.updateMany({
            where: {
              id: rev.workId,
              currentVersion: rev.version,
              status: 'SCHEDULED',
            },
            data: { status: 'PUBLISHED' },
          });
      }
    );
  }
  async recoveryEligibility(actor: AgencyActor, work: any, revision: any, tx: Prisma.TransactionClient) {
    if (work.currentVersion !== revision.version || work.status !== 'SCHEDULED') throw new ConflictException('Only the current scheduled revision can recover');
    const payload = this.payload(revision);
    await this.authorize(actor, work, payload, 'publish:schedule');
    await this.approved(work, revision, tx);
    await this.assertTargets(work, payload);
    await this.verifyMedia(revision.id);
  }
  async projectRecoveryReceipt(revisionId: string, postId: string) {
    await this.projectState(postId, State.PUBLISHED);
    await this.projectPublished(revisionId);
  }
  async readPending(integration: Integration, ticket: any) {
    const pending = await this.pending(integration, ticket);
    if (pending.row.state === 'CONFIRMED')
      return {
        status: 'completed' as const,
        postId: pending.row.providerId!,
        releaseURL: pending.row.providerUrl!,
      };
    const provider = this.providers.getSocialIntegration(
      pending.integration.providerIdentifier
    );
    const result = await provider.checkPostStatus(
      pending.integration.token,
      pending.row.pendingData,
      pending.integration
    );
    if (result.status === 'completed') {
      await this.db.agencyDispatch.update({
        where: { id: pending.row.id },
        data: {
          state: 'CONFIRMED',
          providerId: result.postId,
          providerUrl: result.releaseURL,
          result: [
            {
              id: pending.row.postId,
              postId: result.postId,
              releaseURL: result.releaseURL,
              status: 'published',
            },
          ],
        },
      });
    } else if (result.pendingData)
      await this.db.agencyDispatch.update({
        where: { id: pending.row.id },
        data: { pendingData: result.pendingData },
      });
    if (result.status === 'completed')
      await this.projectPublished(pending.row.revisionId);
    return result.status === 'completed'
      ? result
      : { ...result, pendingData: { agencyDispatchId: pending.row.id } };
  }
  async finalize(integration: Integration, ticket: any) {
    const pending = await this.pending(integration, ticket);
    const post = await this.db.post.findUniqueOrThrow({
      where: { id: pending.row.postId },
    });
    const claim = await this.claim(
      pending.integration,
      [post],
      'finalize',
      pending.row.id
    );
    if (claim.cached)
      return {
        status: 'completed' as const,
        postId: claim.rows[0].providerId,
        releaseURL: claim.rows[0].providerUrl,
      };
    try {
      const result = await this.providers
        .getSocialIntegration(claim.integration.providerIdentifier)
        .finalizePost(
          claim.integration.token,
          pending.row.pendingData,
          claim.integration
        );
      if (result.status !== 'completed') {
        await this.failed(claim, false);
        throw new ForbiddenException(
          'Multi-stage finalization requires reconciliation before another mutation'
        );
      }
      const response = [
        {
          id: post.id,
          postId: result.postId,
          releaseURL: result.releaseURL,
          status: 'published',
        },
      ];
      await this.finish(claim, response);
      await this.db.agencyDispatch.update({
        where: { id: pending.row.id },
        data: {
          state: 'CONFIRMED',
          providerId: result.postId,
          providerUrl: result.releaseURL,
          result: response,
        },
      });
      await this.projectPublished(pending.row.revisionId);
      return result;
    } catch (error) {
      await this.failed(claim, false);
      throw error;
    }
  }
  async snapshot(actor: AgencyActor, revisionId: string, snapshotId: string) {
    const revision = await this.db.agencyRevision.findFirst({
      where: { id: revisionId, organizationId: actor.organizationId },
    });
    if (!revision) throw missing();
    const work = await this.db.agencyWork.findUniqueOrThrow({
      where: { id: revision.workId },
    });
    try {
      await this.authorize(actor, work, this.payload(revision), 'content:read');
    } catch {
      const request = await this.db.agencyReviewRequest.findUnique({
        where: { revisionId },
      });
      if (
        actor.type !== 'user' ||
        request?.reviewerId !== actor.id ||
        +request.expiresAt <= Date.now() ||
        ['REVOKED', 'CANCELED', 'SUPERSEDED', 'INVALIDATED'].includes(
          request.status
        )
      )
        throw missing();
      await this.authorize(
        actor,
        work,
        this.payload(revision),
        'review:decide'
      );
    }
    return this.snapshotBytes(revisionId, snapshotId);
  }
  private async snapshotBytes(revisionId: string, snapshotId: string) {
    const row = await this.db.agencyMediaSnapshot.findFirst({
      where: { id: snapshotId, revisionId },
    });
    if (!row) throw missing();
    const bytes = readFileSync(this.snapshotPath(row.fileName));
    if (bytesHash(bytes) !== row.contentHash) throw missing();
    return { bytes, mime: row.mime };
  }
  async asset(snapshotId: string, token: string) {
    const cap = verifyAssetCapability(token || '');
    if (!cap || cap.snapshotId !== snapshotId) throw missing();
    const row = await this.db.agencyDispatch.findFirst({
      where: {
        id: cap.dispatchId,
        state: { in: ['CLAIMED', 'PENDING', 'CONFIRMED', 'UNKNOWN'] },
      },
    });
    if (!row) throw missing();
    const revision = await this.db.agencyRevision.findUniqueOrThrow({
      where: { id: row.revisionId },
    });
    const target = this.payload(revision).targets.find(
      (t) => t.channelId === row.channelId
    );
    if (!target?.parts[row.part].media.some((m) => m.snapshotId === snapshotId))
      throw missing();
    return this.snapshotBytes(row.revisionId, snapshotId);
  }
  async view(actor: AgencyActor, workId: string) {
    const work = await this.db.agencyWork.findFirst({
      where: { id: workId, organizationId: actor.organizationId },
    });
    if (!work) throw missing();
    const revision = await this.revision(work);
    const payload = this.payload(revision);
    const request = await this.db.agencyReviewRequest.findUnique({
      where: { revisionId: revision.id },
    });
    let reviewerOnly = false;
    try {
      await this.authorize(actor, work, payload, 'content:read');
    } catch {
      if (
        actor.type !== 'user' ||
        request?.reviewerId !== actor.id ||
        +request.expiresAt <= Date.now() ||
        ['REVOKED', 'CANCELED', 'SUPERSEDED', 'INVALIDATED'].includes(
          request.status
        )
      )
        throw missing();
      await this.authorize(actor, work, payload, 'review:decide');
      reviewerOnly = true;
    }
    const readableChannels = reviewerOnly
      ? []
      : (await this.agency.channels(actor, work.clientId)).map((c) => c.id);
    const receipts = reviewerOnly
      ? []
      : await this.db.agencyDispatch.findMany({
          where: { workId, channelId: { in: readableChannels } },
          orderBy: [{ createdAt: 'asc' }, { part: 'asc' }],
          select: {
            id: true,
            revisionId: true,
            channelId: true,
            part: true,
            stage: true,
            state: true,
            claimedAt: true,
            providerId: true,
            providerUrl: true,
            reason: true,
          },
        });
    const permitted: string[] = [];
    for (const action of [
      'draft:write',
      'publish:schedule',
      'review:decide',
    ] as AgencyAction[]) {
      let ok = true;
      for (const t of payload.targets)
        if (!(await this.agency.can(actor, work.clientId, action, t.channelId)))
          ok = false;
      if (
        action === 'review:decide' &&
        request &&
        request.reviewerId !== actor.id
      )
        ok = false;
      if (ok) permitted.push(action);
    }
    return {
      ...work,
      revision: {
        id: revision.id,
        version: revision.version,
        hash: revision.payloadHash,
        payload,
      },
      request,
      decision:
        request &&
        (await this.db.agencyReviewDecision.findUnique({
          where: { requestId: request.id },
        })),
      receipts,
      permitted,
      inFlight: receipts.some((d) =>
        ['CLAIMED', 'PENDING', 'UNKNOWN'].includes(d.state)
      ),
    };
  }
  async list(actor: AgencyActor, clientId: string) {
    const channels = await this.agency.channels(actor, clientId);
    const ids = channels.map((c) => c.id);
    const works = await this.db.$queryRaw<
      any[]
    >`SELECT w.* FROM "AgencyWork" w JOIN "AgencyRevision" r ON r."workId"=w.id AND r.version=w."currentVersion"
      WHERE w."organizationId"=${actor.organizationId} AND w."clientId"=${clientId}
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.payload->'targets') target WHERE NOT (target->>'channelId'=ANY(${ids}::text[])))
      ORDER BY w."updatedAt" DESC LIMIT 50`;
    const results = [];
    for (const work of works) {
      const rev = await this.revision(work);
      if (this.payload(rev).targets.every((t) => ids.includes(t.channelId)))
        results.push(await this.view(actor, work.id));
    }
    return results;
  }
  async reviews(actor: AgencyActor) {
    if (actor.type !== 'user') return [];
    await this.agency.membership(actor);
    const requests = await this.db.$queryRaw<
      any[]
    >`SELECT q.* FROM "AgencyReviewRequest" q JOIN "AgencyWork" w ON w.id=q."workId" JOIN "AgencyRevision" r ON r.id=q."revisionId" JOIN "Customer" c ON c.id=w."clientId"
      WHERE w."organizationId"=${actor.organizationId} AND q."reviewerId"=${actor.id} AND r.version=w."currentVersion" AND q.status IN ('IN_REVIEW','APPROVED','CHANGES_REQUESTED') AND q."expiresAt">now() AND c."deletedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.payload->'targets') target WHERE NOT EXISTS
        (SELECT 1 FROM "AgencyGrant" g WHERE g."organizationId"=w."organizationId" AND g."userId"=${actor.id} AND g."clientId"=w."clientId" AND g.role='REVIEWER' AND g."revokedAt" IS NULL AND (g."expiresAt" IS NULL OR g."expiresAt">now()) AND (cardinality(g."channelIds")=0 OR target->>'channelId'=ANY(g."channelIds"))))
      ORDER BY q."createdAt" DESC LIMIT 100`;
    const items = [];
    for (const request of requests) {
      try {
        items.push(await this.view(actor, request.workId));
      } catch {
        /* Other agencies/currently revoked access never project. */
      }
    }
    return items;
  }
  async upload(
    actor: AgencyActor,
    clientId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    alt = ''
  ) {
    await this.agency.assert(actor, clientId, 'draft:write');
    if (
      !file?.buffer?.length ||
      file.buffer.length > 20 * 1024 * 1024 ||
      typeof alt !== 'string' ||
      alt.length > 1000
    )
      throw new BadRequestException('Ready private media up to 20 MB required');
    const extensions = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
    };
    const ext = extensions[file.mimetype];
    if (!ext || process.env.STORAGE_PROVIDER !== 'local')
      throw new BadRequestException('Unsupported private media format/storage');
    if (file.mimetype.startsWith('image/')) {
      try {
        const metadata = await sharp(file.buffer).metadata();
        if (metadata.format !== (ext === 'jpg' ? 'jpeg' : ext))
          throw new Error('type mismatch');
      } catch {
        throw new BadRequestException(
          'Image bytes do not match their declared format'
        );
      }
    }
    const name = randomUUID() + '.' + ext;
    writeFileSync(resolve(process.env.UPLOAD_DIRECTORY!, name), file.buffer, {
      flag: 'wx',
      mode: 0o600,
    });
    return this.locked(actor.organizationId, async (tx) => {
      await this.agency.assert(actor, clientId, 'draft:write');
      const media = await tx.media.create({
        data: {
          organizationId: actor.organizationId,
          clientId,
          name,
          originalName: file.originalname.slice(0, 200),
          path: `${process.env.FRONTEND_URL}/uploads/${name}`,
          fileSize: file.buffer.length,
          alt,
          ownershipQuarantined: false,
          type: file.mimetype.startsWith('image/') ? 'image' : 'video',
          status: 'ready',
        },
      });
      await this.agency.audit(tx, actor, 'media.uploaded', media.id, clientId);
      return { id: media.id, path: media.path, alt: media.alt };
    });
  }

  async reviewers(actor: AgencyActor, clientId: string) {
    await this.agency.assert(actor, clientId, 'draft:write');
    const grants = await this.db.agencyGrant.findMany({
      where: {
        organizationId: actor.organizationId,
        clientId,
        role: 'REVIEWER',
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    const invitations = await this.db.agencyReviewInvitation.findMany({ where: { organizationId: actor.organizationId, clientId, revokedAt: null, expiresAt: { gt: new Date() } } });
    const invitationIds: string[] = [];
    for (const i of invitations) if (await this.agency.invitationPermission({ type: 'user', id: i.reviewerId, organizationId: actor.organizationId }, clientId, i.id, undefined, Date.now(), false)) invitationIds.push(i.reviewerId);
    const memberships = await this.db.userOrganization.findMany({
      where: {
        organizationId: actor.organizationId,
        disabled: false,
        userId: { in: [...grants.map((g) => g.userId), ...invitationIds] },
        user: { deletedAt: null, activated: true },
      },
      select: { user: { select: { id: true, name: true } } },
    });
    return memberships.map((m) => m.user);
  }
}
