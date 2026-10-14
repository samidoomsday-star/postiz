# Phase 6 setup defect

## P6-001 — A second checkout could adopt the fixed Compose volumes

Severity 2; V1-REL-001; resolved by new-install project isolation.

Before: `compose.agency.yaml` named every installation `postiz-agency-dev`. A fresh checkout generated a different database password but addressed the same named PostgreSQL/Temporal volumes. Setup on a machine with a previous installation could fail authentication or mix test histories; stopping the old services did not isolate persistent state.

Fix: `configure.py` creates a random checkout-specific `COMPOSE_PROJECT_NAME` for new private configuration. Compose resolves its volume names under that project. Existing private configuration keeps its original project/default so upgrading does not abandon its data. Host ports remain fixed and the guide requires one active checkout at a time.

Regression: the Phase 6 GitHub clone started with neither `.agency` nor `node_modules`. Resolved Compose JSON showed `postiz-agency-dev_agency-postgres` / `postiz-agency-dev_agency-temporal` for the existing checkout and distinct candidate-owned names for both volumes. Values were compared programmatically without printing environment credentials. Candidate migrations/seed/build proceeded on its new database while original volumes remained present. Full independent workflow/restore evidence is recorded in phase-6.md.

No data migration or destructive cleanup was used. Keep each installation's private configuration; project isolation does not permit concurrent fixed-port listeners or regeneration of a retained database password.
