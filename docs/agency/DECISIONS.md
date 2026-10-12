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
