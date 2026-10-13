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
