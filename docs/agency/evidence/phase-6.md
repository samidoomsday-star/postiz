# Phase 6 — Local release candidate and handoff

Status: complete
Started/updated (UTC): 14 October 2026
Base: `phase/5-hardening`, `e532700067bb23013754df05eadb9cfa5c2c9278` (Phase 5 draft PR #6). Earlier phase PRs #1–6 remain unmerged.
Tested application/setup commit: **`0c74bd382296946883747dc1fe3734d225268134`**.
Delivered branch: **`release/agency-v1-rc1`** in https://github.com/samidoomsday-star/postiz . Follow-up commits contain documentation/evidence only; the application/build/setup/test tree is identical. Delivery metadata below records the subsequent exact GitHub head. No release tag is created.

## Scope and completed work

V1-REL-001 / T06-01, T06-02, T06-03. Assembled the complete phase 0–5 ancestry on one candidate branch, added Linux prerequisite preflight, isolated fresh checkout Compose projects/volumes, supplied a complete executable verification path and documented installation, roles, manual acceptance, troubleshooting, source licensing, support and limitations. V2 remains deferred.

[LOCAL-TESTING.md](../LOCAL-TESTING.md) is the owner entry point. [RELEASE-NOTES.md](../RELEASE-NOTES.md), [KNOWN-ISSUES.md](../KNOWN-ISSUES.md), [SOURCE-NOTICE.md](../SOURCE-NOTICE.md), [environment.env.example](../environment.env.example) and [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md) accompany it. The environment reference matches all 30 generated settings; secrets/path placeholders are illustrative, not a configuration to source.

## Independent clone and environment

Executed the documented branch clone from GitHub into `/workspace/postiz-agency-rc-check` rather than copying the existing checkout. Initial assertions verified no `.agency` and no `node_modules`, and Git resolved exactly `0c74bd382296946883747dc1fe3734d225268134`. No tool directory, dependency store, private environment, API key or cloud app credential was copied. Bootstrap downloaded its own checksum-verified Node and pnpm. Frozen install downloaded 3,681 package artifacts with zero prior-store artifacts reused. Local application authentication and database secrets were generated anew. Git access used the configured HTTPS proxy; that is repository transport, not an application credential.

Debian 13 Linux x86_64; Python 3.12.14; Docker 28.4.0 / Compose 2.40.3; Node 22.23.3 / pnpm 10.6.1 / Prisma 6.5.0; Playwright 1.58.2 / system Chromium 154.0.8037.57. Effective CPU quota 4 cores, memory limit 34,359,738,368 bytes (32 GiB). Standard OS Docker/compiler/Python/Chromium/CA/OpenSSL prerequisites are disclosed in the guide. This is a fresh directory on the recorded Linux executor, not evidence of a second OS or hardware platform. Other platforms/browser-install branches remain unverified.

Only the previously recorded development apps/services were stopped to free fixed ports; their persistent volumes were retained. Resolved Compose configuration proved the existing `postiz-agency-dev` volumes and new random candidate-project volumes were distinct. Setup applied all seven versioned migrations on the new candidate database, seeded synthetic agencies/roles/channels and built frontend/backend/orchestrator from this source. No upstream application image or real provider token was used.

## Executed check evidence

All commands below ran from the independent clone root. Exit 0 is the actual completed process outcome, not an inferred healthy PID. [phase-6-validation.json](phase-6-validation.json) contains machine-readable counts/times, and [phase-6-source.json](phase-6-source.json) identifies the selected source tree and locked code. Private raw logs/results are retained under the clone's ignored `.agency/results` and `.agency/logs`.

| Case | Actual command / check | Result and evidence |
| --- | --- | --- |
| T06-01 | `bash scripts/agency/setup.sh` | Exit 0, 08:56:03–08:59:38 UTC. Frozen install, generation, seven migrations, synthetic seed, all three production builds, Chromium version check. No tracked-file changes. |
| T06-01 | `bash scripts/agency/verify.sh` | Exit 0, 08:59:44–09:08:52 UTC. Planning check, scoped lint, test types and backend/frontend/orchestrator types passed. |
| T06-01 | `pnpm test` through `with-env.sh` | **66 passed**, six unit files, zero failed/pending; provider, policy, revision, review-security and action-projection contracts. |
| T06-01 | `pnpm exec playwright test --config playwright.agency.config.ts` through wrapper | **93 passed in one full run: 79 API + 14 Chromium**, zero failed/skipped/flaky, retries disabled. Start 09:01:49.169 UTC, duration 361,157.536 ms. Desktop/360px keyboard journeys, Bangla/Dhaka/DST, exact media/revision review, approval, publication, negative scope/identity cases and truthful recovery. Real local HTTP/PostgreSQL/Temporal/Mailpit; external social boundary synthetic. |
| T06-02 | `python3 scripts/agency/rehearse-migration.py` through wrapper | **22 migration/restore gates passed**: fresh/adopted legacy schema, ambiguity quarantine, interrupted transactions/connection rollback, paused old queues/keys/media, immutable records and grants, invitation/session/feedback, action recovery/proof and UNKNOWN preservation. Only uniquely owned disposable databases dropped. |
| T06-02 | `node --experimental-require-module scripts/agency/restore-media.mjs` through wrapper | Actual DB dump/restore plus private original/snapshot media copy; compiled approval eligibility rejected missing/tampered bytes and accepted repaired bytes. Grants/UNKNOWN/attempt preserved. No worker against restored copy; disposable DB removed by its owner script. |
| T06-02 | `node scripts/agency/replay.mjs` through wrapper | **Six persisted histories** replayed across UNKNOWN/PENDING/FAILED/CONFIRMED; no activities executed. Retry execution IDs preserved; zero unexecuted candidates excluded. |
| T06-02 | `node scripts/agency/restart-approval.mjs` through wrapper, twice | Each real persisted approved queue survived app/worker shutdown/start and produced **exactly one confirmed synthetic mutation**. Second run followed shutdown/restart of the entire Compose topology. |
| T06-02 | Supervisor stop; `docker compose -f compose.agency.yaml stop`; `up -d --wait`; `node scripts/agency/migrate.mjs`; supervisor start | Persistent services healthy, all seven migrations recognized, **no pending migrations**, no volume/config recreation or tracked-file edits. Subsequent publication proved working queue consumption. |
| T06-03 | Source/pin/diff/environment/link/release review and plan checker | Source/build/setup paths contain no `/workspace` or prior-checkout dependency. All 30 environment keys match reference, 12 new guide links resolve, AGPL/OFL/provenance retained, derivative source notice/build guide and platform/dependency limits present. Final docs-only tree and GitHub delivery checks recorded below. |
| T06-03 | Private log/report review | Seven current logs/reports checked against six known generated private secret values and raw review-token patterns: zero matches. No raw artifacts/private configuration committed. |

Phase 5's measured **p95 791.56 ms / page maximum 1.006 s** under its aggregate 4-CPU/8-GB runtime profile, 42 repeated race checks, 397-surface static inventory, provider contracts and dependency triage remain valid preceding evidence. They were not relabeled as new Phase 6 load/race measurements; no application/schema/workflow/dependency change was introduced here.

## Defects, review and operational implications

**P6-001 resolved:** fresh checkouts formerly shared fixed Compose database/Temporal volumes while generating different passwords. New configurations receive a unique project name. Existing environment bindings remain unchanged, preserving previous volumes. [Fix and regression](bugs/phase-6-fixes.md). Fixed host ports still permit one active installation at a time.

Reviewed the base-to-candidate diff: only release setup/helpers and documentation changed. No policy bypass, approval state transition, dispatch/retry contract, migration, workflow, dependency or upstream pin changed; no V2 feature added. Shared immutable claims, current authorization, no-blind-retry and UNKNOWN rules remain covered by the full suite. Setup does not use db-push/reset or destructive volume cleanup. Runtime stop targets recorded process identities only. No real customer data or social/email credential is present in fixtures.

All runtime checks passed on the first full Phase 6 run; no test assertion was weakened or skipped. Post-test Git status remained clean. The independent checkout/services are preserved as evidence and stopped after verification so the primary development checkout can resume without port conflicts. Original data volumes remain intact.

## Limits and source obligations

This is a **local synthetic release candidate for owner acceptance**, not a hosted production release. Live OAuth/connect/reconnect remains server-disabled; live social publication/recovery and external SMTP have not run. Matrix entries preserve mock vs inherited/unverified/disabled distinctions. Legacy analytics/MCP/widgets/automation remain denied. No live-platform certification is implied by the synthetic provider or SDK unit contracts.

The lock retains Phase 5's documented 257 affected advisory matches (10 critical/108 high/121 moderate/18 low) in its reviewed reachability/disabled/developer contexts. No new registry audit or zero-advisory claim is made. Do not enable those paths without a separate review. Native non-Linux/ARM/browser alternatives and production operations are unverified.

AGPL/upstream notices, local font OFL and full source/build instructions are retained. Corresponding-source notice identifies the repository and exact tested revision; before any hosted offering, users need access to the exact running source. A private inaccessible repository is not a source offer. Optional commercial integration rights, external branding/legal review and production security review are separate from local acceptance.

## Delivery and next action

The candidate branch contains all phase implementation ancestry while PRs #1–6 remain draft/unmerged. Use the branch-specific clone/install/start commands in LOCAL-TESTING.md. The subsequently pushed documentation-only head is verified against the remote and independently fetched into the clean clone; no application/build/setup/test tree difference is permitted from the tested commit. The release label is documentation only.

Next: **owner local acceptance testing**, report reproducible V1 defects using the bug template. All seven V1 phases are complete. V2 needs a new scope decision. No main merge, tag, container publication, production deployment or customer onboarding was performed.

### Verified delivery record

- Draft PR: https://github.com/samidoomsday-star/postiz/pull/7 (open/draft, base main).
- Complete candidate/evidence commit: **`5dc7124121d61b5637c80c82d04b605a7175100c`**, pushed and independently fetched from GitHub. Root checkout, remote release ref, PR head and independent clone matched it; the only following change is this delivery note.
- Independent clone's final `plan.py check` passed; `git diff --exit-code 0c74bd38 HEAD -- . ':!docs' ':!README.md'` passed and Git status was clean. Source manifest SHA-256 remains `27f256b7944a8894593fddc47cac899ede0b28b711d65d5fbb406b4830d16614` for its 1,006 selected tracked entries.
- Remote main remains `7b0e720df24fd7ca55d0aa092fa7e073be02b3e1`; no phase PR merged. After this note is committed/pushed, final remote/PR/independent-clone hashes are checked again in the task delivery transcript. For a fixed tested installation, clone the release branch and run `git checkout 5dc7124121d61b5637c80c82d04b605a7175100c`; this includes all code and final tester documentation. The later delivery note has no runtime effect.
- The independent clone was stopped with its own supervisor/Compose commands, preserving its data. The primary checkout was restored and **nine baseline API scenarios passed** (real login/denial, scoped draft, single confirmed worker publication, known rejection and local email activity). This smoke run is separate from, and does not overwrite, the independent clone's 93-case report.
- Cloud `install_script` and `start_skill` were saved successfully as a configuration **draft**, covering pinned setup, owned startup, functional smoke and phase boundary. They are not published environment configuration. To activate for future tasks, review/save the changes in environment settings and publish the environment; no snapshot restoration or fresh-task validation is claimed.
