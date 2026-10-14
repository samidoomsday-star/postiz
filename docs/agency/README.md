# Project control center

The owner confirmed on 12 October 2026: build a focused V1 for small agencies; reserve other enhancements for V2; pin Postiz and review updates manually. This folder is the development source of truth, replacing chat memory as the execution plan.

The planning foundation is complete. **Read project-state.json and phase reports for current progress.** Planning-stage notes are historical; they do not override recorded implementation evidence. Real social-account tests require separate authorization.

## Documents

| Document | Purpose |
| --- | --- |
| [Product spec](PRODUCT-SPEC.md) | BRD, SRS, personas, scope, requirements, acceptance targets |
| [Technical spec](TECHNICAL-SPEC.md) | Data boundaries, approval state machine, dispatch contract, API and migration design |
| [Roadmap](ROADMAP.md) | Phases 0–6, dependencies, stop and completion rules |
| [State](project-state.json) | The authoritative ordered phase status, evidence pointers and blockers |
| [Traceability](traceability.csv) | Requirement → owning phase → acceptance cases |
| [Testing](TEST-STRATEGY.md) | Validation cases, severity policy, evidence and release gates |
| [Execution](EXECUTION.md) | How an agent starts, resumes, finishes and hands off a phase |
| [Decisions](DECISIONS.md) | Agreed defaults, rationale, outstanding technical decisions |
| [Upstream policy](UPSTREAM.md) | Baseline provenance, manual update policy and licenses |
| [Development runbook](DEVELOPMENT.md) | Current facts and Phase 0's required executable setup deliverables |
| [Client review workflow](REVIEW-PORTAL.md) | Verified invitation, weekly review, feedback and staff handoff contract |
| [Operator dashboard](ACTION-DASHBOARD.md) | Scoped action queue, truthful outcomes and safe recovery runbook |
| [Hardening and maintenance](HARDENING.md) | Security, dependency, restore and benchmark limits |
| [Release checklist](RELEASE-CHECKLIST.md) | What “ready to clone and test locally” requires |
| [V2 backlog](V2-BACKLOG.md) | Explicitly deferred work, promotion rules |
| [Research](research/postiz-agency-product-research.md) | Evidence and limitations; older recommendations do not override agreed V1 |
| [Setup evidence](evidence/SETUP.md) | What was actually prepared and verified |

## Commands and prompts

From the repository root, Python 3.10+ is sufficient for planning checks:

```sh
python3 scripts/agency/plan.py check
python3 scripts/agency/plan.py next
python3 scripts/agency/plan.py phase 0
```

Tell the agent **“Start phase 0”**, **“Start next phase”**, or **“Resume phase 2.”** It must read the plan, implement only the selected eligible phase, validate it, fix defects, record evidence, and stop at its boundary. You do not need to repeat the product requirements. Explicit later user instructions can change the plan; record them in the decision log.

Each phase file has an ordered work list and completion gate. If interrupted, the report records the exact next unfinished task. Never advance based only on the phase number in a prompt or on elapsed time. An upstream/provider outage or missing app approval remains visible as a blocker or a release limitation, depending on the gate it affects.

## Version terminology

Postiz **v2.25.1** is the upstream base. Agency **V1** is our first functional version; **V2** is a separate, deferred product backlog. These version numbers are unrelated. Initial delivery targets a local release candidate, provisionally `agency-v1.0.0-rc.1`, not a claim of production readiness or API approval on every network.
