# Phase 1 defects and resolved findings

## P1-001 — Form label selection (severity 2, resolved)

The first browser run failed to find the exact Active client label even though the select and correct options were rendered. A wrapped select label included option text for Playwright's label lookup. Added an explicit accessible label and reran the actual desktop/mobile and credential flows. Six browser tests passed on the second run. Later tests run the complete suite against the final rebuilt source. During the initial failed run a rebuild also invalidated Next outputs under a running app; final builds use stopped apps.

## P1-002 — Disabled activity return contracts (severity 2, resolved)

Replacing unsupported legacy activity implementations with throws initially inferred void/never/array return types that broke compiled callers in retained Temporal workflows. Preserved the original declared contracts (PendingCheckResponse or service ReturnType; no workflow edits) while keeping the explicit runtime denial. The digest audience adapter now returns its existing organization shape with an empty users list. Full service type/build checks and actual Temporal regression/denial tests validate the fix.

## P1-003 — Legacy invitation cookie and notification audience (severity 1 review finding, resolved)

A code review found that ordinary local login could redeem an old org invitation cookie through the inherited routeAuth flow even when the invite endpoints were blocked. Login now rejects legacy org cookies and unsupported social-login flows. The dedicated HTTP regression verifies denial. Existing post notifications and digest/streak audiences could broadcast client content organization-wide; those audiences are suppressed. Legacy external mail jobs are denied outside guarded synthetic mode; the authorized local Mailpit smoke remains functional.

## P1-004 — Disposable remapping fixture retention (severity 3 test defect, resolved)

A remapping acceptance test left its extra channel in Client A1, correctly making the baseline exact channel-list assertion fail. Added cleanup of only that suite's recorded disposable channel/post IDs after its assertions. Removed one confirmed leftover from this task's earlier run, with synthetic-database/name/token guards. The baseline assertion remains exact. No customer data or persistent baseline fixtures were removed.

## Additional review fixes

The first implementation needed stronger source-level coverage beyond HTTP guards: legacy status/date/settings/generated-content mutation services and provider plug methods are now explicitly denied, as are external media/clipping/video activities. All supported publication versions use the shared dispatch check; stale content/time and future dispatch are rejected, current persisted channel identity replaces workflow-supplied token data, and actorless/quarantined/expired/revoked work cannot invoke the provider. Auth middleware and the new guard use the same organization header priority and deterministic default selection. Private media uses a canonical confined file path after current authorization. These findings were corrected before the final evidence run.
