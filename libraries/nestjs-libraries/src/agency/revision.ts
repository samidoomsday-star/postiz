import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export const digest = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
export const bytesHash = (value: Buffer) =>
  createHash('sha256').update(value).digest('hex');
export type FrozenMedia = {
  snapshotId: string;
  sourceMediaId: string;
  sourcePath: string;
  hash: string;
  alt: string;
  mime: string;
};
export type FrozenPart = {
  id: string;
  content: string;
  message: string;
  delay: number;
  dueAt: string;
  media: FrozenMedia[];
};
export type FrozenTarget = {
  channelId: string;
  accountId: string;
  provider: string;
  name: string;
  editor: string;
  settings: Record<string, unknown>;
  publishAt: string;
  parts: FrozenPart[];
};
export type FrozenPayload = { timezone: string; targets: FrozenTarget[] };
export function assetCapability(
  snapshotId: string,
  dispatchId: string,
  expiresAt = Date.now() + 30 * 60000
) {
  const payload = Buffer.from(
    JSON.stringify({ snapshotId, dispatchId, expiresAt })
  ).toString('base64url');
  const signature = createHmac('sha256', process.env.JWT_SECRET!)
    .update('agency-asset:' + payload)
    .digest('base64url');
  return payload + '.' + signature;
}
export function verifyAssetCapability(token: string) {
  try {
    const [payload, signature, extra] = token.split('.');
    if (extra || !payload || !signature) return null;
    const expected = createHmac('sha256', process.env.JWT_SECRET!)
      .update('agency-asset:' + payload)
      .digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (
      typeof value.snapshotId !== 'string' ||
      typeof value.dispatchId !== 'string' ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= Date.now() ||
      value.expiresAt > Date.now() + 30 * 60000
    )
      return null;
    return value as {
      snapshotId: string;
      dispatchId: string;
      expiresAt: number;
    };
  } catch {
    return null;
  }
}
