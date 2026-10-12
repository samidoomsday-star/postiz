# Phase 6 — Local release candidate and handoff

Status lives in [project-state.json](../project-state.json). Read root AGENTS.md, PRODUCT-SPEC.md, TECHNICAL-SPEC.md and TEST-STRATEGY.md before starting.

**Prerequisite:** Phase 5 complete with evidence.

**Requirements:** V1-REL-001.

## Ordered work

1. Assemble all completed phase commits into a single new release-candidate branch without discarding user work or force-pushing shared history. Record its exact commit and prerequisites; pending phase PRs do not imply main is updated.
2. Finish validated local install/run/test/stop/restart scripts, environment examples, pinned image/tool versions and a synthetic demo seed. The demo must run the derivative code and require no real social credentials.
3. Write a local tester guide with accounts/roles, prepare-review-publish-recover tasks, expected results, limitations, troubleshooting and bug-report template. Separate optional real-account connection instructions.
4. Clone the candidate independently into a clean directory and execute the documented path without relying on hidden files, prior node_modules, cloud credentials or absolute workspace paths. Run required tests and inspect actual synthetic workflow behavior.
5. Rehearse restart and restore from the same candidate; verify no tracked-file edits are needed to configure a local environment. State tested OS/architecture/hardware and unsupported environments.
6. Complete release checklist, license/corresponding-source notice, known issues, support matrix, final test report and release notes. Describe it as a local release candidate, not production-ready on every network.
7. Push the cloneable candidate branch to the owner repository when available, verify its remote commit, and give the exact clone command and first-run instructions. Prepare a reviewable PR if appropriate; do not merge, tag, publish containers or deploy without authorization.

## Explicit exclusions

V2 implementation, automatic release publication, live customer onboarding or production deployment.

## Validation and bug loop

Execute T06-01, T06-02, T06-03 from [TEST-STRATEGY.md](../TEST-STRATEGY.md), plus relevant regression from previous phases. Record actual commands, targets, versions, counts, failures, fixes and retest evidence. Inspect the final diff and update traceability; do not mark an unrun or mocked live test as passed.

## Completion gate

A fresh clone of a GitHub branch containing the complete V1 passes the documented local synthetic journey, with final evidence and no undisclosed setup dependencies. If push is blocked, local work can be finished but the GitHub handoff gate remains blocked.

Create/update `docs/agency/evidence/phase-6.md` using the report template. Populate the phase checks in project-state.json. Run the plan checker, commit/push the reviewable result, and stop. The next step is owner local acceptance testing; V2 needs a new scope decision.
