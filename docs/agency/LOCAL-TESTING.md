# Agency V1 local tester guide

Candidate label: `agency-v1.0.0-rc.1` (documentation label, no release tag). This independent Postiz derivative contains phases 0–6. Use the candidate branch: main still lacks the unmerged phase PRs. Exact tested commit and results are in [Phase 6 evidence](evidence/phase-6.md).

For an IDE-assisted installation, begin with root [SETUP.md](../../SETUP.md) and `bash start-local.sh`; the commands below document its underlying steps.

## Prerequisites and first run

Supported evidence: Debian 13 Linux x86_64, Python 3.12.14, Docker Engine 28.4 / Compose v2, Chromium 154. Other Linux distributions, ARM, native macOS/Windows and WSL2 have not been verified. The Linux supervisor requires `/proc`. Use a Linux machine/VM for this candidate.

Provide Git, Bash, Python 3.10+, curl, CA certificates, tar, xz, sha256sum, make, g++, OpenSSL/libssl3 and a working local Docker daemon accessible to your user. Example Debian prerequisite installation, performed by a machine administrator:

```sh
sudo apt-get update
sudo apt-get install -y git curl ca-certificates python3 make g++ xz-utils openssl libssl3t64 chromium
```

Install Docker Engine and its Compose v2 plugin using Docker's official instructions for your distribution; the script checks both before setup. The package command above does not install Docker. Allocate at least 4 CPU cores, 16 GiB available RAM for installation/build and 20 GiB free disk. The 4-CPU/8-GiB profile in HARDENING.md measures running services, not installation. Internet access is required for GitHub, nodejs.org, npm, Prisma engines and Docker registries/CDNs. Corporate proxies must retain trusted CA configuration and TLS verification. No cloud credential is required by the application. Private GitHub repository access, if applicable, is ordinary Git access only.

```sh
git clone --branch release/agency-v1-rc1 --single-branch https://github.com/samidoomsday-star/postiz.git postiz-agency
cd postiz-agency
git rev-parse HEAD
bash scripts/agency/setup.sh
bash scripts/agency/with-env.sh python3 scripts/agency/runtime.py start
```

Wait for setup to exit successfully before startup. It downloads checksum-verified Node 22.23.3 and pnpm 10.6.1 into this checkout, installs the frozen lock, generates Prisma 6.5.0, starts digest-pinned PostgreSQL/Redis/Temporal/Mailpit, deploys versioned migrations, seeds synthetic fixtures and builds the derivative. No upstream application image is used. Browser testing uses system Chromium; without it setup installs Playwright Chromium and OS dependencies, requiring download access and package-install privileges. That alternate browser-install path is not the tested Debian path.

Open the local frontend on port 4200 and sign in at `/auth/login`; the workspace is `/agency`. Backend is on 3000, orchestrator health on 3002. Mailpit's local inbox is on 18025; Temporal development UI on 18080. PostgreSQL 15432, Redis 16379, Temporal 17233 and SMTP 11025 must also be free. Only run one checkout's services at a time: project/volume names are isolated, host ports are fixed. Never stop an unrelated service to free a port without identifying it.

[The environment reference](environment.env.example) lists every generated setting with placeholders; do not source it or use the inherited upstream `.env.example`. `.agency/environment.env` and `.agency/fixture-access.json` are private generated configuration, not prerequisites to copy from another machine. Newly configured checkouts generate a unique `COMPOSE_PROJECT_NAME`. Existing configuration retains its previous project name/default to preserve volumes. Keep the environment file with that installation: replacing its password while retaining the old database volume cannot change PostgreSQL's stored password. Do not copy a configured checkout to another path; clone and run setup instead. No tracked-file edit is needed.

## Accounts and boundaries

All demo passwords are intentionally public: `LocalFixture123!`. Never expose this profile to the Internet or use customer data.

| Login | Intended test |
| --- | --- |
| `owner-a@example.test` | Agency A administrator with explicit editor/publisher/reviewer grants on both A clients |
| `editor-a@example.test` | Agency A editor on Client 1; cannot approve/publish by editor role alone |
| `reviewer-a@example.test` | Agency A internal reviewer on Client 1 |
| `owner-b@example.test`, `editor-b@example.test`, `reviewer-b@example.test` | Separate Agency B and equivalent isolation checks |
| An invited `.test` mailbox | External review-only portal session after Mailpit verification; no staff password |

There are two clients and synthetic channels per agency. Owners administer assignments/credentials; ownership does not bypass review. A staff person with explicitly granted editing and reviewing may self-approve in V1; a universal two-person rule is not implemented. Generated API test keys remain private in `.agency/fixture-access.json` and expire after 30 days; rerun seed to refresh test credentials. Seed is a synthetic fixture utility, not a customer import tool.

## Manual acceptance journey

1. Sign in as owner A. Select Client 1. Confirm only A's clients/channels appear. In another browser sign in as editor A: Client 2, Agency B and administration must be unavailable. Run the automated denial suite below for direct-ID/API checks; absence in a menu alone proves no authorization property.
2. As owner A, invite a reviewer using a fresh `.test` email. Find the invitation in Mailpit. Keep that mailbox and invitation private, including screenshots.
3. Prepare a draft with Bangla/English copy, a synthetic image, target channel and a future proposed time. Save it, choose the invited reviewer and request review. The exact copy/media/settings/channel/time become an immutable revision. No publication occurs at submission.
4. In a separate browser context open the emailed link. Request a verification code, read its separate Mailpit message and enter it in the same browser. `/review` shows a weekly review queue. Navigate to the proposed date's week if necessary. Check final copy, media/alt, channel and time/UTC offset. Request changes with feedback.
5. Back in the editor, open the work, read feedback, revise and save a new revision; request review again. The old version cannot be approved or scheduled. Reload the reviewer queue and approve the new version. Approval alone must produce no provider publication.
6. As owner/publisher, schedule the exact approved revision. Wait until its approved time. In the action dashboard inspect the revision and target receipts. A confirmed result has a synthetic receipt. Editing copy, media, target or time requires fresh approval; do not try to move a past approved time silently.
7. Open `/agency/actions`, filter by client/state/owner and open the exact revision. Assignment/acknowledgment changes workflow metadata only. UNKNOWN means outcome uncertain, not failed; use the read-only reconcile action where supported. Never retry UNKNOWN or partially claimed work. A proved single-part FAILED target may offer explicit retry; confirmed targets must remain untouched. The full suite creates and checks partial, pending, timeout-after-acceptance, rejected and resumed cases automatically; do not fabricate statuses by editing the database.
8. Close/revoke an invitation or remove a grant and confirm future decisions/scheduling are refused. A mutation already claimed may complete. Expired/renewed links cannot resurrect an old approval.

Synthetic provider mode replaces real social mutations and writes a private local call journal. It is a realistic boundary test with real HTTP/PostgreSQL/Temporal/browser/email-sink services; it does not certify any social API or external mailbox delivery.

## Automated acceptance and restart/restore

After setup, run the complete verification path (approximately 10–20 minutes after build):

```sh
bash scripts/agency/verify.sh
```

The script runs planning checks, scoped lint, test/service type checks, unit tests, migration/adoption/quarantine/interruption/restore rehearsals, real-service API/browser tests, immutable-media restore, persisted workflow replay, approved-queue restart, full service stop/start, idempotent migration and another actual queue publication. It fails on the first error. Apps remain running after success for manual testing. Private artifacts live under `.agency/results` and `.agency/logs`; do not upload them without redaction. The tests add synthetic work, invitations and email, so a used database is expected. Full unit/API/browser counts and any failures/fixes are recorded in the candidate evidence.

For ordinary shutdown/restart, preserving data:

```sh
bash scripts/agency/with-env.sh python3 scripts/agency/runtime.py stop
bash scripts/agency/with-env.sh docker compose -f compose.agency.yaml stop
bash scripts/agency/with-env.sh docker compose -f compose.agency.yaml up -d --wait
bash scripts/agency/with-env.sh python3 scripts/agency/runtime.py start
```

The versioned migration and DB/media restore procedure is in [MIGRATIONS.md](MIGRATIONS.md) and [HARDENING.md](HARDENING.md). The verify script restores disposable copies and validates compiled approval/media checks; it never rolls the active database backward. Media restore requires UNKNOWN fixture history created by the full suite; replay similarly needs its completed histories. Keep database, private media, private environment and Temporal history together in secured backups. Never run inherited `prisma-reset`, `pm2`, `prisma-db-push`, production Compose or `down -v`. Rollback cannot remove agency guards or run an older unsafe worker against this database.

## Troubleshooting and reporting

| Symptom | Action |
| --- | --- |
| Missing tool/Docker permission | Fix the named prerequisite/local daemon permission; rerun setup. Do not disable checks. |
| Port occupied | Stop this checkout with its supervisor, or identify the separate owner. Never kill arbitrary listeners. |
| Download/TLS failure | Check named domain, proxy/CA and package registry access. Keep checksum/lock/TLS verification enabled. |
| Partial build or missing module | Stop owned apps and rerun setup; wait for its successful exit before startup. |
| PostgreSQL authentication after moving config | Restore matching private configuration/project; a new password does not update an existing volume. Preserve volumes. |
| Work stays due/queued | Inspect checkout-owned worker status and private logs; HTTP health alone does not prove queue polling. |
| Reviewer link expired/used or wrong week | Resume the same valid browser session or issue a fresh invitation/review; navigate to the proposed week's queue. |
| API key expired | Stop tests and rerun the documented synthetic seed; keep generated key private. |
| Live OAuth/analytics/MCP unavailable | These inherited surfaces are deliberately server-disabled in this candidate; see known issues. |

Record commit (`git rev-parse HEAD`), OS/architecture, tool versions, exact command/exit, failing test/count, expected/actual behavior, role/client/time and reproducible synthetic steps in [the bug template](templates/BUG.md). Never include passwords other than public demo values, invitation fragments, verification codes, cookies, API keys, DB URLs or raw logs. File the report for owner review; this guide does not send it automatically.

## Real accounts are a separate acceptance stage

No real provider app credentials are needed or requested here. OAuth connection/reconnection remains disabled in the staged agency boundary. Do not turn off synthetic mode or insert tokens to claim a live test: a separate authorized engineering task must enable/scopetest the connection path, check the provider's app approval/permissions/licensing and name test accounts/actions first. The [platform matrix](platform-matrix.csv) distinguishes mock contracts, inherited/unverified paths and disabled forms. All live publication and live recovery remain unverified. Production configuration, deployment and customer onboarding require a separate plan.
