import { getMetadataStorage } from 'class-validator';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
export const reviewSecret = () => randomBytes(32).toString('base64url');
export const reviewHash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const verificationHash = (id: string, code: string) =>
  createHmac('sha256', process.env.JWT_SECRET!)
    .update('review-code:' + id + ':' + code)
    .digest('hex');
export const csrfToken = (session: { id: string; secretHash: string }) =>
  createHmac('sha256', process.env.JWT_SECRET!)
    .update('review-csrf:' + session.id + ':' + session.secretHash)
    .digest('base64url');
export const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export const escapeMail = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        char
      ]!)
  );
export function reviewWeek(value?: string) {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  now.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const start = value === undefined ? now : new Date(value + 'T00:00:00.000Z');
  if (
    value !== undefined &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(+start) ||
      start.toISOString().slice(0, 10) !== value)
  )
    return null;
  return { start, end: new Date(+start + 7 * 86400000) };
}
export function reviewTelemetryPath(value: unknown) {
  return typeof value === 'string' && /\/agency\/review(?:[/-]|$)/i.test(value);
}

export function reviewOptions(
  settings: Record<string, unknown>,
  dto?: Function
) {
  if (!dto) return {};
  const fields = new Set(
    getMetadataStorage()
      .getTargetValidationMetadatas(dto, '', false, false)
      .map((m) => m.propertyName)
  );
  const privateKey = (key: string) =>
    key === '__type' ||
    /token|secret|password|api.?key|internal.?notes?/i.test(key);
  const scrub = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(scrub)
      : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => !privateKey(key))
            .map(([key, item]) => [key, scrub(item)])
        )
      : value;
  return Object.fromEntries(
    Object.entries(settings)
      .filter(([key]) => fields.has(key) && !privateKey(key))
      .map(([key, value]) => [key, scrub(value)])
  );
}
