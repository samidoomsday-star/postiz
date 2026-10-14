# Phase 6 — Local release candidate and handoff

Status: in_progress
Started (UTC): 2026-10-14
Base: phase/5-hardening, e532700067bb23013754df05eadb9cfa5c2c9278; Phase 5 draft PR #6 and preceding PRs remain unmerged.
Candidate branch: release/agency-v1-rc1

## Scope

V1-REL-001 / T06-01–03 only. Assemble all completed phases, isolate fresh installation volumes, document prerequisites and owner testing, verify an independent GitHub clone, migration/restore/restart and publish a reviewable branch. No V2, main merge, tag, image publication, live accounts or deployment.

## Completed work

New-install Compose project isolation (existing configurations preserved), Linux prerequisite checks, complete verify.sh, local tester guide, support/known issues, source notice and release notes.

## Check evidence

Pending actual independent clone and checks. No Phase 6 runtime gate is claimed passed yet.

## Defects and fixes

Fixed-project volumes could accidentally be reused by a new checkout; new private configurations now generate a distinct project name. Fixed host ports still permit one active checkout at a time, explicitly documented.

## Review / migration / limitations

No application schema or workflow change. Prior provider/dependency restrictions remain; see HARDENING.md, platform-matrix.csv and KNOWN-ISSUES.md. Runtime testing pending.

## Resume

Push candidate implementation, clone independently with no copied configuration/dependencies, execute the guide, investigate failures, record actual results and finish delivery.
