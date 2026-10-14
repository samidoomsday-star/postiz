# Agency edition: execution contract

## Local setup requests (IDE agents: start here)

For "set up locally", "run this app" or "start for testing", follow root [SETUP.md](SETUP.md). The owner uses Windows: start with [WINDOWS-SETUP.md](WINDOWS-SETUP.md) and run inside a suitable WSL2 Linux environment, preserving the Windows checkout. Detect the actual execution host first; an existing Linux x86_64/cloud environment uses SETUP.md directly and does not need WSL installed. This is an operations request, not a request to start another development phase. Read the OS/prerequisite table, preserve the existing checkout/configuration/data, then run `bash start-local.sh` from the repository root in the supported Linux environment. It installs/builds when needed, starts services and apps, and runs real-service API/browser smoke tests. Continue through fixable setup failures and leave the app running after success. Ask only for a concrete missing system permission or external prerequisite. Never ask for social/API credentials for synthetic testing.

The complete V1 is on `release/agency-v1-rc1`. Before any checkout change inspect local changes/commits; never reset or force-switch. If a clone contains only planning files on `main`, follow SETUP.md's safe branch recovery. The repository default currently remains planning-only main because the integration cannot change that GitHub setting; use the branch-specific candidate link and do not merge phase PRs as part of setup. Phases 0–6 remain complete and V2 is not authorized. Report actual command outcomes, demo login, local port/path, stop/restart commands and remaining OS/provider limits. Do not declare readiness from health checks alone or terminate the running app at the end of successful setup.

Read this file, `docs/agency/README.md`, `docs/agency/project-state.json`, and the requested phase spec before changing anything. Read the product, technical, and test specifications for that phase. Also obey applicable nested AGENTS.md files. The frontend has version-specific Next.js instructions; inspect the installed docs before frontend edits.

## Authorized scope

- The planning foundation is complete. Read project-state.json for current implementation status; historical setup notes do not establish the next phase.
- V1: client permissions and scoped credentials; enforced revision-specific approvals and a client review portal; an agency action dashboard and safe resolution of publishing exceptions.
- V2: everything listed in `docs/agency/V2-BACKLOG.md`. Do not build V2 screens, schemas, services, or speculative infrastructure during V1. A minimal dependency required for a V1 acceptance criterion is permitted and must be explained in the phase report.
- Keep the upstream baseline pinned. Never pull or merge upstream automatically; use `docs/agency/UPSTREAM.md` for manual fixes. Do not rewrite the publishing engine or alter Temporal replay behavior casually.
- The scope is development through a reproducible local release candidate. Production deployment, real customer onboarding, sending messages, and publishing to live social accounts require explicit user authorization. Mock-provider tests do not count as live publishing evidence.

## What “start phase N” means

1. Inspect git status and current branch. Preserve unrelated user changes. Use this checkout; do not create a worktree unless asked. Do not reset, force push, or discard changes to make checks pass.
2. Run `python3 scripts/agency/plan.py check` and `python3 scripts/agency/plan.py phase N`. Only the next incomplete phase may start. If that phase is already active or blocked, resume it from its evidence report. A later-phase request does not authorize skipping prerequisites.
3. Read the phase dependencies, ordered tasks, requirement IDs, exclusions, and acceptance cases. Verify the code rather than treating the 2026 research as current runtime evidence.
4. Set this phase to `in_progress` in project-state.json and create/update its report using `docs/agency/templates/PHASE-REPORT.md`. Work through small vertical slices: implement → validate → test → inspect failures → fix → retest affected behavior.
5. Complete all phase tasks and required checks without repeatedly asking for implementation approval. Continue until done or a concrete external blocker remains. Do not stop at code written, server started, or tests planned.
6. Review your diff for permissions bypasses, approval races, duplicate side effects, migration safety, secrets, and out-of-scope work. Record the review, bugs, and resolution evidence. A blocker is not a pass; never weaken assertions or silently disable tests.
7. Update state, requirements traceability, relevant runbooks, and the phase report. Store command, exit status, test counts, tested commit/tree, date, and artifact locations. Mark `complete` only when every gate is evidenced. Use `blocked` with the exact prerequisite otherwise; leave later phases planned.
8. Run the plan checker. Commit only task files, with a descriptive message. If GitHub is available, push a `phase/N-short-name` branch and create a draft PR against main; attach it in the task UI when supported. Do not merge a phase PR automatically. If PR tools or push are unavailable, preserve a local commit and report the exact limitation. State completion and GitHub integration are separate facts.
9. Stop at the end of the requested phase. Report changes, checks, remaining limitations, commit/PR, and the next valid prompt. A “start next phase” prompt selects the first incomplete phase; it does not authorize all remaining phases.

When a completed phase branch is not merged, continue from that tested commit on the next phase branch and record the base. Do not pretend origin/main contains unmerged changes. Do not claim a final GitHub handoff until a cloneable branch contains all phases. User authorization to merge is a separate action; do not ask for it before the concrete PR is ready.

## Current staged boundary

Phase 4 uses `/agency` for retained editor/calendar/staff operations, `/agency/actions` for staff recovery and `/review` for verified clients. Read ADR-012/013/014, `docs/agency/APPROVALS.md`, `docs/agency/REVIEW-PORTAL.md`, `docs/agency/ACTION-DASHBOARD.md` and phase evidence before changing that flow. Review session/invitation actor context is created only by the server and cannot administer, edit or schedule. External decisions remain bound to their original invitation; renewal cannot resurrect an old approval. Keep invitation/code/session secrets out of URLs sent to servers, analytics, logs and Temporal histories. All new feedback is explicitly client-visible; never project legacy internal notes or unrecognized settings.

Legacy HTTP/MCP/widget/preview/automation paths remain denied. Never remove the guard to reopen them, dispatch from mutable Post fields, terminate an existing workflow to reschedule, or bypass the immutable claim. Operator assignment/acknowledgment cannot change receipts. UNKNOWN/PENDING/CLAIMED cannot rearm; a single-part FAILED target needs explicit read-only provider proof and append-only evidence before a new attempt. Retry execution IDs bind the worker claim; prior executions cannot consume a newly armed attempt or overwrite its receipt. Preserve successful targets and historical uncertainty; unsupported reconciliation stays manual. V2 remains deferred. Phase 5 starts from the tested Phase 4 branch when earlier PRs are unmerged.

Phase 5 hardens the same staged boundary; read ADR-015, `docs/agency/HARDENING.md`, the exact provider matrix and dependency triage before changing it. A terminal SDK exception alone cannot prove FAILED: require a bounded positive no-side-effect contract or retain UNKNOWN. Preserve the request-local no-blind-retry context on provider post/comment/finalize operations, redacted SDK failures and TikTok inbox denial. Dashboard grouping/materialization must retain current agency/client/channel/grant scope before counts and pagination; query-local JIT settings must never leak to other pooled requests. A matching confirmed same-attempt completion is idempotent; stale/conflicting writes and false uncertainty audits remain forbidden. Phase 6 must start from the tested Phase 5 branch while earlier draft PRs are unmerged, and must execute its independent clone handoff rather than infer it from cached cloud setup.

## Engineering constraints

- Authorization is server-enforced for every entry path, including workers. Never couple client access to billing configuration or an absent Stripe key. UI filters are not authorization.
- Publishing requires the approved immutable revision. Recheck policy and grants at the dispatch boundary. Never blindly retry an uncertain provider mutation.
- Test negative cases and actual side effects. Keep service-backed integration tests and end-to-end tests distinct from mocks. No zero-test success claims.
- Preserve upstream dependencies and lockfile unless a phase needs a documented change. Phase 0 must resolve toolchain conflicts and test-runner viability; do not blindly use stale upstream Copilot notes.
- Never run `prisma-reset`, force-reset, `db push --accept-data-loss`, or destructive volume cleanup against a database with user data. Use disposable databases for destructive tests; implement versioned migrations and rollback/restore instructions before V1 data changes.
- Never commit .env files, access tokens, media containing customer data, private logs, or credential values. Use examples and synthetic fixtures. No test may publish externally by default.
- Preserve AGPL notices and corresponding-source obligations. Do not imply affiliation with the upstream company or assume optional commercial integrations are freely licensed.
- If a design must change to satisfy evidence, update the relevant ADR/spec and traceability in the same phase. Changes to V1 scope need the user's decision; routine implementation details do not.

The plan checker checks documentation and state consistency. It does not run or certify application tests. Repository instructions guide agents; they are not server-enforced GitHub branch protection.
