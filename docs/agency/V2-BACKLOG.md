# V2 — deferred enhancements

**No implementation in V1.** This backlog preserves all recommendations without making them implicit tasks. Priorities below are candidates, not an approved V2 commitment. The original research priorities do not override the owner's focused-V1 decision.

| ID | Enhancement | Why it matters | Future validation gate |
| --- | --- | --- | --- |
| V2-01 | Correct analytics trends and metric semantics | Source audit found fixed trend values and missing-data ambiguity | Reproduce on current derivative; actual prior-period calculation or unavailable; native metric definitions/freshness |
| V2-02 | Durable signed lifecycle webhooks | Current sender was best effort | Transactional outbox, versioned events, HMAC, bounded retry, replay and consumer deduplication |
| V2-03 | Stable content-edit/reschedule REST and MCP parity | Existing entry paths differ | Documented revisions, optimistic conflicts, full metadata, per-channel dates, parity suite |
| V2-04 | General intake idempotency | External retries can create duplicate campaigns | Persistent request identity/payload conflicts, expiration semantics, concurrency tests |
| V2-05 | RSS/CMS ingestion redesign | Newest-item-only and draft/publish discrepancy in research | All unseen eligible items, source ledger, filters, caps, explicit draft/review/publish modes |
| V2-06 | Connection/onboarding wizard and health guidance | Platform setup is a major operational obstacle | Platform/account capability checks, reconnect instructions, actionable configuration diagnostics |
| V2-07 | Client IANA timezones and schedule profiles | Multi-client time interpretation can be confusing | DST/ambiguous-time tests, client defaults, clear UTC/local display |
| V2-08 | Autosave and user-facing version recovery | Unsaved editing can lose work | Crash/reload/offline conflict recovery with visible version history |
| V2-09 | Client asset folders and lifecycle management | Flat media library scales poorly | Folder/search/bulk archive UX, references, retention, access-safe organization |
| V2-10 | Client brand profiles and private source notes | Generic AI lacks controlled client context | Private context isolation, approved/forbidden language, Bangla/English editorial QA |
| V2-11 | Trustworthy client reports | Agencies need accountable results | Correct metric semantics and provenance first; branded exports with freshness/availability |
| V2-12 | Meta comments and messaging inbox | Requested by multi-account operators | Supported scopes and reply windows, sync, assignment, audit and platform-policy review |
| V2-13 | AI model/provider configuration and graceful optional startup | Research found hard-coded choices/possible startup coupling | Configured providers, isolated failure, usage visibility; no subscription/API equivalence assumption |
| V2-14 | Rich server media preflight and conversion | Publishing requirements differ by format/network | Real codec/duration/dimension checks, asynchronous readiness, clear errors |
| V2-15 | Immediate critical notifications and escalation | Digest timing can delay action | Preference-aware immediate alerts, deduplication/escalation and delivery evidence |
| V2-16 | Agency-focused UI simplification | Broad features can distract operators | Test task completion; configurable advanced/niche features with honest capability labels |
| V2-17 | Expanded imports, design, grid and clipping workflows | Useful but less fundamental than agency control | Demand validation; licensed integrations; import/preview/undo and media contracts |
| V2-18 | Advanced recurrence/plugs guardrails | Engagement automations need limits | Approval-compatible occurrences, caps/cooldowns, dry-run and execution history |
| V2-19 | Localization and mobile editorial improvements | Existing Bangla/responsive support needs task-level evaluation | Terminology/caption quality, regional formats and actual mobile agency tasks |
| V2-20 | Additional providers and deeper provider support | Broader APIs can be useful when feasible | Official API access, capability matrix, real account tests; no assumed WhatsApp Channels/Status support |
| V2-21 | Operational monitoring and managed backup automation | Worker health and recovery require reliable operations | Polling/queue age/backup restore, explicit runbooks and failure alerting |
| V2-22 | Custom link domains and transformations | Agencies may want branded attribution | Preserve approved final links; domain isolation, attribution correctness and change invalidation |

V1 includes only the foundations required for its three product capabilities: protected media references, revision checks, scoped operations, safe operator retries, accurate publication statuses, and tested setup/restore. These do not authorize the larger enhancements above. Existing features may be restricted to keep V1 safe; do not “temporarily” build the V2 solution behind a feature flag.

Promote an item only after a new owner scope decision. Revalidate the original evidence on the then-current code, identify a measurable outcome, write its SRS/acceptance cases, estimate dependencies, and add separate V2 phases. No V2 phase is eligible while running a V1 phase prompt.
