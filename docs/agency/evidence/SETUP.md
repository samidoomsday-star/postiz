# Planning foundation evidence — 12 October 2026

Scope: import the pinned upstream source, prepare BRD/SRS and technical/test specifications, phase instructions, state tracking and repository automation. Product implementation is explicitly deferred to Phase 0 and later phases.

## Source import

The selected repository `samidoomsday-star/postiz` had no commits or remote branches when inspected. Fetched upstream release `v2.25.1` and created local `main` from `91c91f633a0175fb3914dba64c932928c514b72a`. Origin remains the owner's repository; upstream is separately configured with disabled push. Upstream application source, dependency declarations, lockfile and license were not edited during planning.

User explicitly confirmed focused V1 and manual upstream updates. Research files were copied into the repository so later tasks do not depend on the scratch checkout or conversation context. Original research covers newer upstream main; Phase 0 must revalidate it on this release.

## Prepared artifacts

Root execution instructions and README entry point; product and technical specs; seven phase specs; requirements traceability and acceptance catalog; decision log; V2 backlog; development and release runbooks; phase/bug templates; platform matrix; defect ledger; machine-readable state and upstream lock; read-only phase checker; planning-only CI and derivative PR/Copilot instructions.

Inherited workflows and dependency update configuration are archived, preserving original content. Their automatic merges, upstream image/extension publication and stale-issue actions are not active in this derivative. No GitHub server-side branch protection or external bot settings were changed.

## Validation record

Executed in `/workspace/postiz` using Python 3.12.14:

| Check | Result |
| --- | --- |
| `python3 scripts/agency/plan.py check` | Passed: seven phases, requirement/case coverage, traceability, local document links and state consistency |
| `python3 scripts/agency/plan.py next` | Passed: Phase 0, planned |
| `python3 scripts/agency/plan.py phase 0` | Passed: prints the eligible specification, changes no state |
| `python3 scripts/agency/plan.py phase 1` | Expected rejection: exit 1; cannot skip Phase 0 |
| `python3 scripts/agency/plan.py phase 7` | Expected rejection: exit 1; outside V1 range |
| In-memory malformed state marking Phase 0 complete without evidence | Expected rejection; actual state file unchanged |
| Python syntax parsing and `git diff --check` | Passed |
| Baseline diff and byte comparison | Passed: apps, libraries, package/lockfile, license, environment and Compose examples unchanged |
| Archived workflow byte comparison against pinned Git objects | Passed: originals preserved; only planning.yml is executable workflow configuration |
| Git ancestry and shallow status | Passed: baseline retained; repository is not shallow |
| State audit | Passed: all seven phases remain planned |

The checker safety scenarios were executed through Python subprocess/in-memory checks; they validate the planning mechanism, not product functionality. No product test counts or CI passes are claimed.

Saved the cloud environment's `start_skill` draft with tested planning commands, repository entry points, the stop-before-Phase-0 rule and instructions to replace it with verified runtime instructions in Phase 0. No install script, secret, environment variable or network change was needed for this planning workflow. Draft persistence is confirmed; cloud environment publication is a separate platform action and is not claimed here.

Remote publication and independent-clone verification are recorded after their execution below.

## Readiness boundary

All phases remain `planned`. No dependencies installed, no application/service build or startup, no schema migrations, no live account connection/publication, and no feature changes. Phase 0 must establish and verify the development runtime; the current cloud Node version does not meet the imported app's engine range. The planning checker validates files/state, not whether test-report claims are true.

Next authorized step after this setup: the owner can request **Start phase 0**. This setup turn stops before that phase.
