# Phase 1 — Client boundaries and scoped access

Status lives in [project-state.json](../project-state.json). Read root AGENTS.md, PRODUCT-SPEC.md, TECHNICAL-SPEC.md and TEST-STRATEGY.md before starting.

**Prerequisite:** Phase 0 complete with evidence.

**Requirements:** V1-AUTH-001, V1-AUTH-002, V1-AUTH-003, V1-AUD-001.

## Ordered work

1. Implement versioned additive migrations and client/resource ownership based on the Phase 0 ADRs. Backfill representative fixtures; quarantine ambiguous legacy data and pause unsafe queued work.
2. Implement the shared server authorization service and role/action grants. Keep subscription entitlements separate; enforce parent/child ownership and scopes before queries expose counts or records.
3. Implement client/member/channel assignment UI and scoped credential creation, display-once secret, expiry and revocation. Default automation to draft-only; inventory and rotate/disable legacy organization keys.
4. Apply enforcement to every inventoried path: ordinary UI, public API, MCP, OAuth/widget access, connection links, previews, protected media, analytics/exports and jobs. Server-deny unsupported restricted-principal surfaces and document their limitation.
5. Implement audit foundation for assignments, grants and credentials with redacted metadata and authorized reads. Add minimal UI needed to inspect granted access.
6. Exercise two agencies/two clients, direct IDs, lists, mixed-client targets, expired/revoked identities, media access and billing-disabled configurations. Rehearse migration and rollback/restore on disposable fixtures.
7. Update entry-path inventory, traceability, migration runbook and tests. Review query scopes and all bypass candidates before marking the phase complete.

## Explicit exclusions

Approval workflow, weekly review portal, agency action dashboard, richer asset management and all other V2 work.

## Validation and bug loop

Execute T01-01, T01-02, T01-03, T01-04, T01-05 from [TEST-STRATEGY.md](../TEST-STRATEGY.md), plus relevant regression from previous phases. Record actual commands, targets, versions, counts, failures, fixes and retest evidence. Inspect the final diff and update traceability; do not mark an unrun or mocked live test as passed.

## Completion gate

Client/agency isolation holds for every inventoried surface; scoped keys cannot escalate privileges; existing data is mapped or quarantined; migration and audit tests pass.

Create/update `docs/agency/evidence/phase-1.md` using the report template. Populate the phase checks in project-state.json. Run the plan checker, commit/push the reviewable result, and stop. The next valid implementation prompt is **Start phase 2**.
