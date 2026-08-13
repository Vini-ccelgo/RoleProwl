# RoleProwl

RoleProwl is a truth-first, candidate-controlled workspace for discovering opportunities, evaluating fit, preparing applications, and tracking outcomes. This repository currently contains the RP-001 project foundation and public homepage; product workflows are intentionally not implemented yet.

> **TEMPORARY:** Application routes are unprotected until RP-002. Do not treat them as production-ready authenticated surfaces.

## Prerequisites

- Node.js 24 LTS (`.nvmrc` is included)
- pnpm 10
- PostgreSQL when database-backed features are introduced (not needed to view RP-001)

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. External provider credentials are optional in RP-001. `DATABASE_URL` is read only when the lazy database client is requested.

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm test:e2e
pnpm build
pnpm check
```

For the first local browser test run, install Chromium with `pnpm exec playwright install chromium`. Use `pnpm test:watch`, `pnpm test:e2e:ui`, and `pnpm format` during development.

## Project structure

- `src/app` — App Router pages, layouts, and health endpoint
- `src/components` — brand, layout, navigation, marketing, and UI primitives
- `src/core` — provider-neutral contracts, types, errors, and future domain rules
- `src/features` — future application use cases
- `src/integrations` — future concrete external adapters
- `src/lib` — environment, database, logging, and shared infrastructure
- `src/config` — canonical routes and typed marketing content
- `prisma` — PostgreSQL/Prisma configuration; no premature domain models
- `e2e` — Playwright smoke coverage
- `docs` — architectural decisions

The dependency direction is UI/routes → features/use cases → core domain, with integrations implementing core contracts. See [the architecture document](docs/architecture.md).

## Environment

Copy `.env.example` to `.env.local`; never commit credentials. Variables are grouped by future provider and are not all required at startup. Prisma commands that connect or generate configuration require a valid `DATABASE_URL`.
