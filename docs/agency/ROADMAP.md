# Phased delivery plan

The planning foundation is outside numbered phases and is complete. Phases are sequential and intentionally stop for a reviewable handoff. No calendar estimate substitutes for a quality gate.

| Phase | Deliverable | Dependency | Implementation boundary |
| --- | --- | --- | --- |
| [0](phases/phase-0.md) | Reproducible baseline, path inventory, test harness | Planning setup | Prove inherited application and establish real checks |
| [1](phases/phase-1.md) | Client boundaries, roles, scoped credentials, audit foundation | 0 | Prove tenant isolation before exposing review |
| [2](phases/phase-2.md) | Immutable revisions, approval rules and dispatch enforcement | 1 | Prove nobody can publish an unapproved version |
| [3](phases/phase-3.md) | Mobile client review and secure invitations | 2 | Complete prepare → review → approve → schedule |
| [4](phases/phase-4.md) | Agency actions, receipts and safe recovery | 3 | Complete publish → inspect → resolve |
| [5](phases/phase-5.md) | Integration hardening, regression and migration rehearsal | 4 | Demonstrate V1 quality across boundaries |
| [6](phases/phase-6.md) | Cloneable local release candidate and testing handoff | 5 | Reproduce the finished workflow from a clean clone |

For every phase: read scope → inspect relevant code → implement a small slice → run focused tests → investigate failures → fix → rerun affected checks → run phase regression gate → inspect diff → update evidence and state → commit/push for review → stop. When an earlier failure threatens the current phase, repair it within the relevant requirement and record it; do not hide it in V2.

## Status rules

`planned` → `in_progress` → `complete`, or `in_progress` → `blocked` → `in_progress`. Only one phase may be active/blocked. A completed phase needs an evidence report, nonempty passed checks with commands and artifacts, and no blockers. Later phases cannot start until dependencies are complete. State changes are deliberate agent edits, not the output of a script pretending to verify application behavior.

`project-state.json` is authoritative for phase status; phase checkboxes describe tasks. A report records partial progress in an interrupted phase. Do not maintain a competing “next phase” value in another file. Run `plan.py next` to derive it.

## Common gate

Every phase must satisfy its listed acceptance cases, update requirement-to-test traceability, record real pass/fail counts and known bugs, preserve upstream notices, demonstrate no V2 scope creep, and include a manual code/diff review. Required failed/unrun checks block completion. An externally blocked live provider test can be a documented limitation for the local release candidate only where the release criteria explicitly permit it; isolation, approval and recovery tests never become optional.

Critical/high defects block progression. Lower-severity issues need an owner, impact, workaround and scheduled phase; no issue affecting permissions, approval enforcement, data integrity or duplicate publication may be classified as cosmetic. State validation is required but does not replace product validation.

## Scope changes

New requests enter V2 by default. If a V1 acceptance criterion requires a small prerequisite, document its necessity and limit the implementation to that criterion. Moving an enhancement from V2 to V1 requires the user's explicit scope decision, an ADR, revised requirements, phases and tests. No unattended upstream merges or dependency refreshes.
