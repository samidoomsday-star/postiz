# IDE-assisted local setup follow-up

Status: in_progress. Authorized by owner after Phase 6: make the repository link sufficient for an IDE to install and run the local candidate, with repository guidance. Base `04c739f4ba551eca355f41e2942d9865e4a29260`. This does not reopen phases 0–6 or authorize V2.

## Changes

- Root SETUP.md is the installation/operations entry point, including a pasteable IDE prompt, OS routes, prerequisites, safe branch selection, diagnosis and handoff.
- Root start-local.sh installs/builds if necessary, starts actual services/apps, runs the existing 12 API/browser smoke scenarios and leaves them running. Repeated starts reuse successful builds for the same commit; explicit setup invalidates the marker before rebuilding. Stop/status/check/full verification are named actions, with no data reset.
- AGENTS.md prioritizes setup requests separately from completed phase implementation. Claude/Copilot/Cursor/Windsurf instructions delegate to that entry point. Stale root Claude instructions archived (trailing whitespace normalized; original retained in base commit) under docs/agency/archive; current Next.js nested instructions preserved.
- README and tester index expose the one-command path. The candidate link selects the complete branch explicitly. Automatic repository-default update was attempted through the GitHub REST API and denied with HTTP 403 (Resource not accessible by integration), despite read metadata reporting admin permission. Git symref and repository API confirm default remains main. No alternative repository-settings connector is available. Owner can change the default in GitHub settings; no main merge or history change was attempted.

## Validation

Pending actual explicit-candidate independent clone/start, repeat-start and stop/start. Prerequisite check passed locally; invalid action returned exit 2 with usage. No application/schema/provider/dependency change is intended. Platform evidence remains Linux x86_64; native Mac/Windows/ARM and WSL2 routes are not claimed executed.
