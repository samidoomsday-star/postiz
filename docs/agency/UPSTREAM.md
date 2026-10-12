# Upstream provenance and update policy

| Item | Value |
| --- | --- |
| Source repository | https://github.com/gitroomhq/postiz-app |
| Pinned release | v2.25.1 |
| Pinned commit | `91c91f633a0175fb3914dba64c932928c514b72a` |
| Selected derivative repository | https://github.com/samidoomsday-star/postiz |
| Research source commit | `3a7d28b7ad9654063f4f1f3938b8fe5d1590bf8f` (main, newer than release) |
| Update mode | Manual review; no automatic upstream merges/dependency updates |

The repository was initially empty. Setup fetched the released source with Git history, then added the planning foundation and archived inherited automation. Application source, dependency manifests, lockfile and license are unchanged by this setup. `upstream.lock.json` stores machine-readable provenance. Full ancestry is retained; the derivative is not necessarily registered as a GitHub fork, and no such relationship is claimed.

## Remote policy

`origin` is the owner's repository. The current checkout has a read-only-use `upstream` remote with a disabled push URL. Git remotes are local configuration and are not cloned with the repository. On a new clone, add an upstream remote only when needed for an authorized manual review:

```sh
git remote add upstream https://github.com/gitroomhq/postiz-app.git
git remote set-url --push upstream DISABLED
```

If it already exists, inspect its URL before changing it. Never push derivative work to gitroomhq. Do not run generic `git pull upstream main`, dependency bulk upgrades, or auto-merge bots as part of a phase. No self-updating container tags or Watchtower-style updater should be added to the candidate runtime.

## Manual maintenance procedure

1. Review advisories and provider/API changes before each release and on an owner-requested maintenance task. Record date, source and applicability. No monitoring service is implied by this document.
2. For a required fix, fetch the specific commit/tag into a review branch. Inspect license, diff, dependency/migration changes, provider scope changes and Temporal replay implications.
3. Prefer the narrow fix when appropriate. Do not blindly cherry-pick complex dependent commits or upgrade to moving main.
4. Run affected regression and V1 isolation/approval/dispatch gates. Update the maintenance ledger, release notes and tested versions. Keep the original baseline plus a list of applied upstream patches in the lock file.
5. Prepare a PR; merge only when authorized. A release-blocking security defect must be resolved or the affected feature disabled before release, even if broader enhancements are in V2.

## Archived automation

Original workflows are in `archive/upstream-workflows/` with `.disabled` suffixes. They cannot execute from that location. Original Copilot instructions, dependency configuration and PR template are also archived. The original instructions referenced stale toolchain/architecture assumptions; active instructions point to this project plan. The derivative PR template does not require an upstream contribution form or falsely attest that no AI was used.

Only `planning.yml` is active at setup time. Build/test CI is a Phase 0 deliverable. GitHub branch protection, Actions permissions, account-level integrations, Dependabot security settings and repository visibility require separate server-side inspection; they have not been configured by moving files.

## License and attribution

Retain the upstream AGPL-3.0 license and copyright notices. Commercial hosting is allowed subject to the license. Modified versions serving users over a network need the appropriate corresponding-source offer to those users; a public fork is one possible method, not the only formulation of that obligation. Release documentation must identify the source for the exact distributed/running version and preserve build/install instructions.

Do not claim official Postiz affiliation or rights to its trademarks. Optional services/editors/assets may have separate terms; Polotno production licensing, provider API access and third-party AI/email/storage subscriptions are not covered automatically by this project's license. A legal/branding review is a release checklist item, not a license change.
