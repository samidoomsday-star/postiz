# Phase 0 — Baseline and test foundation

Status lives in [project-state.json](../project-state.json). Read root AGENTS.md, PRODUCT-SPEC.md, TECHNICAL-SPEC.md and TEST-STRATEGY.md before starting.

**Prerequisite:** planning foundation complete.

**Requirements:** V1-BASE-001.

## Ordered work

1. Inspect this pinned release, its nested agent instructions, manifests, source paths, schema and workflows. Record the difference from the research commit; reproduce relevant findings before calling them defects.
2. Resolve Node engine/Volta/cloud conflicts with a supported exact Node 22 patch and pnpm 10.6.1. Perform a frozen install; inspect native/build failures and apply only justified baseline repairs. Record each dependency/lockfile change.
3. Prepare minimal required PostgreSQL, Redis, Temporal, storage and app services in an isolated development setup. Bind development services appropriately; use generated local secrets and a mail sink. Verify optional AI behavior without starting a V2 AI project.
4. Inventory every read/write/publication path, including API, MCP, workers, OAuth/widgets, public preview/media, RSS, repeats and plugs. Create evidence/entry-paths.csv with path, actor, data scope, external side effects, planned enforcement point and test case. Record provider result semantics and existing retry/reconciliation behavior.
5. Select and prove the unit/integration/browser test harness. Add a synthetic provider mode and fixture seed with multiple agencies/clients; prevent external publishing in tests by design. Include a receipt-producing worker smoke test and a deliberately denied/failing case that proves assertions execute.
6. Design the versioned migration baseline for fresh and representative legacy databases, private media access strategy and dispatch claim/version approach. Record ADRs and any risks that change Phase 1 implementation details.
7. Add tested development scripts and build/test CI, preserving the planning checker. Pin service/tool versions as supported; CI must execute actual tests and preserve failure exit codes. Do not restore upstream publishing or auto-merge workflows.
8. Complete install/build, functional smoke and restart checks. Update DEVELOPMENT.md with commands actually run, artifacts and prerequisites; save reusable cloud setup/start configuration after those commands work.

## Explicit exclusions

Client authorization features, approval schemas/UI, dashboard features and every V2 enhancement. Baseline fixes are allowed only when needed to run or test V1.

## Validation and bug loop

Execute T00-01, T00-02, T00-03, T00-04 from [TEST-STRATEGY.md](../TEST-STRATEGY.md), plus relevant regression from previous phases. Record actual commands, targets, versions, counts, failures, fixes and retest evidence. Inspect the final diff and update traceability; do not mark an unrun or mocked live test as passed.

## Completion gate

A second run of the documented setup/smoke succeeds, required apps build, worker consumes a synthetic task, and every entry path has an enforcement plan. Failed baseline prerequisites block Phase 1.

Create/update `docs/agency/evidence/phase-0.md` using the report template. Populate the phase checks in project-state.json. Run the plan checker, commit/push the reviewable result, and stop. The next valid implementation prompt is **Start phase 1**.
