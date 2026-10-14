# IDE-assisted local setup follow-up

Repository implementation: complete. GitHub default-branch setting: blocked by integration permissions. Windows host execution: not run; owner PC acceptance remains necessary.

Authorized by owner after Phase 6: make a repository link sufficient for an IDE to install and run the local candidate, with repository guidance. Owner confirmed **Windows** during this task. Base `04c739f4ba551eca355f41e2942d9865e4a29260`. This does not reopen phases 0–6 or authorize V2.

## Delivered behavior

- Root [SETUP.md](../../../SETUP.md) is the operations entry point: pasteable IDE prompt, OS/prerequisites, branch selection, diagnosis and handoff.
- Root [WINDOWS-SETUP.md](../../../WINDOWS-SETUP.md) prioritizes Windows x86_64 with Ubuntu 24.04/WSL2, Docker Desktop WSL integration, Linux-filesystem checkout, IDE execution context and host-browser verification. It distinguishes administrator/reboot/account actions from tasks the IDE can complete and documents the supported Playwright fallback for Ubuntu without Debian's system Chromium. These Windows/Ubuntu/browser-fallback steps are guidance, not executed platform evidence.
- `bash start-local.sh` installs/builds if needed, starts actual services/apps, runs the existing 12 API/browser smoke scenarios and leaves them running. Repeat starts reuse a successful same-commit build; explicit setup invalidates the marker before rebuilding. Stop/status/check/full verification have named actions. No data reset or real social credentials.
- AGENTS.md treats setup as operations, separately from phase implementation. Claude/Copilot/Cursor/Windsurf instructions delegate to that guide. Stale root Claude instructions archived under docs/agency/archive (trailing whitespace normalized; original retained in base commit); nested Next.js instructions preserved.
- README and tester index expose the candidate link and one-command flow. No application, schema, Temporal workflow, provider, dependency, lockfile or existing setup-script change.

## Actual verification

Tested launcher/setup source commit **`9a5045e6fab0ccddf251f5ff94fbddf5f581d5b0`**, independent branch clone at `/workspace/postiz-ide-setup-check`. The clone began without `.agency` or node_modules; no configuration, tool directory or dependency store copied. Later Windows documentation/evidence commits have the same launcher/application source.

Launcher SHA-256: `741647ddaddf25173e86b7b3689493e8cbff7204772eec57864ec3c77df7bdaf`.

Environment: Debian 13 Linux x86_64, Node 22.23.3/pnpm 10.6.1 downloaded into this clone; Docker 28.4.0/Compose 2.40.3; Prisma 6.5.0; Playwright 1.58.2/system Chromium 154. External provider boundary synthetic; actual local HTTP/PostgreSQL/Temporal/Mailpit/browser services.

| Command / check | Completed result |
| --- | --- |
| `bash -n start-local.sh`; `bash start-local.sh check` | Shell syntax and actual Linux/Docker prerequisite checks passed. |
| `bash start-local.sh nonsense` | Exit **2** with usage; invalid action never starts setup. |
| `bash start-local.sh` in fresh clone | Exit **0**, 14 October 2026 **17:23:47–17:27:59 UTC**. Cold pinned bootstrap/frozen install, fresh unique Compose project, all seven migrations, seed and all three production builds; **12 passed (9 API + 3 Chromium), zero failed/skipped/flaky**, smoke duration 20.5s. Successful marker written only after setup completed. |
| Same command repeated | Exit **0**, **12 passed**, 18.4s. All recorded app process identities remained equal, build-marker timestamp unchanged, no install/build in output. |
| `status`, `stop`, then default start | All exited **0**; restart **12 passed**, 18.9s. Private environment hash, build marker and persistent-volume names unchanged; previous Post count retained and increased by new smoke work. No volume cleanup or database reset. |
| Git status after all three runs | Clean: no tracked configuration edits or untracked nonignored output. |
| Active guide link/source review and plan checker | Relative links resolve; completed phase state remains consistent; full application/setup/dependency tree unchanged from the preceding candidate. |
| Private current log review | Six setup/application logs checked against six known generated private secret values and raw review-token patterns: zero matches. Public demo password is intentional; raw artifacts remain private/ignored. |

These are **three runs of the same 12 scenarios**, not 36 unique scenarios. The full 66-unit/93-API-browser/migration/restore/replay evidence remains in phase-6.md; it was not relabeled as a new broad suite. The launcher delegates full acceptance to existing verify.sh. No test assertion was changed or disabled.

The fresh clone is retained stopped with its own data; primary checkout startup is restored separately to avoid fixed-port conflicts. The CLI leaves apps running after a successful normal invocation; stopping it here is deliberate teardown of the owned test installation.

## GitHub/default-link limitation

Attempted the authorized default-branch update through `PATCH /repos/samidoomsday-star/postiz` with default_branch=release/agency-v1-rc1. GitHub returned **403 “Resource not accessible by integration”**, even though read-only repository metadata reported admin permission. Git symref and repository API confirmed default remains `main`. No alternative settings connector is available. This is a GitHub integration scope denial, not an automatic approval-review rejection. No merge, history rewrite or credential workaround was attempted.

**Working link:** https://github.com/samidoomsday-star/postiz/tree/release/agency-v1-rc1 . The IDE prompt explicitly selects this branch. To make the bare root repository URL clone the full app by default, the owner must change the GitHub repository's default branch to `release/agency-v1-rc1` in settings. Earlier phase PRs remain unmerged. The existing draft PR #7 contains this follow-up.

## Owner next action

Use the candidate link and Windows IDE prompt, complete any genuine Windows/WSL/Docker system prerequisites, then perform local acceptance. Native Windows/macOS/ARM and WSL2 host forwarding are not certified by Linux-only cloud execution. Live social connections remain disabled/unverified; no V2 or production work was started.
