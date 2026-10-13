# Agency operator workflow and recovery contract

Staff open **Action dashboard** in `/agency`, or `/agency/actions`. It shows exact revisions across their current client/channel access; a work with an unreadable target is omitted entirely. Review-only users, review sessions and automation credentials cannot operate this staff realm. Filter by client, owner (all/me/unassigned or a staff ID through the API), state and urgency. Scope and filters apply before SQL pagination/counts; pages contain 20 revisions.

Inspect a revision for proposed times/timezone, frozen copy/account identity, per-target/part/stage receipts, original receipt URLs, recovery evidence and a redacted action audit. The current revision links to the retained composer/calendar. Historical revisions with dispatch records remain inspectable when all their channels are still within scope; they cannot be published again through recovery. New draft payloads are not included in historical views.

## Factual status projection

| Queue state | Source fact / operator action |
| --- | --- |
| Saved | Persisted draft; request review. No implied publication. |
| Review pending | Assigned unexpired request awaiting a decision. |
| Changes requested | Read feedback; edit and obtain a fresh review. |
| Approval invalidated | Revocation, invalidation, expired request, lost reviewer/invitation permission or approved unscheduled time already passed. Review a fresh revision. |
| Channel blocked | Disconnected/refresh-needed/removed channel or changed account/provider; restore the same account or review a new target. |
| Scheduled | Persisted dispatch rows; no confirmed provider result yet. |
| Due stalled | Unclaimed part is overdue by two minutes (two seconds only in acknowledged isolated synthetic mode). Check policy and actual worker polling; HTTP liveness is insufficient. |
| Processing | Claimed or provider-accepted asynchronous receipt; do not resend. |
| Unknown | Lost response/receipt or claim older than five minutes; investigate, reconcile when supported, never resend. A stale CLAIMED row remains claimed until factual evidence exists. |
| Failed | Known provider rejection. Retry requires the separate explicit provider contract below. |
| Partial | At least one publishing part confirmed and another unconfirmed. Successful receipts are retained; inspect each unresolved target. |
| Published | Every publishing part has a confirmed persisted provider receipt. |
| Canceled / superseded | No new dispatch eligibility; already claimed outcomes remain factual and may complete. |

Confirmed completion is projected ahead of bookkeeping state. Partial and uncertain receipts take precedence over a new draft or cancellation, so editing cannot hide an earlier unresolved side effect. The list also supplies blocked/failed/unknown flags. It never labels acknowledgment or dismissal as published.

## Assignment and acknowledgment

Choose a currently active, eligible staff reader as owner, record a staff-visible investigation note, and select open/acknowledged/dismissed. Dismissal requires a reason. These fields do not modify content, review approval, schedules or receipts. Failed/unknown work remains visible, including dismissed records. Updates require the action record's expected version and an operation ID; competing updates conflict instead of overwriting notes. Losing current access prevents replaying a cached command.

## Recovery rules

**Check existing receipt** makes a bounded read-only provider request, never a publication/finalization call. Current publisher access and the original account/channel binding are required. Pending receipts may use the inherited `checkPostStatus` contract: processing/ready stay unconfirmed, and the existing worker owns finalization. Unknown outcomes require an opt-in `reconcilePublication` contract. Only an explicit confirmed provider ID/HTTPS URL becomes a confirmed receipt; missing, unavailable or unsupported evidence stays unresolved. Probes and operator outcomes are audited without raw pending data, tokens or provider errors.

If the provider cannot reconcile, inspect the original account on the platform, compare the frozen content and proposed time, and record an investigation note. Acknowledgment/dismissal records the investigation; it cannot certify publication or enable resend. Cancel unclaimed remaining work if appropriate. No arbitrary manual “mark published” or force-retry path exists.

**Retry known-safe failed target** requires all of the following:

1. The current scheduled revision still has a valid exact approval, current publisher rights, matching connected accounts and unchanged private media.
2. The target has one publishing part, state FAILED, and its prior workflow is closed. Multi-part/finalization/unknown/pending attempts cannot use this path.
3. An explicit provider `verifyFailedPublication` contract returns boolean true from read-only evidence proving no side effect. A generic error, 429, missing URL or FAILED label alone is insufficient.
4. Append-only evidence preserves the failed attempt. Its attempt number increments before it becomes READY; SQL refuses rearming without that proof and refuses all UNKNOWN resets.
5. The retry uses the unchanged approved payload/time in a unique attempt execution of retained `postWorkflowV112`. This is an explicit late retry, not a date/copy change. Successful targets are untouched. Earlier execution IDs cannot consume the new attempt or overwrite its receipt.

Repeated operator requests carry stable operation IDs and expected attempt/revision. Enqueue repetition uses the same attempt workflow and atomic claim; the previous provider mutation is never replayed blindly. If enqueue fails, READY remains visible; repeat the same operation or inspect worker availability. “Queued” confirms local persistence only.

**Resume unclaimed target** is available only when every part of that target remains READY and the current revision, approval/media/account and publisher are eligible. It restores QUEUE state, records the acting publisher as the authorized originating principal for those unclaimed rows, and pokes the existing retained workflow without termination. It cannot resume a partially claimed target. Repeated resume requests remain claim-safe. **Cancel unclaimed remainder** uses Phase 2 cancellation; it preserves confirmed results and cannot undo already claimed provider mutations.

Read-only recovery checks run under the shared policy transaction, bounded to five seconds, to serialize current-grant/cancel/operator races. No lock spans a publishing mutation. The provider probe itself does not change remote state; unavailable results remain visible and retryable as read-only checks with a new operation ID.

## Supported API

Paths below are relative to `/agency` and require ordinary current staff authentication. GET responses are private/no-store. Mutations inherit the agency Origin checks for cookie authentication.

| Method / path | Contract |
| --- | --- |
| GET `actions` | Optional single-value client/owner/state/urgency/page filters; scoped SQL pagination/count. |
| GET `actions/:revisionId` | Exact permitted revision, safe receipts/history, eligible owners and next actions. |
| POST `actions/:revisionId/update` | `expectedRevision`, `operationId`, `expectedActionVersion` (0 before first record), `ownerId` (nullable), `disposition`, `note` (≤2,000 chars). |
| POST `actions/:revisionId/retry` | `expectedRevision`, `operationId`, `dispatchId`, `expectedAttempt`; explicit proof and current eligibility required. |
| POST `actions/:revisionId/reconcile` | Same command envelope; read-only probe and factual receipt persistence. |
| POST `actions/:revisionId/resume` | Same command envelope; wholly unclaimed current target only. |

Snapshot hashes and confirmed receipt identity are retained. Source media paths, settings, pending data, token values, raw exception bodies, legacy notes and unrelated client/member metadata are absent from the dashboard.

## Worker and provider limits

In local synthetic mode, `python3 scripts/agency/runtime.py status --worker-only` checks the recorded worker process/liveness, while the actual queue/receipt test demonstrates polling. `start/stop --worker-only` affects only the checkout-owned orchestrator with the same PID/start-time/UID checks; it leaves the HTTP API available for stalled-work diagnosis. Use the environment wrapper. Do not stop an unrelated process or infer readiness from a healthy port.

The file-backed synthetic external service proves rejection/acceptance/processing and supports read-only recovery; its rate-limit-once mode models a proved rejection followed by a successful explicit retry. The inherited live providers do not automatically gain unknown reconciliation or safe retry contracts. Their pending checks are inherited/unverified; live recovery must remain manual unless an explicit provider contract is implemented and verified in a later authorized phase. No live email/social publishing is evidenced by this phase. OAuth/reconnect UI and optional legacy surfaces retain their existing staged limits.

No durable outbound webhooks, monitoring platform, notification escalation, inbox or analytics reports are added. Phases 5–6 remain responsible for integrated hardening and independent-clone release acceptance.
