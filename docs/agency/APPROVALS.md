# Revision approval contract

Phase 2 enables internal authenticated reviews in `/agency`; verified external invitations and the client portal belong to Phase 3. The supported publishing path is draft → review → approval → schedule → atomic claim → receipt. Legacy HTTP/MCP ingestion, scheduling, repeats, RSS, plugs and media automation remain server-disabled.

## Supported API

Every authenticated route resolves a current user or scoped credential on the server. A work item belongs to exactly one agency/client; every target must be currently accessible. Owners need explicit editor, publisher or reviewer grants for those actions. Automation cannot approve.

| Method and `/agency` path | Behavior |
| --- | --- |
| POST `posts` | Validate a Postiz draft body and capture immutable revision 1; returns per-target post/work/revision IDs. `type` must be `draft`. |
| POST `works/:id/revisions` | Same draft body plus `expectedRevision` and `operationId`; creates new post/part IDs and supersedes old approval. |
| POST `works/:id/submit` | Command plus designated `reviewerId` and optional `expiresAt` (within seven days). Requires current editor and a reviewer eligible for all targets. |
| POST `works/:id/approve` | Current designated human reviewer decides the exact revision/hash; requires explicit reviewer grants. |
| POST `works/:id/changes` | Same permission; requires a nonempty comment up to 4,000 characters. |
| POST `works/:id/schedule` | Current publisher schedules only an approved, unexpired, future revision. Uses its stored times/payload, never request-body replacements. |
| POST `works/:id/revoke` | Designated reviewer or agency administrator revokes approval. |
| POST `works/:id/cancel` | Publisher or agency administrator cancels unclaimed queued work. |
| GET `works/:id`, `clients/:id/works` | Current scoped revisions, decisions and safe receipts; list filters before its 50-item limit. |
| GET `reviews` | Only assigned, current, authorized internal requests; filtered before its 100-item limit. |
| GET `clients/:id/reviewers` | Editor can choose currently eligible staff; the submit operation validates channel eligibility again. |
| POST `clients/:id/media` | Authenticated multipart private upload; maximum 20 MB; supported MIME types JPEG, PNG, GIF, WebP, MP4, WebM; optional source `alt`. |
| GET `revisions/:revision/media/:snapshot` | Authenticated owner/client reader or designated authorized reviewer; private immutable bytes, ranges, no-store. |
| GET `assets/:snapshot?cap=...` | Read-only provider access with signed snapshot/dispatch binding and maximum 30-minute expiry. No general content access or mutations. |

All commands require a positive integer `expectedRevision` and bounded UUID `operationId`. The ledger is scoped by agency and actor. Repeating the same command returns its original stable effect after current authorization; reusing the ID for a different command conflicts. Stale revisions return 409. Denied resources return 404 or credential/authentication errors. Schedule returns `enqueued`; false means Temporal was unavailable or the cached revision is no longer scheduled, and does not imply publication. Repeating that exact schedule command safely retries enqueue while the revision remains eligible.

## Material revision and state rules

An immutable JSON payload and canonical SHA-256 hash capture final per-channel message, provider settings, channel/account identity, UTC publication time, display timezone and ordered parts/media. Local bytes are copied into private immutable snapshots before review, including required JPEG conversion. A revision is bounded to 100 media assets and 100 MB total frozen bytes; failed/uncommitted copies are removed. Source identity, metadata fingerprint and original/final byte hashes are checked again at review, scheduling and dispatch. Arbitrary request-body text/media/settings cannot replace the approved payload at dispatch.

| Current state | Allowed transition |
| --- | --- |
| DRAFT | Submit → IN_REVIEW |
| IN_REVIEW | Designated decision → APPROVED or CHANGES_REQUESTED |
| APPROVED | Schedule → SCHEDULED; revoke/cancel; edit → new DRAFT |
| SCHEDULED | Dispatch claims and receipts; revoke/cancel; edit → new DRAFT |
| Any editable current revision | Material edit → new revision in DRAFT; old review → SUPERSEDED |
| Current draft/review/approval/schedule with changed media bytes | INVALIDATED; create and review a new revision |
| SCHEDULED with every publishing part confirmed | PUBLISHED |

Decisions, revisions, snapshots and command ledger rows reject database UPDATE/DELETE. Material Post fields and part structure are immutable. Current Media metadata/deletion changes referenced by an active review are rejected; changed filesystem bytes invalidate eligibility. Review feedback itself does not modify approved content. There is no silent auto-approval or default owner bypass. Changing copy, media order/alt, settings, target or time requires a new reviewed revision. Unsupported recurrence/link-shortening/tag automation is rejected rather than evaluated after approval.

## Race and receipt semantics

A PostgreSQL transaction takes a per-agency advisory lock before current membership/grant, review, channel and media eligibility checks. Policy mutations participate in that lock. Expected versions and unique command/dispatch constraints resolve concurrent edits/decisions/schedules. The lock is released before contacting a provider.

Revocation/edit that commits first prevents an unclaimed mutation. A claim that commits first permits exactly that frozen mutation to finish: revocation returns `inFlight: true` and cannot promise to undo it. Parts with delays claim independently when due; canceling the remainder retains confirmed earlier receipts. An initial provider upload and its later finalization have separate claims; finalization rechecks current approval/grants/account. Read-only pending probes bind a persisted receipt and current account; they can report an already accepted outcome after approval revocation.

Dispatch states are READY, CLAIMED, CONFIRMED, PENDING, FAILED or UNKNOWN. Provider acceptance followed by a lost response/database failure remains UNKNOWN. Existing claimed/unknown mutations never execute again on activity/workflow redelivery. A confirmed receipt can be projected again without another provider call, and stale workflows cannot overwrite its factual published state. Multi-part uncertain failures conservatively retain uncertainty. Dashboard reconciliation/retry controls belong to Phase 4; no blind-retry endpoint is available.

Workflow source/version files remain unchanged. Activities hand the immutable payload to retained provider methods. Policy denials use the workflow's existing nonretryable `bad_body` contract, preventing denial from entering retry timers. Schedule uses `signalWithStart`/USE_EXISTING, which does not terminate an in-flight workflow.

## Staged UI and provider limits

The scoped internal workspace reuses Postiz's Tiptap editor and month calendar. It shows exact final per-target copy, media hash/previews, proposed local time, review feedback, approval state, receipts and in-flight messaging. Calendar interaction opens the revision; drag-based legacy rescheduling remains closed. Editing preserves later thread parts rather than silently deleting them.

The minimal internal editor changes the first-part copy across selected targets and preserves captured provider settings and later parts. Advanced provider-specific options and multipart editing use the scoped validated draft API at this stage; this is not a claim of complete upstream UI parity. Provider-specific valid settings must be supplied to that API. Private media storage is local only; cloud storage variants and optional unsupported forms stay closed. Live OAuth/provider contracts, performance and the final integrated UX are Phase 5 gates. The current evidence uses only synthetic external services, and does not certify live platform publishing.
