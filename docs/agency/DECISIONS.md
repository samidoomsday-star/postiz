# Decision log

## ADR-001 — Focused V1 (accepted 2026-10-12)

The owner explicitly confirmed client permissions, enforced approvals and the agency action dashboard for V1. Remaining enhancement suggestions stay in V2 with no implementation during V1. Necessary shared controls, review portal and local release engineering are included. This overrides the original research's broader priority ordering.

## ADR-002 — Pinned released baseline (accepted 2026-10-12)

Use upstream Postiz v2.25.1 at `91c91f633a0175fb3914dba64c932928c514b72a`. Preserve history/license. Disable inherited automation and automatic update merges; manually review security and compatibility fixes. Pinning does not mean ignoring vulnerabilities. Research against upstream main must be revalidated on this release.

## ADR-003 — Existing architecture, agency/client hierarchy (planning default)

Retain existing frontend/backend/orchestrator/provider engine. Organization is an agency; existing Customer is the starting client boundary. No new platform service or scheduling rewrite. Phase 0 verifies mapping feasibility; implementation changes are recorded here if evidence requires them.

## ADR-004 — Approval binds final content and time (planning default)

Approval references an immutable revision and exact publishable payload including schedule. Changes invalidate approval. One designated verified reviewer suffices. Owners do not have an implicit bypass. Approval and worker dispatch are enforced in services, not UI or AI prompts. Dispatch claim defines the revocation race boundary; external publication cannot be undone by a local state change.

## ADR-005 — Local release candidate before live readiness (planning default)

All mandatory internal tests use isolated synthetic data/provider mode. Live-platform credentials, audits and actual publication are explicit later operations. Local V1 completion requires a truthful provider matrix, not an unprovable claim that every network is ready.

## ADR-006 — Sequential prompts and durable state (accepted execution model)

Each phase prompt authorizes its complete implementation/test/fix cycle and stops at the phase boundary. State/report files persist progress across sessions. Phase PRs are reviewable and not automatically merged. If pending, subsequent phases can build on the tested branch; the final candidate branch must contain the entire result.

## ADR-007 — Archived upstream automation (setup decision)

Archive all inherited executable workflow files and the dependency-update configuration, preserving originals. They include automatic staging merges and upstream publishing destinations. Introduce only a read-only planning validation workflow now. Phase 0 adds tested build/test CI. This is repository setup, not application implementation. GitHub repository-level security/bot/branch-protection settings have not been changed or verified.

## Decisions Phase 0 must resolve from evidence

| Topic | Required output | Default constraint |
| --- | --- | --- |
| Toolchain conflict | Exact Node 22 patch plus pnpm 10.6.1 verified; reconcile stale Volta/docs pins | Respect package engines and frozen lockfile; record any needed repair |
| Test harness | Executable integration and browser harness, commands, actual counts | Existing scripts are not evidence of working tests |
| Schema baseline | Migration strategy for fresh and legacy DBs; transaction/index support | No destructive db push on existing data |
| Dispatch boundaries | Complete entry-path map and existing Temporal reliability/version behavior | Preserve safe upstream mutation retry semantics |
| Media access | Authenticated/signed access compatible with provider fetches | Client isolation covers URLs and bytes |
| Optional startup dependencies | Minimal required services and AI behavior verified | Narrow blocker fix only; no V2 AI provider project |

Update accepted decisions when evidence changes them. Open technical choices are Phase 0 work, not reasons to start product implementation during the planning task.

## ADR-008 — Phase 0 toolchain and harness (accepted implementation default, 2026-10-13)

Pinned Node 22.23.3 and pnpm 10.6.1; reconciled Volta with package engines. Local tools/caches stay inside ignored .agency paths. Frozen lockfile integrity is retained. Prisma uses the locked local CLI; existing Playwright 1.58.2 is declared directly without refreshing other resolutions. Vitest replaces the unusable undeclared-Nx root test entry point; actual PostgreSQL/HTTP/Temporal/browser tests use Playwright. Test-provider mutation journals deliberately do not deduplicate calls, so duplicates cannot be concealed by the double.

## ADR-009 — Local baseline services and fonts (accepted implementation default, 2026-10-13)

Use digest-pinned PostgreSQL/Redis, persistent Temporal SQLite dev mode, Mailpit and local media storage. No upstream app image, Elasticsearch, admin UIs or live provider credentials are required. Explicit synthetic mode registers only the test provider and validates the database/acknowledgment. Bundle the same licensed font family locally with verified npm package integrity. Existing system Chromium is supported for cloud browser tests; CI installs the pinned Playwright browser. Optional MCP/AI startup successfully initialized without an OpenAI key on this release; no V2 AI implementation change was necessary.

## ADR-010 — Phase 1 migration, media and dispatch handoff (accepted design, 2026-10-13)

Prisma's versioned migration directory is the source of truth for future V1 schema changes. Establish a baseline from the schema-only SQL generated in Phase 0; for existing data, compare actual schema before marking that baseline applied. Mastra owns additional tables and its own initialization; do not delete or baseline them as Prisma tables. Reconcile/quarantine legacy client assignments before constraints or worker dispatch resumes. Versioned migrations and recovery tests are Phase 1 work, not something the Phase 0 db-push bootstrap proves.

Private media must resolve ownership and actor/capability authorization before bytes or thumbnails are served. The current Next upload handler confines filesystem traversal but remains publicly accessible; Phase 1 must protect/disable it, and provider-fetch capabilities must be narrow. The canonical publishing boundary is the shared PostActivity before provider mutation; all retained workflow versions use shared activities. Later approval enforcement must load an immutable revision and serialize dispatch claim vs revocation, with replay/version review. Preserve V112's distinction between read-only retries and irreversible mutations; do not add blind SDK mutation retries.

The 344-entry inventory includes 239 HTTP routes, 11 MCP transports, 20 registered tools, one media-byte handler, 33 provider plug/tool bindings, 18 shared service/activity boundaries and 22 workflows. This is static coverage of identified entry surfaces; each later phase must inspect implementations and enforce/test the supported path or server-disable it. Main research differs from the released source only in an Instagram upload error message; no main commits were merged.

## ADR-011 — Conservative staged agency access (accepted implementation default, 2026-10-13)

Phase 1 enables the new `/agency` namespace and access-management workspace. Legacy organization-wide resource routes are denied for every principal by a global Nest guard; the standalone MCP transports are disabled/unregistered separately. Ordinary authenticated self-information remains available with the raw legacy key removed. Local sign-in is available; legacy social-login, invitation-cookie joins, widgets, callbacks, connection links, public previews, exports, analytics, admin/support impersonation and automation routes are closed until their client policy can be verified. Adding a method to a legacy controller does not implicitly open it.

This is an intermediate security boundary, not permanent deletion of the Postiz editor/calendar or an authorization to build a replacement editing product. Phase 2 must integrate the retained editor/media and immutable review/schedule operations through scoped services; only deliberately adapted legacy endpoints may reopen. Phase 3 owns verified reviewer invitations. Unsupported optional surfaces may remain explicitly disabled at V1 release, with their limitations documented. V2 feature work remains excluded.

Use existing Customer/Integration ownership, explicit EDITOR/PUBLISHER/REVIEWER grants and hashed expiring scoped credentials. Agency administrators can read/administer their agency; editing and scheduling still require explicit action grants. New-content scheduling needs edit plus publish rights; Phase 2's schedule-existing-revision action needs publisher rights. Automation defaults to read/draft only and cannot administer or approve. Reviewer-only grants expose no raw drafts until the scoped portal projection exists. Losing the credential creator's active administrator membership invalidates its keys.

Media bytes are authenticated and private/no-store; canonical paths reject symlink escape. Cloud/public media and provider-fetch publication capabilities are unsupported until bounded private access is implemented. Text-only synthetic dispatch remains available in Phase 1 to verify current grants at the shared activity boundary. Pending finalization, unsupervised repeats, RSS, provider plugs, legacy media/AI/clipping jobs and organization-wide content notifications are disabled. No Temporal workflow version was edited. Approval and atomic claim semantics remain Phase 2 work, so Phase 1 is not a production publishing release.

## ADR-012 — Immutable approvals and dispatch linearization (accepted implementation default, 2026-10-13)

Phase 2 implements [APPROVALS.md](APPROVALS.md). Additive models capture work, canonical immutable revisions, assigned review requests/decisions, actor-scoped command effects, per-target/part/stage dispatch receipts and private media snapshots. Every material edit creates new Post IDs and a new revision; old workflow payloads cannot reference newly approved content. SQL immutability and per-agency policy locks supplement server authorization. The linearization point is the current-eligibility transaction that sets dispatch CLAIMED; no database lock spans a provider request.

Retain Temporal workflow source and replay behavior. The shared activities claim publish/comment/finalize operations, use frozen final payloads and record conservative uncertainty. Scheduling pokes existing workflows instead of terminating them. Repeated claims return only confirmed cached receipts or deny; unknown/pending claims cannot blindly mutate again. A finalization stage has its own claim and current policy check. Read-only probes bind the stored pending receipt/account. Confirmed receipts control legacy published-state projection so old workflow redelivery cannot erase an accepted result.

Private local media is copied before review and verified at eligibility checks; provider fetches use short-lived signed snapshot/dispatch capabilities. Capability URLs are omitted from synthetic journals. Reviewer grants authorize assigned revision previews/decisions, not raw client draft browsing. `/agency` reuses the retained rich editor/calendar while legacy resource controllers remain denied. External invitations, agency action queues and V2 enhancements remain in their later scopes.

## ADR-013 — Verified client review realm (accepted implementation default, 2026-10-13)

Use a separate `/review` root layout and `/agency/review` API realm. Invitations provide review-only, client/channel-bound permission without widening unique existing AgencyGrant rows. Reuse/create a passwordless LOCAL human principal with USER membership; one-time link plus mailbox code/browser nonce establishes a narrow opaque session. Persist only hashes/HMACs, enforce expiry/revocation/current memberships and durable attempt limits, and send sensitive mail directly through the existing transport rather than Temporal history. Decisions retain their originating invitation and reuse Phase 2's locked immutable state machine. Session context is server-created and cannot administer, edit or schedule.

Weekly assigned projections filter before pagination and show frozen final copy/media/time/account. Public review feedback is separate append-only storage; it does not invalidate approval or expose legacy internal notes. Publication options are restricted to registered provider DTO fields with private fields removed. Renewal closes old access and leaves approvals bound to their original permission; unavailable historical approvals are not shown as eligible. See [REVIEW-PORTAL.md](REVIEW-PORTAL.md) for exact contracts, protections and limits. Existing workflow-version source and upstream/dependency pins remain unchanged.

## ADR-014 — Factual action queue and proof-bound recovery (accepted implementation default, 2026-10-13)

Use existing work/revision/dispatch facts for `/agency/actions`, scoped to current staff access before SQL filters/pagination. Append nonmaterial versioned assignment/acknowledgment records and immutable recovery evidence. Partial and uncertain earlier outcomes survive edits/cancellation; confirmed receipt identity cannot be rewritten. Metadata disposition never changes publishing status. See [ACTION-DASHBOARD.md](ACTION-DASHBOARD.md) for projection priorities, API and operator steps.

Safe retry is opt-in by provider contract, not inferred from BadBody/HTTP errors. Require a closed prior workflow, a single publishing part in FAILED, read-only positive no-side-effect proof, valid current approval/media/account/publisher, immutable proof evidence and a monotonically increasing attempt. Each retry executes retained postWorkflowV112 with an attempt-specific workflow ID; shared activities reject earlier execution IDs and stale receipt writes. Resume only wholly unclaimed targets, audit the authorized current publisher and retain successful targets. UNKNOWN/PENDING/CLAIMED never reset to READY.

Reconciliation is read-only and receipt/account-bound. Pending contracts may confirm existing results or report processing/ready; finalization remains the existing worker's job. Unknown reconciliation needs an explicit capability. Unsupported/unavailable evidence stays unresolved with staff investigation notes and no manual force-publish/resend. Recovery reads run under the shared policy transaction with a five-second deadline; no lock spans a provider mutation. Inherited live retry/unknown reconciliation remain unsupported until separately implemented and verified. No publishing workflow source, dependency pin or upstream baseline changes.

## ADR-015 — Phase 5 provider safety, query performance and security maintenance

Agency publication/comment/finalization operations run in a request-local AsyncLocalStorage context. The inherited HTTP/streamed helper cannot retry ambiguous 429/5xx/provider-retry responses inside that context; the result remains uncertain and needs factual reconciliation. Provider failures are replaced with stable categories before entering Temporal/error persistence. Read-only provider probes redact failures without changing their retry policy. Shared workflow source remains unchanged; replay validation is still required for the final activity binary. A confirmed same-attempt receipt is idempotent against a late matching completion; stale attempts or conflicting identity remain denied, and late failure cannot append a false unknown audit.

TikTok inbox upload is explicitly unsupported for V1 agency publication: deny UPLOAD at creation and dispatch eligibility and reject an inbox result as confirmation. Direct publication remains inherited/unverified live functionality. Building a human inbox-completion product is outside focused V1. Provider contracts in platform-matrix.csv identify precisely which offline paths were tested.

The dashboard obtains a request-local bulk current membership/grant/client/channel read scope. It does not cache authority across requests or change dispatch checks. Materialize scoped facts/classification once, and disable PostgreSQL JIT only inside the dashboard query's own transaction: the measured old plan compiled 638 functions for 518.6ms of a 792.8ms query. Preserve filters/counts/scope before pagination. The 1s/3s performance targets are unchanged.

Review current dependency advisory data manually. Targeted security patches for enabled HTTP/media/editor/transports are permitted on the frozen upstream base, with integrity-preserving frozen install and integrated tests. Align the editor's ProseMirror model to one compatible 1.25.12 version; never bypass its type mismatch with casts or disable checks. Remaining optional/developer advisories have explicit reachability limits, not zero-advisory certification. Invitation transport accepts one bounded ASCII mailbox; no display names/address lists/comments or arbitrary mail options.

Phase 5 final review refinement: a terminal SDK exception alone is also insufficient to label an attempt FAILED. Reload the current attempt and require a bounded positive provider no-side-effect contract; otherwise record UNKNOWN. This includes an error after an earlier stage accepted a mutation. Live providers without that explicit contract stay uncertain/manual. Reconciliation and retry remain independent audited operations; exception type never authorizes a resend.

## Phase 6 local installation isolation (14 October 2026)

New synthetic configurations generate a unique Compose project name so independent checkouts cannot adopt one another's persistent volumes. Preserve existing environment/project bindings for upgrades. Host ports remain fixed: only one checkout is active at a time. This is release setup required by V1-REL-001, with no new product scope or schema/workflow change. See P6-001 and LOCAL-TESTING.md.
