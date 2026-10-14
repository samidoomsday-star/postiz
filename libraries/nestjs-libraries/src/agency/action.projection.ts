export const actionStates = [
  'SAVED',
  'REVIEW_PENDING',
  'CHANGES_REQUESTED',
  'APPROVAL_INVALIDATED',
  'CHANNEL_BLOCKED',
  'DUE_STALLED',
  'SCHEDULED',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'UNKNOWN',
  'PARTIAL',
  'CANCELED',
  'SUPERSEDED',
] as const;
export const actionCopy: Record<string, string> = {
  SAVED: 'Saved draft; request review before scheduling.',
  REVIEW_PENDING: 'Waiting for a decision on this exact revision.',
  CHANGES_REQUESTED: 'Read client feedback, revise and request fresh approval.',
  APPROVAL_INVALIDATED:
    'Approval is unavailable; create and review a fresh revision.',
  CHANNEL_BLOCKED:
    'Channel is disconnected or its account changed; restore the same account or review a new target.',
  DUE_STALLED:
    'Publication is overdue without a confirmed result. Check worker polling and current policy; HTTP health does not prove progress.',
  SCHEDULED: 'Saved in the queue; publication is not yet confirmed.',
  PROCESSING:
    'Provider accepted processing; wait or check the existing receipt.',
  PUBLISHED: 'Every publishing part has a confirmed receipt.',
  FAILED:
    'Known provider rejection; retry only after explicit no-side-effect proof.',
  UNKNOWN:
    'Remote outcome is uncertain; reconcile or record a manual investigation. Do not resend.',
  PARTIAL:
    'Some parts are confirmed; preserve them while resolving the remaining targets.',
  CANCELED:
    'Unclaimed remainder is canceled; already claimed results may still finish.',
  SUPERSEDED:
    'Historical revision; inspect retained receipts and use the current revision for new work.',
};
export function actionUrgency(state: string) {
  return [
    'UNKNOWN',
    'PARTIAL',
    'FAILED',
    'CHANNEL_BLOCKED',
    'DUE_STALLED',
    'APPROVAL_INVALIDATED',
  ].includes(state)
    ? 'HIGH'
    : ['REVIEW_PENDING', 'CHANGES_REQUESTED', 'PROCESSING'].includes(state)
    ? 'NORMAL'
    : 'LOW';
}
export function receiptMeaning(state: string) {
  return (
    (
      {
        READY: 'scheduled',
        CLAIMED: 'submitted; confirmation pending',
        PENDING: 'processing',
        CONFIRMED: 'published',
        FAILED: 'failed',
        UNKNOWN: 'unknown',
      } as Record<string, string>
    )[state] || 'unavailable'
  );
}
