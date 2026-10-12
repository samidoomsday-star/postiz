# Development runbook — planning-stage facts

**Application runtime is not prepared yet. Phase 0 owns installation, service startup, smoke testing and executable local/CI instructions.** This file deliberately distinguishes verified planning commands from upstream commands awaiting validation.

## Verified now

```sh
git clone https://github.com/samidoomsday-star/postiz.git
cd postiz
python3 scripts/agency/plan.py check
python3 scripts/agency/plan.py next
```

The first clone command requires GitHub publication to have completed; see SETUP evidence for actual push/clone results. The checker requires only Python 3.10+ and Git for baseline verification, not Node dependencies or services. It does not build the application.

## Upstream facts to validate in Phase 0

- Root package requires Node `>=22.12.0 <23.0.0`; packageManager is `pnpm@10.6.1`. Volta currently says Node 20.17.0; the cloud machine currently has Node 24.19.0. Resolve this mismatch rather than ignoring engine requirements. Pin a verified supported Node 22 patch in the development tooling.
- Root scripts include `pnpm install --frozen-lockfile`, `pnpm run prisma-generate`, `pnpm run build` and `pnpm run dev`. Install triggers code generation. Check whether optional packages, network access and native dependencies need supported prerequisites.
- Required runtime families: backend, frontend, orchestrator, PostgreSQL, Redis, Temporal and media storage. Development Compose also contains admin UIs and Elasticsearch/Temporal backing services; determine the smallest valid stack instead of starting unrelated services by default.
- The upstream Compose/.env examples have database names/credentials that must be reconciled for local use. Example secrets are examples, not production credentials. Use ignored .env files, synthetic credentials generated locally and loopback service bindings for development.
- `prisma-db-push`/`prisma-reset` are upstream scripts, not migration recommendations. Do not invoke destructive commands on user data.
- Root Jest configuration imports `@nx/jest`; verify that dependencies and discovery work. The presence of a test script is not evidence of a functioning suite.
- Upstream main research identified possible optional MCP/AI startup coupling. Reproduce on this release before deciding whether a narrow V1-enabling correction is needed.

## Required Phase 0 deliverables

Replace this provisional section with tested commands for install, code generation, initial disposable DB setup, versioned migrations, service start/stop, readiness checks, fixtures, builds, unit/integration/browser smoke, and safe cleanup. Document tool versions, working directories, ports, resource requirements, required vs optional variables and the actual supported operating-system profile.

Provide a local mail sink and provider test mode that cannot publish externally. Check that a worker consumes an actual synthetic task and persists a receipt; an HTTP health endpoint alone is insufficient. Keep diagnostic output redacted. Add executable scripts/Compose overrides only after verifying them.

When services are actually prepared in the cloud, save complete tested install/start instructions through the environment configuration tools. Processes do not persist between environments. Preserve unknown network allowlists; add required destinations only from evidence. Never put credentials into saved scripts. Do not claim environment publication or future-machine readiness from a draft save.

## Final local handoff

Phase 6 must deliver both a code-development quickstart and a repeatable local demo/test path, ideally Docker Compose where supported by the validated architecture. Images must be built from the derivative candidate or pinned to its exact digest, not pull an upstream image that omits the enhancements. State the actually tested OS/architecture (Linux first unless evidence supports more), hardware and limitations; no unsupported Windows/macOS claims.
