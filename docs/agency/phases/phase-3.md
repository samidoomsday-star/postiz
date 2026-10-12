# Phase 3 — Client review experience

Status lives in [project-state.json](../project-state.json). Read root AGENTS.md, PRODUCT-SPEC.md, TECHNICAL-SPEC.md and TEST-STRATEGY.md before starting.

**Prerequisite:** Phase 2 complete with evidence.

**Requirements:** V1-REV-001, V1-REV-002.

## Ordered work

1. Implement verified reviewer identity, client-bound invitations, hashed one-time token exchange, expiry/revocation and narrow sessions. Use the local mail sink for tests; do not weaken identity verification when real email is unavailable.
2. Build a weekly review list and detail view showing exact revision, platform previews, channel identity, final media/copy/disclosures and proposed time/timezone. Clearly mark superseded and unavailable items.
3. Implement approve/request-changes per item, per-item outcomes for bulk decisions, comment history and stale-revision feedback. All actions invoke the Phase 2 state machine.
4. Integrate staff submit/revise/decision/schedule controls into the existing composer/calendar with minimal changes. Approval does not silently publish or bypass publisher permissions.
5. Apply private-media projections, CSRF/session protections, rate limits and token/referrer/log redaction. Public upstream preview links cannot make approval decisions.
6. Test correct/incorrect/expired/revoked identities, token forwarding without verified identity, stale tabs, mixed bulk results and comment payloads. Complete the full review journey at desktop and 360px with keyboard navigation.
7. Document reviewer and agency workflows, user-facing copy, known provider-preview limits and executed browser evidence.

## Explicit exclusions

Brand-design system overhaul, custom domains/white labeling, generic autosave/version UX, report generation, new email automation platform and other V2 features.

## Validation and bug loop

Execute T03-01, T03-02, T03-03, T03-04 from [TEST-STRATEGY.md](../TEST-STRATEGY.md), plus relevant regression from previous phases. Record actual commands, targets, versions, counts, failures, fixes and retest evidence. Inspect the final diff and update traceability; do not mark an unrun or mocked live test as passed.

## Completion gate

A reviewer can securely inspect and decide on the exact content, staff can revise it and obtain a fresh approval, and an authorized publisher can schedule it through the normal UI.

Create/update `docs/agency/evidence/phase-3.md` using the report template. Populate the phase checks in project-state.json. Run the plan checker, commit/push the reviewable result, and stop. The next valid implementation prompt is **Start phase 4**.
