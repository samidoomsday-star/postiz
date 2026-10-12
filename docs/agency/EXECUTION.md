# Agent phase workflow

## Start and resume

1. Read root AGENTS.md and check git status/branch/remotes. Do not assume previous tasks merged their branches. Check the recorded tested commit and preserve user work.
2. Run `python3 scripts/agency/plan.py check`, then `python3 scripts/agency/plan.py next` or `phase N`. The latter rejects skipping dependencies and simply prints the eligible specification. It performs no installation or implementation.
3. Read that phase, its evidence report if any, the product/technical/test specs and applicable nested instructions. Reconcile previous evidence with the current checkout. Continue from the first unfinished task rather than redoing completed unrelated work.
4. Mark the selected phase active; write an execution plan. Technical choices that fit the agreed requirements can be made autonomously. Ask for genuinely missing external inputs only when needed; continue independent work.

## Working loop

Implement one coherent behavior; validate normal and negative cases; run tests that can detect failure; investigate logs; fix defects; rerun affected tests. Broaden to the phase gate when ready. Avoid unrelated refactors, opportunistic upgrades and V2 work. Keep task state and findings updated at meaningful checkpoints so interrupted work is recoverable.

Never use customer credentials/data in committed fixtures. Default provider mode must be synthetic and incapable of real publication. Secret values belong in secure environment settings/local ignored files, not chat or evidence reports. Live publishing requires named-account authorization from the owner and a published test plan.

## Evidence contract

Use [PHASE-REPORT.md](templates/PHASE-REPORT.md) for `evidence/phase-N.md`. For each check record:

- test ID and requirement IDs;
- exact command/working directory, target and environment/tool versions;
- tested application commit (or precommit tree/diff identity), date and exit status;
- counts passed/failed/skipped and whether provider mode was mocked or live;
- sanitized output/artifact reference and interpretation;
- defects found, fix and targeted regression evidence.

CI links are useful evidence once the run actually finishes. A queued workflow is not a pass. Do not invent a CI result when API access is unavailable. Store compact sanitized summaries in git; keep bulky artifacts in CI artifacts or ignored local output and retain a durable summary. Screenshots do not prove authorization enforcement.

## Finishing

Review against the requirement IDs and exclusions. Update the phase report and traceability with actual test file paths. Complete `checks` in project-state.json as objects `{id, command, result, evidence}`; `result` must be `passed` to complete the phase. Point `evidence` to a durable repository report with the detailed evidence. Update `report`, `blockers`, status and `updated_at` deliberately.

Run `plan.py check`, inspect git diff and secret exposure, then create an appropriately scoped commit. The usual delivery is a `phase/N-description` branch and draft PR against main. Do not auto-merge it. Record tested commit and branch in the report; after committing product work, a small documentation commit may record the tested commit without an impossible self-referencing commit hash. Attach PR URLs in the task UI when available.

If a later phase is authorized before an earlier PR is merged, base the new branch on the earlier tested commit and record the dependency/PR relationship. Final Phase 6 provides a single cloneable release-candidate branch containing all phases; a main merge or release tag needs its own authorization. Do not rewrite an existing shared release branch.

Finish the user reply with outcome, tested evidence, unresolved limits, GitHub link or local-only limitation and the next valid prompt. Stop before the next phase. “Blocked” is an honest resumable state; explain the exact external prerequisite and finish independent tasks first.
