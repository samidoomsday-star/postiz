import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { BadBody, SocialAbstract } from '../social.abstract';
import { Integration } from '@prisma/client';
import {
  AuthTokenDetails,
  PendingCheckResponse,
  PostDetails,
  PostResponse,
  SocialProvider,
  AgencyRecoveryReceipt,
  AgencyReconciliation,
} from './social.integrations.interface';
import { requireSyntheticMode } from '@gitroom/helpers/testing/synthetic-mode';

type Receipt = {
  operation: 'accepted' | 'completed' | 'rejected' | 'finalized';
  processing?: boolean;
  mediaHashes?: string[];
  settingsHash?: string;
  postId: string;
  localId: string;
  channelId: string;
  content: string;
  time: string;
};

/** A file-backed external-service double exercised by the actual Temporal pipeline. */
export class SyntheticProvider extends SocialAbstract implements SocialProvider {
  identifier = 'synthetic';
  name = 'Synthetic local provider';
  editor = 'normal' as const;
  isBetweenSteps = false;
  scopes: string[] = [];

  maxLength() {
    return 10000;
  }

  async generateAuthUrl(): Promise<never> {
    throw new Error('Synthetic channels are created by the isolated fixture seed only');
  }

  async authenticate(): Promise<AuthTokenDetails> {
    throw new Error('Synthetic channels do not accept OAuth or real credentials');
  }

  async refreshToken(): Promise<AuthTokenDetails> {
    throw new Error('Synthetic tokens never require network refresh');
  }

  private logPath() {
    requireSyntheticMode();
    const path = process.env.AGENCY_PROVIDER_LOG;
    if (!path) {
      throw new Error('Synthetic provider requires a private mutation journal');
    }
    return path;
  }

  private record(receipt: Receipt) {
    appendFileSync(this.logPath(), JSON.stringify(receipt) + '\n', { mode: 0o600 });
  }

  private receipts(): Receipt[] {
    try {
      return readFileSync(this.logPath(), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async post(
    id: string,
    accessToken: string,
    posts: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    requireSyntheticMode();
    if (
      integration.providerIdentifier !== this.identifier ||
      !id.startsWith('synthetic-') ||
      accessToken !== 'synthetic-token'
    ) {
      throw new Error('Synthetic provider refuses live channel identities or credentials');
    }
    const mediaHashes = [];
    for (const post of posts) for (const media of post.media || []) {
      const url = new URL(media.path);
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '3000' || !url.pathname.startsWith('/agency/assets/')) throw new Error('Synthetic media refuses nonlocal snapshot capability');
      const result = await fetch(url);
      if (!result.ok) throw new Error('Synthetic provider could not fetch its approved snapshot');
      mediaHashes.push(createHash('sha256').update(Buffer.from(await result.arrayBuffer())).digest('hex'));
    }
    const delay = Number(posts[0]?.settings?.waitBeforeAcceptMs || 0);
    if (!Number.isFinite(delay) || delay < 0 || delay > 5000) throw new Error('Invalid synthetic acceptance delay');
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    return posts.map((post) => {
      const outcome = post.settings?.outcome || 'success';
      if (!['success', 'known-failure', 'rate-limit-once', 'pending', 'uncertain', 'finalize'].includes(outcome)) {
        throw new Error('Invalid synthetic outcome');
      }
      const rejected = outcome === 'known-failure' || (outcome === 'rate-limit-once' && !this.receipts().some(r => r.localId === post.id && r.operation === 'rejected'));
      const pending = ['pending','finalize'].includes(outcome);
      const postId = `synthetic-${randomUUID()}`;
      const receipt: Receipt = {
        operation: rejected ? 'rejected' : 'accepted',
        postId,
        localId: post.id,
        channelId: integration.id,
        content: post.message,
        time: new Date().toISOString(),
        mediaHashes,
        settingsHash: createHash('sha256').update(JSON.stringify(post.settings || {})).digest('hex'),
        processing: pending,
      };
      this.record(receipt);
      if (rejected) {
        throw new BadBody(this.identifier, '{}', '{}', 'Synthetic known rejection');
      }
      if (outcome === 'uncertain') {
        // Persist acceptance first to model a lost response after a remote side effect.
        const error = new Error('Synthetic response lost after acceptance');
        error.name = 'TimeoutError';
        throw error;
      }
      if (outcome === 'success' || outcome === 'rate-limit-once') {
        this.record({ ...receipt, operation: 'completed' });
      }
      return {
        id: post.id,
        postId: pending ? '' : postId,
        releaseURL: pending ? '' : `https://example.test/published/${postId}`,
        status: pending ? 'pending' : 'published',
        ...(pending ? { pendingData: { postId, requiresFinalize: outcome === 'finalize', processingMs: Math.min(Math.max(Number(post.settings?.processingMs) || 0,0),60000) } } : {}),
      };
    });
  }

  async comment(id: string, rootId: string, previousId: string | undefined, token: string, posts: PostDetails[], integration: Integration) {
    if (!rootId.startsWith('synthetic-') || (previousId && !previousId.startsWith('synthetic-'))) throw new Error('Synthetic comments refuse live parent IDs');
    return this.post(id, token, posts, integration);
  }

  async postPending(...args: Parameters<SyntheticProvider['post']>) {
    return this.post(...args);
  }

  override async checkPostStatus(
    accessToken: string,
    pendingData: { postId: string; requiresFinalize?: boolean; processingMs?: number },
    integration: Integration
  ): Promise<PendingCheckResponse> {
    requireSyntheticMode();
    if (accessToken !== 'synthetic-token') {
      throw new Error('Invalid synthetic reconciliation credential');
    }
    const receipt = this.receipts().find(
      (r) => r.postId === pendingData.postId && r.channelId === integration.id && r.operation === 'accepted'
    );
    if (!receipt) {
      throw new Error('Unknown synthetic receipt');
    }
    if (Date.now() < +new Date(receipt.time) + (pendingData.processingMs || 0)) return { status: 'pending', pendingData };
    if (pendingData.requiresFinalize) { await new Promise(resolve => setTimeout(resolve, 1500)); return { status: 'ready', pendingData }; }
    // Read-only probe: an accepted synthetic publish is available immediately.
    return {
      status: 'completed',
      postId: receipt.postId,
      releaseURL: `https://example.test/published/${receipt.postId}`,
    };
  }

  async verifyFailedPublication(token: string, receipt: AgencyRecoveryReceipt, integration: Integration) {
    requireSyntheticMode();
    if (token !== 'synthetic-token' || integration.providerIdentifier !== 'synthetic') throw new Error('Synthetic recovery refuses live credentials');
    const rows = this.receipts().filter(r => r.localId === receipt.localId && r.channelId === integration.id);
    return rows.some(r => r.operation === 'rejected') && !rows.some(r => ['accepted','finalized'].includes(r.operation));
  }

  async reconcilePublication(token: string, receipt: AgencyRecoveryReceipt, integration: Integration): Promise<AgencyReconciliation> {
    requireSyntheticMode();
    if (token !== 'synthetic-token' || integration.providerIdentifier !== 'synthetic') throw new Error('Synthetic recovery refuses live credentials');
    const rows = this.receipts().filter(r => r.localId === receipt.localId && r.channelId === integration.id);
    const accepted = rows.find(r => r.operation === 'accepted');
    // Unknown publish calls in this double are immediate accepted publications.
    // Finalization is only confirmed with a factual finalized journal entry.
    const evidence = receipt.stage === 'finalize' ? rows.find(r => r.operation === 'finalized') : accepted?.processing === false ? accepted : rows.find(r => ['completed','finalized'].includes(r.operation));
    if (!evidence) return { status: 'unknown' };
    return { status: 'confirmed', postId: evidence.postId, releaseURL: `https://example.test/published/${evidence.postId}` };
  }
  override async finalizePost(accessToken: string, pendingData: { postId: string }, integration: Integration): Promise<PendingCheckResponse> {
    requireSyntheticMode();
    if (accessToken !== 'synthetic-token' || integration.providerIdentifier !== 'synthetic') throw new Error('Synthetic finalization refuses live credentials');
    const receipt = this.receipts().find(r => r.postId === pendingData.postId && r.channelId === integration.id && r.operation === 'accepted');
    if (!receipt) throw new Error('Unknown synthetic finalize receipt');
    this.record({ ...receipt, operation: 'finalized' });
    return { status: 'completed', postId: receipt.postId, releaseURL: `https://example.test/published/${receipt.postId}` };
  }
}
