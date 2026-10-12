# Phase 5 — Integrated hardening and release readiness

Status lives in [project-state.json](../project-state.json). Read root AGENTS.md, PRODUCT-SPEC.md, TECHNICAL-SPEC.md and TEST-STRATEGY.md before starting.

**Prerequisite:** Phase 4 complete with evidence.

**Requirements:** V1-NFR-001, V1-NFR-002, V1-NFR-003, V1-NFR-004, V1-NFR-005.

## Ordered work

1. Run the complete requirements matrix across UI, API, MCP, jobs and provider contracts. Fill every traceability implementation/test reference; remove stale claims about untested surfaces.
2. Repeat race and failure cases with recorded seeds/iterations. Review authorization queries, media exposure, immutable revisions, claim boundaries, idempotent operator commands and Temporal replay compatibility.
3. Rehearse fresh installation, legacy migration, interruption recovery, backup and DB/media restore. Verify old binaries/jobs cannot bypass enforcement during rollback or upgrade.
4. Populate the priority-platform matrix with mock contracts and inherited limits. Run live smoke tests only for explicitly authorized accounts/apps; record date, media/account type and outcome separately. External approval gaps remain clear limitations for local RC.
5. Run the specified performance profile and mobile/keyboard usability cases. Inspect sensitive logs, dependency advisories, invitation/session boundaries and relevant CSRF/XSS behavior.
6. Fix release-blocking bugs, add focused regression tests and rerun affected suites. Record lower-severity issues with impact, workaround and owner; do not reclassify core failures to pass.
7. Complete integrated code/diff review, requirements audit and candidate readiness report. Update operational and security maintenance docs with the verified behavior.

## Explicit exclusions

New features from V2, production rollout, broad refactors/updates unrelated to V1 quality and fabricated live-provider readiness.

## Validation and bug loop

Execute T05-01, T05-02, T05-03, T05-04, T05-05, T05-06 from [TEST-STRATEGY.md](../TEST-STRATEGY.md), plus relevant regression from previous phases. Record actual commands, targets, versions, counts, failures, fixes and retest evidence. Inspect the final diff and update traceability; do not mark an unrun or mocked live test as passed.

## Completion gate

All internal acceptance and nonfunctional targets pass; no critical/high or required-workflow defects remain; migrations/restore are rehearsed and provider limits are truthful.

Create/update `docs/agency/evidence/phase-5.md` using the report template. Populate the phase checks in project-state.json. Run the plan checker, commit/push the reviewable result, and stop. The next valid implementation prompt is **Start phase 6**.
