# Phase 4 — Agency action dashboard and safe recovery

Status lives in [project-state.json](../project-state.json). Read root AGENTS.md, PRODUCT-SPEC.md, TECHNICAL-SPEC.md and TEST-STRATEGY.md before starting.

**Prerequisite:** Phase 3 complete with evidence.

**Requirements:** V1-DASH-001, V1-DASH-002, V1-DASH-003.

## Ordered work

1. Implement a scoped projection/action queue for review pending, changes requested, invalidated approval, disconnected channel, stalled due work, known failure, uncertainty and partial completion. Reuse upstream lifecycle facts.
2. Add paginated client/owner/state/urgency filtering and a detail view linking revision, schedule, last update, audit history and factual per-target receipts. Avoid exposing unrelated client metadata.
3. Add assignment/acknowledgment and permitted next actions. Distinguish saved, scheduled, submitted/processing, confirmed published, failed and unknown. Dismissal does not change the actual publish result.
4. Implement read-only reconciliation and safe retry only where the existing provider contract proves the previous attempt failed without a side effect. Unsupported reconciliation requires a clear manual resolution path, never automatic resend.
5. Serialize repeated operator commands, verify current grants, audit outcomes and preserve successful targets when one target fails. Capture worker-not-polling/due-work symptoms without claiming an HTTP health check proves readiness.
6. Inject rate limits, disconnected accounts, asynchronous processing, partial failure, timeout after acceptance, DB failure after success and worker restart. Prove no duplicate mutation on uncertain outcomes.
7. Update operator runbook, status projection table, requirement tests and screenshots of the actual implemented flows.

## Explicit exclusions

Durable outbound webhooks, universal monitoring platform, notification escalation overhaul, social inbox, analytics reports and all other V2 enhancement work.

## Validation and bug loop

Execute T04-01, T04-02, T04-03, T04-04, T04-05 from [TEST-STRATEGY.md](../TEST-STRATEGY.md), plus relevant regression from previous phases. Record actual commands, targets, versions, counts, failures, fixes and retest evidence. Inspect the final diff and update traceability; do not mark an unrun or mocked live test as passed.

## Completion gate

Agency staff can find and resolve a failed/blocked publication without losing successful results, crossing clients or blindly retrying an unknown remote outcome.

Create/update `docs/agency/evidence/phase-4.md` using the report template. Populate the phase checks in project-state.json. Run the plan checker, commit/push the reviewable result, and stop. The next valid implementation prompt is **Start phase 5**.
