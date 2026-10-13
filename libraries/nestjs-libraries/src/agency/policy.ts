export const actions = [
  'content:read',
  'draft:write',
  'publish:schedule',
  'review:decide',
] as const;
export type AgencyAction = (typeof actions)[number];
export type AgencyActor = {
  type: 'user' | 'credential';
  id: string;
  organizationId: string;
};
export const roles = ['EDITOR', 'PUBLISHER', 'REVIEWER'] as const;
export type AgencyRole = (typeof roles)[number];
export const roleActions: Record<AgencyRole, readonly AgencyAction[]> = {
  EDITOR: ['content:read', 'draft:write'],
  PUBLISHER: ['content:read', 'publish:schedule'],
  // Reviewer-only projections arrive with the review portal. No raw draft read.
  REVIEWER: ['review:decide'],
};
export function live(
  record: { revokedAt: Date | null; expiresAt: Date | null },
  now = Date.now()
) {
  return (
    !record.revokedAt && (!record.expiresAt || record.expiresAt.getTime() > now)
  );
}
export function allowsChannel(channelIds: string[], channelId?: string) {
  // An empty list means all channels inside the explicitly granted client.
  return (
    !channelId || channelIds.length === 0 || channelIds.includes(channelId)
  );
}
