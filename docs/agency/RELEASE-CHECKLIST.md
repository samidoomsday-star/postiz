# V1 local release candidate checklist

Completed 14 October 2026 for the local synthetic candidate. [Phase 6 evidence](evidence/phase-6.md) records actual commands, counts and tested commit. Owner manual acceptance is still pending; these checks do not authorize production or live accounts.

- [x] Phases 0–5 complete with executed evidence; Phase 6 clean-clone tests pass.
- [x] Every V1 requirement maps to implementation and executed tests in traceability.csv.
- [x] No unresolved critical/high, required-workflow, authorization, approval, data-integrity or duplicate-publication bug.
- [x] Full prepare → review → approve → schedule → confirmed/failed/unknown → safe resolution flow works with synthetic provider mode.
- [x] Scope, expired/revoked identity, media access and stale-revision negative tests pass across all entry paths.
- [x] Real-service integration, browser, build/type/lint and regression checks pass with counts and tested commit recorded.
- [x] Performance and mobile/keyboard targets satisfied or a user-approved requirement change is recorded.
- [x] Fresh install and representative legacy migration tested; ambiguous data quarantined; old jobs cannot bypass enforcement.
- [x] Database/media backup and restore plus interrupted migration recovery rehearsed; rollback cannot re-enable unsafe publishing.
- [x] All required images/tools pinned; runtime uses this derivative's source/image, not an upstream release missing V1 changes.
- [x] Environment examples contain placeholders only; no cloud paths, secrets, local cache assumptions or real account credentials required for synthetic setup.
- [x] A new clone of the candidate branch runs the documented install, seed, start, smoke, stop/restart and restore path.
- [x] Supported OS/architecture/hardware and required/optional services are explicitly recorded from actual evidence.
- [x] Platform matrix accurately distinguishes mock, live, inherited/unverified, blocked and disabled capabilities.
- [x] No live publication claim is made. Live OAuth/connect is disabled; missing app/account approval and live verification are documented in the platform matrix.
- [x] No V2 feature implementation; inherited analytics and other unverified features are not advertised as tested improvements.
- [x] AGPL/notices and exact corresponding-source/build instructions are present; independent branding and excluded optional integration terms documented. External legal/production branding review is not claimed.
- [x] Known issues, release notes, local tester walkthrough and bug-report template complete.
- [x] Exact candidate commit is pushed to a single cloneable branch in the owner repository and remote hash verified.
- [x] Handoff gives a branch-specific clone command and tested startup/test commands.
- [x] No main merge, tag, container publication, production deployment or real customer onboarding performed without its authorization.

Delivered candidate branch: `release/agency-v1-rc1`. Documentation version label: `agency-v1.0.0-rc.1` (a label in documentation until tagging is authorized). Main need not contain unmerged phase work; the candidate branch must contain the whole tested result. An inability to push leaves the GitHub handoff blocked even if local tests pass.
