# V1 technical design and invariants

This is the implementation contract, not a claim that these models or endpoints already exist. Phase 0 verifies code paths on the pinned release and records final mapping decisions before schema work. Keep the current Next.js/NestJS/Prisma/PostgreSQL/Redis/Temporal architecture.

## Source map to verify

- Schema: `libraries/nestjs-libraries/src/database/prisma/schema.prisma` (Organization, Customer, Integration, Post, Media, UserOrganization).
- Auth: `apps/backend/src/services/auth/`, including public authentication and permissions services.
- API: `apps/backend/src/api/routes/` and `apps/backend/src/public-api/routes/v1/`.
- Publishing: `apps/orchestrator/src/activities/post.activity.ts` and workflow versions in the orchestrator.
- Shared services: `libraries/nestjs-libraries/src/database/prisma/` and provider implementations under `libraries/nestjs-libraries/src/integrations/`.
- Tools/AI: `libraries/nestjs-libraries/src/chat/`; trace tool registration and every create/schedule call rather than assuming REST guards cover it.

The prior research inspected main at `3a7d28b7ad9654063f4f1f3938b8fe5d1590bf8f`. This derivative starts at released `91c91f633a0175fb3914dba64c932928c514b72a`. Findings are hypotheses to revalidate against the release. Existing marketplace approval fields are not general publishing approvals.

## Authorization model

Use one policy service receiving `{actor, organization, client, action, resource}`. The server resolves ownership from persisted records; request-supplied client IDs never establish access. Verify both parent and child ownership. Query scopes must be applied before pagination/counts/search and before serializers, downloads or signed URLs expose data.

| Principal/action | Admin | Editor | Publisher | Reviewer | Automation |
| --- | --- | --- | --- | --- | --- |
| Manage members, mappings, credentials | Agency only | No | No | No | No |
| Read assigned content | Agency | Assigned clients | Assigned clients | Review projection only | Explicit read scope |
| Create/edit drafts; submit review | With editor grant | Yes | With editor grant | No | Explicit write scope |
| Approve/request changes | With reviewer grant | With reviewer grant | With reviewer grant | Assigned review | No in V1 |
| Schedule/cancel/reconcile | With publisher grant | No | Assigned clients | No | Explicit schedule/cancel scope; never bypass approval |
| Read secrets/raw tokens | No routine UI read | No | No | No | No |

Authentication and subscription entitlements remain separate from authorization. Disabling Stripe must not widen access. Authorization is checked by API, internal service operations, jobs and tools. Administrators may configure client assignments, but reassignment cannot legitimize an already approved payload under a different client.

Credentials: random high-entropy secret, shown once, server stores a hash plus display prefix, organization ID, grant list, client/channel allowlists, created/expiry/revoked timestamps and last-used metadata. Deny missing scopes by default; no wildcard inherited from legacy org API keys. Sensitive comparisons use appropriate libraries. Existing org keys are inventoried and disabled for agency-mode publication until explicitly rotated/mapped. Tokens and sessions reference current grant state so revocation applies to future dispatch checks. Long-lived scheduled posts retain their originating principal identity and require its authorization at dispatch; reassignment requires an audited authorized action.

Explicitly inventory ordinary UI routes, public API, MCP, OAuth app sessions/callbacks, widget tokens, media URLs, connection invitations, previews/comments, lists/exports/analytics, signatures/templates/sets, webhook configuration, RSS/repeats/plugs, support/admin routes and direct internal service calls. Every path must be scoped or server-disabled for restricted principals. An organization-wide asset cannot become implicitly visible to every client.

## Conceptual data model

Reuse existing tables where practical; avoid a competing client hierarchy. Names here express responsibilities and can change through a recorded ADR.

| Entity | Minimum fields/constraints |
| --- | --- |
| Client assignment | Organization + Customer, staff principal/action grants; optional channel restriction; actor/time audit |
| Scoped credential | Organization, secret hash/prefix, client/channel/action grants, expiry/revocation, unique credential ID |
| Content revision | Organization/client, logical content/group ID, monotonically increasing revision, immutable normalized payload, payload hash, author/time |
| Review request | Revision ID, designated reviewer identity, state, submission time, expiry/cancel state; one active request per revision |
| Review decision | Exact request/revision/hash, actor, approve/changes requested, comment/time; append-only decision history |
| Review invitation/session | Client/reviewer binding, hashed one-time token, verification/expiry/revocation, limited session scope |
| Dispatch attempt/receipt | Revision + channel + occurrence + part, unique attempt/operation ID, authorization claim time, outcome, provider ID/URL if available, last reconciliation time |
| Agency action | Client/resource/revision, reason, severity, owner, open/resolved state, timestamp, linked receipt/decision |
| Audit record | Organization/client, actor type/ID, event, resource/revision, timestamp, redacted metadata |

Multi-channel logical content must belong to a single client. Reject mixed-client targets. Media must belong to the same client or have an explicit permitted share; V1 defaults to no sharing. Private thumbnails and review assets must use scoped authenticated access or short-lived signed access. Published assets needed by providers may use bounded capability URLs, with documented exposure and expiry; raw local static paths cannot remain an access-control bypass.

Media content in an approved revision is immutable: capture immutable object version/checksum and normalized file readiness. Replacing bytes, applying a crop, normalizing a video, or changing alt text after submission changes the revision. Referenced media cannot be deleted while awaiting/scheduled publication; retain an immutable copy or reject the deletion. These minimum safety rules do not include V2 asset folders or bulk operations.

## Review state and transitions

Review state is separate from upstream publishing state; do not overload `Post.state` with contradictory meanings.

| From | Action | To | Preconditions |
| --- | --- | --- | --- |
| Draft | Submit | In review | Authorized editor; valid targets; finalized media; reviewer selected; snapshot created |
| In review | Approve | Approved | Authorized designated reviewer; current revision/hash; unexpired active request |
| In review | Request changes | Changes requested | Same identity/revision checks; comment recorded |
| In review/Approved | Material edit | New draft revision | Expected revision matches; previous request/approval superseded; queued old work invalidated |
| Approved | Revoke/cancel approval | Revoked | Reviewer or explicit administrative cancel permission; no fabricated approval |
| Approved | Schedule | Approved + queued | Authorized publisher; exact snapshot; schedule still valid; dispatch not already claimed |
| Any pre-dispatch | Archive/cancel | Canceled | Authorized actor; pending work canceled; retain history |

Approval binds rendered copy per channel, media bytes/order/alt, account identity, platform settings, disclosures, link transformations/signatures and the proposed UTC timestamp plus display timezone. Comments/assignee changes are nonmaterial; all other edits default to material until specifically documented. An approval for a past timestamp cannot silently be moved to now. Every repeat occurrence needs its own approved revision/time in V1. Disable automatic generation of unsupervised recurring/plug publications if routing them through review is not implemented.

## Race-safe dispatch contract

1. All ingestion paths create scoped drafts or request scheduling of an approved revision. The service checks access, expected revision and request idempotency for the new V1 actions. No approval decision comes from an AI tool or prompt text.
2. Resolve final transformations before review; validate at scheduling and again before dispatch. Workers load the exact immutable payload; never publish the current mutable draft.
3. In a short database transaction, verify approval, cancellation, current actor grants, target/client ownership, connection status and media readiness. Atomically claim the unique `(revision, channel, occurrence, part)` dispatch identity. Serialize material edits/revocations and claims through the same lock/version mechanism. This is the linearization point, not a long transaction held open across a network request.
4. If revocation or an edit wins before the claim, no provider mutation occurs. If claim wins first, the approved snapshot may already be in flight; show this clearly. Subsequent edits create a new draft and do not rewrite the in-flight snapshot. Cancellation after dispatch is best effort and never a guarantee of remote removal.
5. Record attempts and read-only reconciliation evidence using the existing Temporal reliability semantics. Provider mutation success, known failure, pending asynchronous processing, and uncertain timeout are distinct. A DB write failure after remote success is uncertain and requires reconciliation, not another mutation.
6. Each delayed part checks its own current eligibility. Already published parts remain published if later parts are canceled; the dashboard presents partial completion. Old workflow versions and already queued legacy work must be paused/reconciled during migration rather than allowed to bypass new guards.

Temporal workflow changes require deterministic-versioning/replay review. Do not assume “retry activity” is safe for a provider mutation. Retain current provider-specific retry classification and unknown-outcome handling. Exactly-once remote publication cannot be promised across a third-party API lacking idempotency or reconciliation support.

## API and UI contracts

Extend existing route conventions after Phase 0 mapping. Proposed agency operations are: assign client/grants; create/revoke credential; submit revision; get client review batch; decide revision; cancel review/queue; list agency actions; claim/assign/resolve action; reconcile a receipt; retry a known-safe failed target. This is not a general-purpose V2 edit/reschedule API project.

- Mutating revision operations carry `expectedRevision`; return a structured 409 conflict if stale. Never silently approve a newer version.
- Approval and dashboard commands take operation IDs; repeated identical operations return the recorded outcome. Reusing an ID with a different payload conflicts. This local command safety is distinct from V2 arbitrary-source intake deduplication.
- Use 401 for unauthenticated, 403 or consistent non-enumerating 404 for inaccessible resources, 409 for revision/dispatch conflicts, and 422 for invalid transitions/settings. Do not leak object existence across clients through errors/counts.
- Paginate action and review lists; server applies client scope before filters. Bulk decisions check each revision independently and return item-level results; show partial success to the reviewer.
- Review invitations default to 7-day expiry, configurable downwards by the admin. Exchange a random one-time link plus email ownership verification (or existing authenticated account with matching identity) for a narrow session, default maximum 24 hours and never beyond invitation expiry. No approval via GET, no decisions in URL parameters, no raw tokens in logs/referrers/analytics. Revoke sessions when invitation or reviewer access is revoked.
- Use a local mail sink in test mode. Real invitation delivery requires configured email credentials; do not fake email verification to avoid that prerequisite.
- Portal uses minimal review projections. No internal notes, unrelated clients, token details or admin functionality. Escape comments and provider text; use CSRF/session protections and rate limits.

## Dashboard definition

Create or reconcile actions for review pending/changes requested, approval invalidated, connection blocked, due publication not progressing, provider known failure, uncertain result and partial completion. Include client, channel, content/revision, scheduled time/timezone, reason, owner, last update and the next permitted action.

Outcomes have factual meanings: `saved` means persisted; `scheduled` means queued for a time; `submitted/processing` means accepted but not confirmed; `published` requires provider evidence; `failed` means known unsuccessful; `unknown` requires reconciliation. Use existing upstream statuses internally with an explicit projection table verified in Phase 0. Do not manufacture successful receipt URLs or treat acknowledgment as publication.

Assignment, acknowledgment and dismissal do not change the publication result. Failed retry actions must remain visible. Repeated operator clicks are serialized/idempotent. External monitoring, new outbound lifecycle webhooks, email escalation pipelines and a full observability platform are V2; use existing notification channels where suitable.

## Migration and deployment design

Phase 0 defines the schema migration baseline because upstream provides `db push` scripts. Phase 1 implements reviewed versioned migrations. Prefer additive changes and indexes, backfill in bounded batches, then enforce constraints after reconciliation. Do not infer client ownership from names. Mixed/unassigned legacy groups enter an admin-only quarantine and cannot publish.

Use maintenance mode/drain for existing queued work, snapshot DB and media, map memberships/channels, migrate, verify invariants, then enable dispatch. No auto-approving legacy scheduled content. Fresh installations start with empty scoped records. Seed data is synthetic and uses a test provider with no external network side effects.

Rollback procedures distinguish reversible application rollback from schema/data restore. Never roll back to a binary that can bypass enforcement on active agency data; pause dispatch and restore a compatible DB/media snapshot if necessary. Rehearse install, migration from representative legacy fixtures, interrupted migration recovery, and restore. Publicly document only supported deployment commands after they are actually tested.
