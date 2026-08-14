# RoleProwl

RoleProwl is a truth-first, candidate-controlled workspace for discovering opportunities, evaluating fit, preparing applications, and tracking outcomes. The repository contains the RP-001 foundation and the RP-002–RP-031 closed-alpha implementation: authenticated candidate data, résumé import and verification, job ingestion and matching, evidence-bound generation, policy and review controls, durable application records, privacy controls, security hardening, minimized product analytics, and synthetic pre-alpha qualification.

Application routes are protected by the RP-002 authentication boundary. Clerk and PostgreSQL credentials are required to enter the authenticated workspace; without them, the routes remain closed and the public authentication pages report the missing setup.

## Prerequisites

- Node.js 24 LTS (`.nvmrc` is included)
- pnpm 10
- PostgreSQL 15+ for authenticated product workflows (not needed for the public site or deterministic test suite)

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. The public site and deterministic tests require no provider credentials. Authenticated workflows require Clerk and PostgreSQL; live AI and durable hosted workflows require their corresponding setup. See [setup required](docs/setup-required.md) for the complete capability-by-capability list.

Apply all committed migrations to a configured development database before authenticated testing:

```bash
pnpm exec prisma migrate deploy
```

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm test:pre-alpha
pnpm test:e2e
pnpm build
pnpm check
```

For the first local browser test run, install Chromium with `pnpm exec playwright install chromium`. Use `pnpm test:watch`, `pnpm test:e2e:ui`, and `pnpm format` during development.

## Project structure

- `src/app` — App Router pages, layouts, and health endpoint
- `src/components` — brand, layout, candidate, application, marketing, and UI primitives
- `src/core` — provider-neutral contracts, types, errors, capabilities, and deterministic domain rules
- `src/features` — provider-neutral use cases and workflow coordination
- `src/integrations` — concrete PostgreSQL, Clerk, OpenAI, Inngest, storage, and job-source adapters
- `src/lib` — environment, database, logging, and shared infrastructure
- `src/config` — canonical routes and typed marketing content
- `src/evals` — safety matrices and the ten-journey synthetic pre-alpha suite
- `prisma` — PostgreSQL/Prisma schema and additive migrations
- `e2e` — public, protected-route, responsive, health, and security-header smoke coverage
- `docs` — architecture, setup, execution evidence, and qualification reports

The dependency direction is UI/routes → features/use cases → core domain, with integrations implementing core contracts. See [the architecture document](docs/architecture.md).

## Environment

Copy `.env.example` to `.env.local`; never commit credentials. Variables are grouped by capability and are not all required at startup. Missing integrations fail closed or remain explicitly unavailable. Prisma validation and generation do not require a live database; migration deployment and authenticated persistence do.

## Alpha boundaries

- Public Greenhouse and Lever listings are read-capable, but public access never grants submission authority.
- LinkedIn and Indeed remain manual external sources; RoleProwl does not automate prohibited browser behavior.
- No live authorized ATS submission adapter ships by default. External application packages stop at a validated employer/ATS URL and require explicit candidate confirmation.
- The development filesystem storage adapter is blocked in production. A private object-storage adapter is required before deployment.
- Legal pages are visibly marked development placeholders and require qualified legal review before public launch.
