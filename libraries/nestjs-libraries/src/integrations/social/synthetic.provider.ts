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
} from './social.integrations.interface';
import { requireSyntheticMode } from '@gitroom/helpers/testing/synthetic-mode';

type Receipt = {
  operation: 'accepted' | 'completed' | 'rejected';
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
    return posts.map((post) => {
      const outcome = post.settings?.outcome || 'success';
      if (!['success', 'known-failure', 'pending', 'uncertain'].includes(outcome)) {
        throw new Error('Invalid synthetic outcome');
      }
      const postId = `synthetic-${randomUUID()}`;
      const receipt: Receipt = {
        operation: outcome === 'known-failure' ? 'rejected' : 'accepted',
        postId,
        localId: post.id,
        channelId: integration.id,
        content: post.message,
        time: new Date().toISOString(),
      };
      this.record(receipt);
      if (outcome === 'known-failure') {
        throw new BadBody(this.identifier, '{}', '{}', 'Synthetic known rejection');
      }
      if (outcome === 'uncertain') {
        // Persist acceptance first to model a lost response after a remote side effect.
        const error = new Error('Synthetic response lost after acceptance');
        error.name = 'TimeoutError';
        throw error;
      }
      if (outcome === 'success') {
        this.record({ ...receipt, operation: 'completed' });
      }
      return {
        id: post.id,
        postId: outcome === 'pending' ? '' : postId,
        releaseURL: outcome === 'pending' ? '' : `https://example.test/published/${postId}`,
        status: outcome === 'pending' ? 'pending' : 'published',
        ...(outcome === 'pending' ? { pendingData: { postId } } : {}),
      };
    });
  }

  async postPending(...args: Parameters<SyntheticProvider['post']>) {
    return this.post(...args);
  }

  override async checkPostStatus(
    accessToken: string,
    pendingData: { postId: string },
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
    // Read-only probe: an accepted synthetic publish is available immediately.
    return {
      status: 'completed',
      postId: receipt.postId,
      releaseURL: `https://example.test/published/${receipt.postId}`,
    };
  }
}
