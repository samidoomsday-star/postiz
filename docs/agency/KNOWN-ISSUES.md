# Candidate limits and support matrix

These are limits of the local candidate, not claims of tested production support. No unresolved required-workflow, authorization, approval, data-integrity or duplicate-publication defect may be waived here. Phase reports record discovered defects and fixes.

| Area | Candidate support / limitation |
| --- | --- |
| Local OS | Debian 13 Linux x86_64 verified; supervisor requires Linux `/proc`. ARM, macOS, Windows/WSL2 and other distributions unverified. |
| Build resources | 4 CPU / 16 GiB available RAM / 20 GiB free disk recommended; measured runtime performance used aggregate 4 CPU / 8 GiB, not an install minimum guarantee. |
| Services | Local PostgreSQL, Redis, Temporal development server and Mailpit required. Digest pins in compose.agency.yaml. Local development topology has public synthetic passwords and must not be exposed. |
| Browsers | Playwright 1.58.2 / system Chromium 154 verified, desktop and 360px; Firefox, WebKit, Safari/mobile devices unverified. |
| Publication | Synthetic provider verified with real local HTTP/DB/worker services. All real social publication, approval/revocation timing and network-specific recovery unverified. See platform-matrix.csv. |
| Connections | OAuth/connect/reconnect and legacy routes remain server-disabled; do not advertise 30+ working agency integrations. TikTok inbox upload is disabled; direct-post contracts are distinct. |
| Recovery | Unsupported/ambiguous provider outcomes stay manual/UNKNOWN. Explicit safe retry is bounded to proved failed single-part targets. No universal live reconciliation. |
| Invitations | Mailpit delivery verified only; live SMTP deliverability unverified. Session max 24h, invitation max 7d; renewal requires fresh bound approval. |
| Retained features | Analytics, ordinary MCP, public API legacy keys/widgets/previews, RSS/repeats/plugs and other unsafe inherited entry paths remain denied. Original README feature list is historical marketing, not candidate support. |
| Dependencies | Phase 5 lock audit still records 257 affected advisories (10 critical / 108 high / 121 moderate / 18 low). Reachability/disabled paths and bounds are documented in HARDENING.md and evidence. Do not call the dependency graph clean or this a production security certification. |
| Backup/restore | Disposable migration and DB/private-media restores verified; production-size disaster recovery, remote object storage and hosting operations unverified. |
| Licensing/branding | AGPL retained. Source/build notice included; independent derivative, no trademark affiliation. Optional commercial integrations/Polotno are not licensed by this project and are outside supported flows. External legal review remains separate from local testing. |
| Automation | GitHub workflow committed; a local pass does not imply a hosted Actions pass. No main merge, tag, image publication or deployment authorized. |

The remaining ideas in V2-BACKLOG.md have no implementation commitment. Owner acceptance should exercise the documented manual journey and report defects with a redacted reproduction before discussing launch scope.
