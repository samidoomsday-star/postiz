# Phase 1 — Client boundaries and scoped access

Status: complete
Started/updated (UTC): 2026-10-13
Base: phase/0-baseline, d2408aa2c62038f8192a63592ea17da22c3d96df; unmerged [Phase 0 PR](https://github.com/samidoomsday-star/postiz/pull/1).
Tested application precommit tree: 3f04c6bd0aca66db3bbdfabad33acaa6e0c2e9e2; subsequent state/evidence edits are documentation only.
Delivery: phase/1-client-access; application commit ccdff92bd0669fea77c9e56a195e8cba7f367e77; [draft PR #2](https://github.com/samidoomsday-star/postiz/pull/2) against main. This PR includes the unmerged Phase 0 foundation. A documentation-only follow-up records these immutable delivery references; main remains unchanged.

## Scope and implementation

V1-AUTH-001, V1-AUTH-002, V1-AUTH-003 and V1-AUD-001. The user authorized finishing Phase 0 and starting its next phase. No approval schemas, review portal, dashboard or V2 feature implementation.

- Existing Organization/Customer/Integration represent agency/client/channel. Versioned baseline and additive migrations introduce ownership/quarantine, explicit human grants, hashed expiring automation credentials, retained originating principals and append-only audit. No new client hierarchy or dependency changes.
- `AgencyService` reloads current membership, grants, credential status and resource parents. Administrators read/manage their agency; editing/scheduling require explicit action grants. Editors/publishers compose explicitly. Reviewer-only raw draft access is denied pending the portal projection. Credential creation defaults to read/draft, validates client/channel nesting, shows a random secret once and stores only SHA-256 hash plus display prefix. Revocation/expiry and creator membership/admin loss apply immediately.
- The `/agency` controller exposes only scoped content/access operations. Queries apply agency/client/channel scope before lists, counts, search and pagination. Draft ingestion rejects mixed-client targets, foreign IDs, unsupported transformations and media references; persisted media paths replace supplied URLs. Missing resource IDs cannot turn into unfiltered Prisma queries.
- The minimal responsive `/agency` workspace supplies client selection, draft preparation, client/staff/channel assignment, credential create/revoke/display-once, explicit quarantine mapping and access audit. It is a V1 dependency, not a replacement editor product. The retained Postiz editor/calendar must integrate through scoped services in Phase 2 (ADR-011).
- A global Nest boundary guard closes inherited resource/controller paths for all principals. Local login and authenticated self-information remain available; self no longer discloses the legacy key. Impersonation, organization overrides, old org keys, social-login/invitation-cookie joins, widgets, callbacks, previews, analytics/exports and unsafe admin/invite routes are denied. Standalone Express MCP transports are separately denied/unregistered. All 235 inherited HTTP method/path combinations outside the four explicit allowances were exercised.
- Every retained publication workflow uses the shared PostActivity checks before external mutation. Workers reload authoritative channel identity and current originating grants, reject actorless/quarantined/stale/future/repeating work, and honor revocation before dispatch. Legacy mutation services and provider plug methods are explicitly closed. RSS/plugs, external media/clipping/video jobs, pending finalization and organization-wide content audiences are disabled until a verified scoped contract exists. No Temporal workflow version, retry/replay logic or provider mutation implementation was edited.
- Local media bytes/ranges require current client authorization before existence/byte checks; responses are private/no-store, and canonical paths reject symlink escape. Legacy media is quarantined; public/cloud media and provider-fetch media publication are unsupported pending bounded private capabilities.
- Management changes and redacted audit inserts share transactions. SQL rejects audit UPDATE/DELETE and invalid nonquarantined parent ownership. Old API keys are nulled and their transports independently closed. No secrets, credential hashes, raw content or tokens are written to the management audit projection.

## Executed checks

All commands ran from `/workspace/postiz` on the Phase 0 pinned Debian 13/Node 22.23.3/pnpm 10.6.1/Prisma 6.5.0/Playwright 1.58.2/Chromium 154 profile. PostgreSQL, Redis, Temporal, HTTP, SMTP/Mailpit and browser execution are real local services; social-provider mutations are synthetic.

| Case | Command / evidence | Result |
| --- | --- | --- |
| Setup/build | `bash scripts/agency/setup.sh` | Exit 0; frozen install, generation, guarded migration replay, seed and full frontend/backend/orchestrator build. `.agency/phase1-setup-final.log`. Final changed service rebuild also passed. |
| Unit regression/policy | `bash scripts/agency/with-env.sh pnpm test` | Exit 0; 15 passed, 0 failed/skipped. `.agency/phase1-unit-verified.log`; unit JSON success=true. |
| T01-01 | Full Playwright suite, `access.api.spec.ts` and browser cases | Cross-client/agency list/count/search/direct/nested IDs, mixed batches, channel allowlists, missing IDs, private media and actual editor/browser persistence; no unintended writes. Final counts recorded below. |
| T01-02 | Same API/browser suite | Draft-only default, no admin/approve/schedule escalation, display-once hash/prefix, expiry/revocation, live grants/creator membership, explicit org and invalid-header precedence; legacy MCP denied. |
| T01-03 | Same suite, including exhaustive inventory loop | 235 inherited HTTP method/path combinations denied; MCP/public previews/widgets/OAuth/invites unsupported. Real private bytes/ranges, anonymous/other-client denial, symlink denial and cookie-origin enforcement. |
| T01-04 | Same suite plus migration rehearsal | Actual Temporal work is denied after credential revocation or actorless legacy invocation, with zero provider journal calls; mapping/reassignment pauses content and does not invent dispatch identity. |
| T01-04 migration/restore | `bash scripts/agency/with-env.sh python3 scripts/agency/rehearse-migration.py` | Exit 0; 9 gates passed: fresh Prisma deployment, additive install, valid mapping, ambiguity quarantine, paused queues/keys/media, subsystem preservation, connection interruption before COMMIT, replay and pre/post restore/re-upgrade. `.agency/phase1-migration-verified.log`. |
| T01-05 | API audit/membership tests | Billing unset; authorized redacted audit entries, unauthorized management denial, creator membership invalidation, SQL append-only enforcement and foreign assignment denial. |
| Static checks | `pnpm run lint:agency`; `pnpm run typecheck:agency`; backend/orchestrator `tsconfig.build.json` and frontend `tsconfig.json` no-emit checks, through with-env.sh | Exit 0 in fail-fast sequence. Changed services build/type-check fully; structural lint includes changed legacy services. Inherited unused-variable diagnostics are exempted only for legacy files; new code retains strict unused checks. Private `phase1-*-verified.log` files and final lint/test-type logs. |
| Source/dependency review | Inventory source/line validation; lockfile/license diff; staged secret-path scan; `git diff --check` | 361 static surfaces: 256 HTTP, 11 legacy MCP transports, 20 tools, one media-byte path, 33 provider bindings, 18 shared service/activity boundaries and 22 workflows. All references exist; static inventory is distinct from runtime coverage. No Phase 1 dependency/version/lockfile/license changes or staged private environment/fixture keys. |
| Restart regression | Stop/start owned apps and Compose services, then full Playwright suite | Exit 0; all 32 then-current tests passed again at 04:03:22 UTC in 26.8s, 0 failed/skipped/flaky. Credentials, grants and audit survived restart. `.agency/phase1-after-restart.log`. The final missing-ID regression was added afterward and is included in final acceptance below. |

Final acceptance command: `bash scripts/agency/with-env.sh pnpm exec playwright test --config playwright.agency.config.ts`. Exit 0; **33 passed**, 0 failed/skipped/flaky, at 2026-10-13T04:08:53.525Z in 26.3s. `.agency/phase1-final-acceptance.log` and the current integration JSON agree. Earlier full/restart runs passed 32 cases; the final source adds the missing-ID regression without weakening any assertion.

## Defects and review

[Resolved findings](bugs/phase-1-fixes.md) and `defects.csv` record the form label, inherited activity return contracts, legacy invitation/notification bypass candidates and disposable fixture cleanup. The baseline exact channel assertion was retained; no denial assertion was relaxed. Missing ownership IDs were also guarded during final query review to prevent Prisma's undefined-filter behavior.

Reviewed controller allowances, standalone middleware, direct service mutations, worker versions/parts, resource parent checks, default/expired/revoked grants, private bytes/cache/path confinement, role composition, credential storage/projections, transaction/audit constraints, migration preservation/recovery, dependency/license diff and V2 exclusions. No unresolved high/critical Phase 1 authorization finding remains. Approval races and atomic dispatch claims are explicitly Phase 2 requirements, not claimed by these pre-mutation grant checks. No replay-affecting workflow edit or blind mutation retry was introduced.

## Operations and limitations

See [migration runbook](../MIGRATIONS.md) and [development workflow](../DEVELOPMENT.md). Customer database migration, production deployment, live-provider compatibility, remote/public storage privatization, performance benchmarks and independent fresh-machine restoration remain unverified/outside this phase. Quarantine cannot retract an already public URL on an external storage service; that storage must be made private before customer activation. The supported Phase 1 byte-serving profile is local private storage.

The earlier unreleased development schema was preserved in a separate named synthetic database, and the Phase 0 snapshot was restored into a fresh development database before replaying the final transactional migrations. The nine-gate rehearsal separately used disposable fixtures and removed only its own databases. No customer data or persistent Compose volume was discarded.

Reusable cloud install/start instructions are saved as a configuration draft; environment publication/future-task restoration are separate and not claimed. GitHub CI configuration includes migration rehearsal and all suites; the GitHub API returned no hosted workflow runs at inspection, so no hosted CI pass is claimed. Both phase PRs remain unmerged.

## Resume / next

All Phase 1 checks passed. The next eligible prompt is **Start phase 2**. The complete V1 local release candidate still requires Phases 2–6; do not call this intermediate workspace the finished product.
