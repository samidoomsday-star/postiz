# V1 local release candidate checklist

All boxes are initially unchecked. This is a release gate for Phase 6, not proof of readiness now.

- [ ] Phases 0–5 complete with executed evidence; Phase 6 clean-clone tests pass.
- [ ] Every V1 requirement maps to implementation and executed tests in traceability.csv.
- [ ] No unresolved critical/high, required-workflow, authorization, approval, data-integrity or duplicate-publication bug.
- [ ] Full prepare → review → approve → schedule → confirmed/failed/unknown → safe resolution flow works with synthetic provider mode.
- [ ] Scope, expired/revoked identity, media access and stale-revision negative tests pass across all entry paths.
- [ ] Real-service integration, browser, build/type/lint and regression checks pass with counts and tested commit recorded.
- [ ] Performance and mobile/keyboard targets satisfied or a user-approved requirement change is recorded.
- [ ] Fresh install and representative legacy migration tested; ambiguous data quarantined; old jobs cannot bypass enforcement.
- [ ] Database/media backup and restore plus interrupted migration recovery rehearsed; rollback cannot re-enable unsafe publishing.
- [ ] All required images/tools pinned; runtime uses this derivative's source/image, not an upstream release missing V1 changes.
- [ ] Environment examples contain placeholders only; no cloud paths, secrets, local cache assumptions or real account credentials required for synthetic setup.
- [ ] A new clone of the candidate branch runs the documented install, seed, start, smoke, stop/restart and restore path.
- [ ] Supported OS/architecture/hardware and required/optional services are explicitly recorded from actual evidence.
- [ ] Platform matrix accurately distinguishes mock, live, inherited/unverified, blocked and disabled capabilities.
- [ ] Live publication claims include explicitly authorized account/app evidence; missing app approvals are documented.
- [ ] No V2 feature implementation; inherited analytics and other unverified features are not advertised as tested improvements.
- [ ] License/notices and exact corresponding-source/build instructions are present; branding and optional integration terms reviewed.
- [ ] Known issues, release notes, local tester walkthrough and bug-report template complete.
- [ ] Exact candidate commit is pushed to a single cloneable branch in the owner repository and remote hash verified.
- [ ] Handoff gives a branch-specific clone command and tested startup/test commands.
- [ ] No main merge, tag, container publication, production deployment or real customer onboarding performed without its authorization.

Suggested final branch: `release/agency-v1-rc1`. Suggested version label: `agency-v1.0.0-rc.1` (a label in documentation until tagging is authorized). Main need not contain unmerged phase work; the candidate branch must contain the whole tested result. An inability to push leaves the GitHub handoff blocked even if local tests pass.
