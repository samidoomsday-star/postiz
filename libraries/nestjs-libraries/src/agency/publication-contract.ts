import { BadRequestException } from '@nestjs/common';
/** Agency V1 schedules publication. TikTok inbox delivery needs a separate
 * human completion flow and cannot serve as a confirmed publication receipt. */
export function assertPublicationForm(
  provider: string,
  settings: Record<string, unknown>
) {
  if (provider === 'tiktok' && settings.content_posting_method === 'UPLOAD')
    throw new BadRequestException(
      'TikTok inbox upload does not publish. Use DIRECT_POST for an agency publication.'
    );
}
export function assertPublicationReceipt(
  provider: string,
  result: { postId?: string; releaseURL?: string }
) {
  if (
    provider === 'tiktok' &&
    (result.postId === 'missing' ||
      result.releaseURL?.startsWith('https://www.tiktok.com/messages'))
  )
    throw new Error('TikTok inbox delivery is not confirmed publication');
}
