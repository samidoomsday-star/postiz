import { afterEach, describe, expect, it, vi } from 'vitest';
import { Integration } from '@prisma/client';
import { FacebookProvider } from '../../libraries/nestjs-libraries/src/integrations/social/facebook.provider';
import { InstagramProvider } from '../../libraries/nestjs-libraries/src/integrations/social/instagram.provider';
import { InstagramStandaloneProvider } from '../../libraries/nestjs-libraries/src/integrations/social/instagram.standalone.provider';
import { LinkedinProvider } from '../../libraries/nestjs-libraries/src/integrations/social/linkedin.provider';
import { LinkedinPageProvider } from '../../libraries/nestjs-libraries/src/integrations/social/linkedin.page.provider';
import { TiktokProvider } from '../../libraries/nestjs-libraries/src/integrations/social/tiktok.provider';
import { YoutubeProvider } from '../../libraries/nestjs-libraries/src/integrations/social/youtube.provider';
import { XProvider } from '../../libraries/nestjs-libraries/src/integrations/social/x.provider';
import { ThreadsProvider } from '../../libraries/nestjs-libraries/src/integrations/social/threads.provider';
import { PinterestProvider } from '../../libraries/nestjs-libraries/src/integrations/social/pinterest.provider';
import { GmbProvider } from '../../libraries/nestjs-libraries/src/integrations/social/gmb.provider';
import {
  BadBody,
  SocialAbstract,
  RefreshToken,
  withAgencyMutation,
} from '../../libraries/nestjs-libraries/src/integrations/social.abstract';
import {
  assertPublicationForm,
  assertPublicationReceipt,
} from '../../libraries/nestjs-libraries/src/agency/publication-contract';
const providers = [
  new FacebookProvider(),
  new InstagramProvider(),
  new InstagramStandaloneProvider(),
  new LinkedinProvider(),
  new LinkedinPageProvider(),
  new TiktokProvider(),
  new YoutubeProvider(),
  new XProvider(),
  new ThreadsProvider(),
  new PinterestProvider(),
  new GmbProvider(),
];
const integration = {
  internalId: 'synthetic-account',
  profile: 'synthetic-profile',
} as Integration;
afterEach(() => vi.unstubAllGlobals());
describe('T05-04 priority provider contracts (offline; no OAuth/live claims)', () => {
  for (const p of providers) {
    it(`${p.identifier}: ambiguous HTTP result cannot replay an agency mutation; independent calls stay separate`, async () => {
      const network = vi.fn(
        async () =>
          new Response('synthetic-token reflected by platform', { status: 500 })
      );
      vi.stubGlobal('fetch', network);
      await expect(
        withAgencyMutation(() =>
          p.fetch('https://provider.example.test/publication', {
            method: 'POST',
            body: 'private-capability',
          })
        )
      ).rejects.toThrow('could not be confirmed');
      expect(network).toHaveBeenCalledTimes(1);
      // A second independent operation is not blocked/deduplicated by the double.
      await expect(
        withAgencyMutation(() =>
          p.fetch('https://provider.example.test/publication', {
            method: 'POST',
          })
        )
      ).rejects.toThrow();
      expect(network).toHaveBeenCalledTimes(2);
    });
    it(`${p.identifier}: revoked authentication and insufficient scopes never become a publication receipt`, async () => {
      const network = vi.fn(
        async () =>
          new Response('Error validating access token synthetic-token', {
            status: 401,
          })
      );
      vi.stubGlobal('fetch', network);
      let failure: unknown;
      try {
        await withAgencyMutation(() =>
          p.fetch('https://provider.example.test/publication', {
            method: 'POST',
            body: 'private-capability',
          })
        );
      } catch (e) {
        failure = e;
      }
      expect(failure).toBeInstanceOf(RefreshToken);
      expect(JSON.stringify(failure)).not.toContain('synthetic-token');
      expect(JSON.stringify(failure)).not.toContain('private-capability');
      expect(network).toHaveBeenCalledTimes(1);
      expect(() => p.checkScopes(['publish'], ['read'])).toThrow();
      expect('verifyFailedPublication' in p).toBe(false);
      expect('reconcilePublication' in p).toBe(false);
    });
  }
  it('TikTok processing, direct publication and inbox delivery remain distinct', async () => {
    const p = new TiktokProvider();
    const network = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { status: 'PROCESSING_UPLOAD' } }))
    );
    vi.spyOn(p, 'fetch').mockImplementation(network);
    expect(
      (
        await p.checkPostStatus(
          'synthetic-token',
          { publishId: 'synthetic-id' },
          integration
        )
      ).status
    ).toBe('pending');
    network.mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: { status: 'SEND_TO_USER_INBOX' } }))
    );
    const inbox = await p.checkPostStatus(
      'synthetic-token',
      { publishId: 'synthetic-id' },
      integration
    );
    expect(inbox.status).toBe('completed');
    expect(() => assertPublicationReceipt('tiktok', inbox as any)).toThrow(
      'inbox'
    );
    expect(() =>
      assertPublicationForm('tiktok', { content_posting_method: 'UPLOAD' })
    ).toThrow('does not publish');
    expect(() =>
      assertPublicationForm('tiktok', { content_posting_method: 'DIRECT_POST' })
    ).not.toThrow();
    network.mockImplementation(
      async () =>
        new Response(
          '{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7523954333550734643]}}'
        )
    );
    const completed = await p.checkPostStatus(
      'synthetic-token',
      { publishId: 'synthetic-id' },
      integration
    );
    expect(completed.status).toBe('completed');
    expect(() =>
      assertPublicationReceipt('tiktok', completed as any)
    ).not.toThrow();
    expect(network).toHaveBeenCalledTimes(3);
  });
  it('Instagram container readiness does not publish; a prior published container never finalizes again', async () => {
    const p = new InstagramProvider();
    const status = vi
      .spyOn(p as any, 'igContainerStatus')
      .mockResolvedValue('IN_PROGRESS');
    const pending = {
      type: 'instagram',
      postType: 'single' as const,
      containers: ['synthetic-container'],
    };
    expect(
      (await p.checkPostStatus('synthetic-token', pending, integration)).status
    ).toBe('pending');
    status.mockResolvedValue('FINISHED');
    expect(
      (await p.checkPostStatus('synthetic-token', pending, integration)).status
    ).toBe('ready');
    status.mockResolvedValue('PUBLISHED');
    expect(
      (await p.checkPostStatus('synthetic-token', pending, integration)).status
    ).toBe('completed');
  });
  it('YouTube upload byte completion and thumbnail finalization are separate', async () => {
    const p = new YoutubeProvider();
    const probe = vi
      .spyOn(p as any, 'probeUploadSession')
      .mockResolvedValue({ uploadedBytes: 5 });
    const pending = {
      uploadUri: 'https://upload.example.test',
      videoSize: 10,
      path: '/synthetic-only',
      uploadedBytes: 0,
      thumbnail: '',
    };
    const partial = await p.checkPostStatus(
      'synthetic-token',
      pending,
      integration
    );
    expect(partial.status).toBe('ready');
    expect((partial as any).pendingData.uploadedBytes).toBe(5);
    probe.mockResolvedValue({ videoId: 'synthetic-video' });
    expect(
      (
        await p.checkPostStatus(
          'synthetic-token',
          { ...pending, thumbnail: 'synthetic-thumb' },
          integration
        )
      ).status
    ).toBe('ready');
    expect(
      (await p.checkPostStatus('synthetic-token', pending, integration)).status
    ).toBe('completed');
  });
  it('Pinterest uncertainty cannot recreate an already witnessed pin', async () => {
    const p = new PinterestProvider();
    const network = vi.fn(() => {
      throw Error('Unexpected network');
    });
    vi.stubGlobal('fetch', network);
    await expect(
      p.checkPostStatus(
        'synthetic-token',
        { attempting: true, confirmed: true } as any,
        integration
      )
    ).rejects.toBeInstanceOf(BadBody);
    expect(network).not.toHaveBeenCalled();
  });
  it('streamed uploads do not retry ambiguous mutation errors or retain SDK secrets', async () => {
    const p = new FacebookProvider(),
      upload = vi.fn(async () => {
        throw {
          response: { status: 500, data: 'private-capability' },
          request: { token: 'synthetic-token' },
        };
      });
    await expect(
      withAgencyMutation(() => (p as any).runStreamedUpload(upload))
    ).rejects.toThrow('could not be confirmed');
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it('Threads error classification does not log platform bodies', () => {
    const log = vi.spyOn(console, 'log');
    new ThreadsProvider().handleErrors(
      'Error validating access token synthetic-token'
    );
    expect(log).not.toHaveBeenCalled();
  });
});

describe('T05-04 representative unsupported media forms', () => {
  const video = { path: 'https://media.example.test/synthetic.mp4' };
  const image = { path: 'https://media.example.test/synthetic.png' };
  const cases: [
    SocialAbstract,
    { path: string }[][],
    Record<string, unknown>
  ][] = [
    [new FacebookProvider(), [[]], { post_type: 'story' }],
    [new InstagramProvider(), [[]], {}],
    [new InstagramStandaloneProvider(), [[]], {}],
    [new LinkedinProvider(), [[video, image]], {}],
    [new LinkedinPageProvider(), [[video, image]], {}],
    [new TiktokProvider(), [[video, image]], {}],
    [new YoutubeProvider(), [[image]], {}],
    [new XProvider(), [[video]], { post_type: 'article' }],
    [new PinterestProvider(), [[]], {}],
    [new GmbProvider(), [[video]], {}],
  ];
  for (const [provider, media, settings] of cases)
    it(`${provider.identifier}: rejects a documented unsupported form before network`, async () => {
      const network = vi.fn(() => {
        throw Error('Unexpected network');
      });
      vi.stubGlobal('fetch', network);
      const result = await provider.checkValidity(media, settings, []);
      expect(typeof result).toBe('string');
      expect(network).not.toHaveBeenCalled();
    });
});
