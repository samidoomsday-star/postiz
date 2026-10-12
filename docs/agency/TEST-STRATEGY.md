# Verification and bug-fixing strategy

No application tests have run in the planning setup. Phase 0 establishes executable test commands and fixtures, then writes them into DEVELOPMENT.md and CI. Commands proposed here are not claimed to exist yet.

## Test layers

1. Unit/domain tests for policy decisions, state transitions, snapshot hashing and status projections.
2. Integration tests using real PostgreSQL and relevant Redis/Temporal services for constraints, transactions, query scopes, idempotency and worker behavior. Mock only external provider/email boundaries, not the database behavior being tested.
3. Browser E2E tests for editor, publisher and reviewer flows on desktop/mobile, using at least two agencies and two clients each. Tests must fail if the HTTP authorization layer or dispatch gate is bypassed.
4. Failure-injection tests for queue/worker restart, expired grants, provider rate limits, partial results, uncertain mutation outcomes and database failure after remote success.
5. Compatibility contract tests for inherited providers. Live tests are separate, opt-in, account-authorized and recorded in the platform matrix.
6. Clean-clone packaging, migration/restore and load tests before local release.

Phase 0 selects the smallest working harness fitting the repository (existing Jest/Vitest facilities and a browser runner if needed), pins it, and records exact commands. Do not assume the upstream `pnpm test` is usable simply because it exists: inspect its project discovery and ensure actual test cases run. A frozen install, generated client and build are separate from behavioral tests.

## Acceptance catalog

| Case | Scenario and observable assertion | Owning phase |
| --- | --- | --- |
| T00-01 | Frozen dependency install, generation and required-service build from documented tools; lockfile unchanged except deliberate recorded changes | 0 |
| T00-02 | Start services, log in/create synthetic organization, save/list a draft, and dispatch via test provider with a persisted receipt; verify worker actually consumed work | 0 |
| T00-03 | Test provider refuses live endpoints/credentials by default; zero external social mutations during smoke suite | 0 |
| T00-04 | Stop/restart owned services and repeat smoke with documented persistent state; build/test commands execute nonzero tests | 0 |
| T01-01 | A principal scoped to Agency A/Client A cannot read/list/count/search/mutate Client B or Agency B by direct ID or nested relation | 1 |
| T01-02 | Draft-only key cannot schedule/approve/admin; channel allowlist, expired/revoked credentials and changed grants enforced across UI/API/MCP | 1 |
| T01-03 | Media URLs, previews, comments, analytics, exports, OAuth/widget callbacks and invitations cannot disclose another client; unsupported surfaces server-denied | 1 |
| T01-04 | Legacy mixed/unassigned records quarantined; mappings preserve valid data; migration from fixtures is resumable; no queued legacy bypass | 1 |
| T01-05 | Role/credential actions have authorized redacted audit entries; billing disabled does not broaden access | 1 |
| T02-01 | No decision/unapproved draft cannot publish through each inventoried entry path; assert zero provider mutation calls | 2 |
| T02-02 | Changes to copy/media bytes/order/alt/settings/target/signature/link/time invalidate approval; internal comments alone do not | 2 |
| T02-03 | Concurrent edit vs approve vs schedule yields conflict or one valid revision; worker sends only immutable approved bytes | 2 |
| T02-04 | Approval/grant revocation wins before atomic dispatch claim → zero mutation; claim wins first → in-flight snapshot outcome reported accurately | 2 |
| T02-05 | Duplicate approve/schedule commands and workflow replay do not duplicate decisions or dispatches; old queued work cannot bypass policy | 2 |
| T02-06 | Recurrence, RSS, plugs and delayed parts are gated or server-disabled; every occurrence/part respects its approval and target scope | 2 |
| T03-01 | Correct invited reviewer verifies email/session and approves exact revision; raw public preview or GET cannot approve | 3 |
| T03-02 | Expired/revoked/forwarded-to-unverified-user invitation and stale session denied; brute-force/rate-limit, CSRF and comment-XSS cases tested | 3 |
| T03-03 | Weekly batch preview matches final targets/copy/media/times; bulk decisions return per-item conflicts when one revision changes | 3 |
| T03-04 | Reviewer requests changes → editor revises → reviewer approves → publisher schedules; mobile 360px and keyboard flow succeed | 3 |
| T04-01 | Action queue scoped and paginated; pending, blocked, due/stalled, known failure, unknown and partial states project factual reasons | 4 |
| T04-02 | One channel succeeds and another fails: retain successful receipt and retry only the known-safe failed target | 4 |
| T04-03 | Provider timeout after acceptance or DB failure after remote success: classify unknown; reconcile before retry; assert no duplicate mutation | 4 |
| T04-04 | Simultaneous retry/reconcile/cancel clicks have one stable effect, enforce current grants, and produce redacted audit trail | 4 |
| T04-05 | Disconnected channel/worker stopped produces actionable blocked/stalled state; restored worker recovers without false published status | 4 |
| T05-01 | Full multi-agency/multi-client E2E across API/MCP/UI and worker paths; all V1 requirements mapped and executed | 5 |
| T05-02 | Repeat race/failure tests with defined seeds/iterations; fake-provider call ledger proves no duplicate remote mutation | 5 |
| T05-03 | Legacy migration, interrupted migration recovery and DB/media restore restore consistent grants/revisions/receipts; no approval bypass on rollback | 5 |
| T05-04 | Provider contract matrix covers priority networks, async video processing, unsupported forms, revoked tokens and partial threads; live evidence marked separately | 5 |
| T05-05 | Performance targets measured with documented profile/dataset and methodology; report p95 and page usability, not only average latency | 5 |
| T05-06 | Mobile/keyboard review plus scoped key/invite leak, CSRF/XSS, dependency advisory review and sensitive-log inspection; critical/high defects closed | 5 |
| T06-01 | Fresh independent clone at candidate commit follows quickstart with no hidden cloud paths/tools; synthetic end-to-end scenario passes | 6 |
| T06-02 | Candidate shutdown/restart, versioned migration and restore commands rehearsed on disposable state; no required tracked-file edits | 6 |
| T06-03 | Test report, license/source notices, provider matrix, known issues, environment examples and local testing checklist present and match candidate | 6 |

The catalog is minimum coverage. Each phase may add meaningful regression cases for bugs it discovers; do not add trivial tests merely to increase a count.

## Test data and modes

Use deterministic synthetic agencies, clients, role combinations, channel ownership, finalized media, review requests and outcomes. Include Unicode/Bangla content, Asia/Dhaka time display, another DST zone, expired grants, multiple revisions and a mixed legacy group. Test timezone display/UTC correctness of approved timestamps without building the V2 timezone-profile feature.

The fake provider records each mutation and can return success, known rejection, delayed success, pending processing, rate limit and ambiguous timeout. Inject a failure after remote success but before local receipt persistence. Use a separate read-only reconciliation endpoint in the test double. Avoid tests where all mock methods automatically succeed.

## Defects and completion

- Severity 0/1: data disclosure/loss, authorization/approval bypass, unintended or duplicate publication, unrecoverable migration failure. Stop progression and fix.
- Severity 2: a required workflow fails or materially misstates an outcome. Blocks the affected phase until fixed.
- Severity 3: nonblocking presentation problem. Record impact, owner, workaround and target; defer only if it does not invalidate an acceptance criterion.

Use [BUG.md](templates/BUG.md) and append to `defects.csv`. Capture reproduction, expected/actual, affected requirement, root cause, fix and regression. Never move a V1 blocker into V2 to declare V1 complete.

Required checks have `passed`, `failed`, `blocked` or `not run` outcomes; skipped tests are counted separately and justified. Automated gating cannot prove provider app approval. Release requires all internal gates passing with external platform limits accurately stated. Only rerun broad suites after meaningful code/environment changes or unresolved concerns; avoid wasteful repeated green runs.
