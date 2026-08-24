# RoleProwl

RoleProwl is a truth-first, candidate-controlled workspace for discovering opportunities, evaluating fit, preparing applications, and tracking outcomes. The repository contains the RP-001 foundation and the RP-002–RP-031 closed-alpha implementation, followed by RP-031A's temporary Gemini free-tier provider for synthetic-data manual-alpha testing.

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

The current manual-alpha AI configuration is `AI_PROVIDER=gemini` with Google's `@google/genai` SDK, `gemini-3.5-flash-lite` for routine work, and `gemini-3.5-flash` only for difficult generation or eligible schema escalation. This temporary mode is strictly for the fictional fixtures under `fixtures/synthetic`; do not upload or send real candidate data. See [the Gemini integration guide](docs/integrations/gemini.md).

Apply all committed migrations to a configured development database before authenticated testing:

```bash
pnpm exec prisma migrate deploy
```

## Local personal mode

`pnpm personal:prowl` is a separate local-only, single-user job-triage command.
It reads a plaintext résumé and optional preferences from the Git-ignored
`personal/` boundary; discovers jobs through public Jobicy and Remotive APIs,
optional Adzuna credentials, and optional employer Greenhouse/Lever/Ashby
boards; then normalizes, deduplicates, filters, ranks, and tracks them locally.
It can prepare evidence-based application files and open an official application
URL, but it never fills or submits a form. Clerk, PostgreSQL, Inngest, and an AI
key are not required. Optional semantic analysis uses only a configured
localhost AI server. See [personal-mode setup](personal/README.md).

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm test:pre-alpha
pnpm test:ai:gemini
pnpm test:e2e
pnpm build
pnpm check
pnpm fixtures:generate
pnpm personal:prowl -- --help
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

## Alpha and private-beta boundaries

- Public Greenhouse and Lever listings are read-capable, but public access never grants submission authority.
- LinkedIn and Indeed remain manual external sources; RoleProwl does not automate prohibited browser behavior.
- No live authorized ATS submission adapter ships by default. External application packages stop at a validated employer/ATS URL and require explicit candidate confirmation.
- Gemini free-tier operation is synthetic-data-only, rate-limited below the configured project quota, and blocked from public production initialization by default. Quota failure never triggers an automatic OpenAI request.
- OpenAI remains available through `AI_PROVIDER=openai`; changing providers requires configuration, not a domain or database migration.
- The development filesystem storage adapter is blocked in production. A private object-storage adapter is required before deployment.
- Legal pages are visibly marked development placeholders and require qualified legal review before public launch.
- Invited private-beta admission is optional and server-enforced through `ROLEPROWL_PRIVATE_BETA_ENABLED` plus the server-only exact-email allowlist. Real candidate AI remains fail-closed unless a Preview operator explicitly enables both the provider policy and the separate private-beta real-data gate; Production remains denied. See [the private-beta readiness runbook](docs/private-beta-readiness.md).
