# Versioned schema and ownership migration

Phase 1 introduces two ordered Prisma migrations: the pinned upstream schema baseline and additive agency ownership/access controls. They use PostgreSQL transactions. Fresh synthetic setup deploys both; existing synthetic Phase 0 setup adopts the baseline only after comparing inherited models for schema drift. Mastra-owned tables are preserved and remain outside Prisma's schema.

## Verified local development commands

Stop owned apps before rebuilding or migrating. From the repository root:

```sh
bash scripts/agency/with-env.sh python3 scripts/agency/runtime.py stop
bash scripts/agency/with-env.sh docker compose -f compose.agency.yaml up -d --wait
bash scripts/agency/with-env.sh node scripts/agency/migrate.mjs
bash scripts/agency/with-env.sh node scripts/agency/seed.mjs
bash scripts/agency/with-env.sh python3 scripts/agency/rehearse-migration.py
```

`migrate.mjs` refuses customer/remote databases. It runs Prisma migration deployment, never `db push`, `reset`, or data-loss options. `setup.sh` calls it before the seed and build. Applied migration files must remain unchanged after release. New changes require a new ordered migration.

The rehearsal creates uniquely named `agency_migration_fixture_*` databases on the local synthetic PostgreSQL service. It installs the baseline, loads two-agency legacy fixtures, terminates only its own fixture connection before commit, proves rollback, deploys the migration twice, verifies ownership/quarantine invariants, restores pre- and post-migration snapshots and upgrades the restored legacy copy. It removes only the disposable databases it created. It never clears the development/customer database or Compose volumes.

## Data consequences

- Organization-wide API keys are nulled, and their API/OAuth/MCP transports are independently denied by the server. Old secrets cannot acquire new scopes.
- A valid Integration → Customer → Organization chain maps to a client. Foreign/deleted customer references are detached; the channel remains quarantined for explicit mapping.
- Valid legacy posts map through their channel. Mixed-client/mixed-agency groups, orphaned and ambiguous content remain quarantined. No staff grants are inferred.
- **All** legacy queued posts become drafts, including clearly mapped records. They have no originating authorized principal. Restarting an old Temporal workflow cannot publish them.
- Published history is preserved. Legacy media stays quarantined until an administrator confirms its client and its local private path.
- Channel reassignment quarantines that agency's existing channel content, clears its originating identity and pauses queued work. Explicit content mapping never grants publication rights. Mixed-client groups cannot be mapped as one client.
- SQL triggers reject nonquarantined resources with invalid parent ownership. Audit records reject UPDATE/DELETE; management events and audit writes share a transaction.

## Customer migration procedure (requires a later authorized deployment)

The current deliverable is isolated local development. Customer migration must be rehearsed on a copy of that customer's actual schema/media before deployment; synthetic results do not certify unknown drift.

1. Pause web mutations and worker dispatch. Preserve the application commit, database dump, private media and Temporal recovery information. Check snapshot integrity by restoring to a separate database.
2. Compare the inherited schema to [upstream-schema.prisma](evidence/upstream-schema.prisma) and [upstream-schema.sql](evidence/upstream-schema.sql). Review extra subsystem tables separately. Any changes to an inherited model block blind baseline adoption.
3. On the verified copy, mark `20261013000000_upstream_baseline` applied with Prisma `migrate resolve`; deploy the additive migration. Inspect failed migrations before using `resolve --rolled-back`. Never mark a partially changed schema complete just to silence an error.
4. Inspect quarantine, assign client/channel ownership and explicit staff roles, create scoped credentials, and confirm private-media access. Run isolation and zero-legacy-dispatch checks before resuming workers.
5. Keep a compatible agency binary. Rolling back to an upstream binary would reopen disabled keys, previews and queued publishing paths, so application-only rollback to upstream is unsafe.

For database/media rollback, keep dispatch stopped, restore the pre-migration snapshot into a separate database, validate it, and choose a compatible guarded application/migration path before switching. Restore is not a promise to undo a provider mutation already in flight; reconcile such work separately. The local rehearsal verifies fixture recovery, not live-provider rollback.

## Development replay evidence

During Phase 1 development, the initial unreleased migration was made transactional before final verification. The earlier synthetic development database was preserved under a unique `agency_development_snapshot_*` name; the Phase 0 dump was restored into a fresh `postiz_agency_test` database, and the final reviewed migration was adopted/deployed there. No data was discarded. The private preserved name is in `.agency/phase1-preserved-database.txt`; it is not a production runbook step.

## Phase 2 additions

Three ordered migrations add immutable approval/history/receipt/snapshot tables, Post revision bindings, shared policy locks and stronger material Post guards. The complete deployment now contains five migrations including the baseline and Phase 1 access controls. Phase 1 queues are paused again and receive no inferred revision/approval. Existing published history remains intact. Never edit an applied migration; corrective schema changes use a later migration.

The extended rehearsal terminates a Phase 2 migration connection before COMMIT and verifies rollback/redeployment. A real dump/restore preserves revision/decision history and an UNKNOWN receipt; UPDATE/DELETE attempts against immutable history fail. Private `.agency-revisions` files live under UPLOAD_DIRECTORY and must be backed up/restored with their original media, database and application version. Database-only restoration cannot reconstruct snapshot bytes. Existing development history is retained; integration cleanup archives disposable channels instead of deleting revision Posts.

An upstream binary remains an unsafe application rollback: it does not enforce these claims. Keep dispatch paused while restoring and reviewing current policy and unknown/in-flight receipts. The synthetic rehearsal does not authorize customer migration or undo external publication.


## Phase 3 additions

The sixth migration adds client review invitations, browser challenges, narrow sessions, persistent rate counters, append-only public feedback and an optional invitation reference on review decisions. It preserves existing staff grants and decision history. SQL constraints bind session/comment/decision parents and prevent changing invitation/session identity or exceeding session lifetime. Customer/organization policy writes now participate in the shared lock as well.

The extended rehearsal verifies Phase 3 interruption rollback/redeployment and real dump/restore of verified invitation state, hashed sessions and public feedback. Restoring old snapshots does not extend expired sessions or revive used/revoked invitations. Keep dispatch paused while validating invitations, memberships and bound approvals. Session hashes and original private media/snapshots are sensitive backup data; restore them only with the compatible guarded binary. No customer deployment or live email delivery has been authorized by the local rehearsal.

## Phase 4 additions

The seventh migration adds nonmaterial versioned AgencyActionRecord, immutable AgencyRecoveryEvidence and AgencyDispatch.attempt (existing rows retain attempt 0). It preserves every prior receipt and introduces scope/owner/version guards, proof-bound FAILED→READY rearming and immutable confirmed identity. It never resets UNKNOWN, infers success, or grants live-provider recovery support.

The local rehearsal adds Phase 4 transaction-interruption rollback/redeployment, unknown/no-proof rearm refusal, action scope/version refusal, immutable proof history and real operator/retry-evidence dump/restore. Restore the complete history and matching guarded binary; preserve attempt numbers and operation IDs so a previously claimed/uncertain attempt cannot be sent again. Restore is not remote rollback. Never edit applied migrations or downgrade to a binary that lacks these guards.

## Phase 5 restore verification

`restore-media.mjs` uses a new synthetic media/revision fixture and an actual PostgreSQL custom-format dump. It restores only to a unique disposable local database, copies the original media and private snapshot into a separate directory, and invokes the compiled ApprovalService media eligibility code against that restored database/directory. Missing and tampered snapshot bytes must be denied, restoring the exact backup must verify, and grants/UNKNOWN receipt attempt history must match. It never launches a worker against the restored copy. It removes only the database/directory it created and leaves immutable fixture history in the original synthetic database.

A database/media restore does not authorize an upstream or obsolete worker binary. Keep dispatch stopped; switch only to the compatible guarded application after inspecting current policy, invitation identity and receipts. Old workflow redelivery is covered by shared activity denial/replay/restart tests; using an upstream worker that lacks those guards is an unsupported rollback requiring isolation, not a way to bypass approval.
