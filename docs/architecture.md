# RoleProwl architecture

## Dependency direction

```text
UI / App Router → Features / Use Cases → Core Domain
                         ↑                 ↑
                         └── Infrastructure / Integrations
```

`src/core` owns provider-neutral types, errors, invariants, and contracts. It must not import Next.js or concrete SDKs. `src/features` will coordinate use cases through those contracts. `src/integrations` will contain concrete adapters for AI, authentication, job sources, application systems, object storage, and durable workflows. App Router files compose UI and invoke features; they do not make scattered provider calls or own business policy.

## Provider and authority boundaries

Provider-specific response objects stop at their adapter. The planned OpenAI adapter will implement `AIProvider` using the official SDK, but domain logic will receive validated RoleProwl types only.

An LLM adapter cannot decide application authority. Models are probabilistic content-processing tools; candidate consent, factual constraints, review requirements, and permission to submit are deterministic business policy. Those rules belong in the core/policy feature boundary and are enforced before an application adapter is invoked.

## Routes and shells

The marketing shell owns `/`, `/privacy`, `/terms`, and `/security`. Legal routes visibly contain development placeholders. The application shell owns `/dashboard`, `/onboarding`, `/profile`, `/jobs`, `/queue`, `/applications`, and `/settings`. All navigation derives from `src/config/routes.ts`.

Application routes are protected in RP-002 at the server layout/resource boundary. Clerk is the initial adapter, while `User` records retain a RoleProwl-owned ID keyed to the provider identity. When Clerk is not configured, protected routes remain closed; no replacement development session is invented.

Identity webhooks are signature-verified and provide eventual synchronization. Authenticated requests also resolve the active external identity to an internal account, preventing the domain from treating the Clerk user object as its user model.

## Source adapter strategy

Each future job/application source implements a narrow contract and advertises a `SourceCapabilitySet`. Use cases check capabilities rather than provider names. This lets RoleProwl distinguish read-only sources, schema-aware sources, supported submission paths, partner authentication, and required user interaction without placing ATS-specific branches throughout the app.

## Database

Prisma 7 targets PostgreSQL via `prisma.config.ts`. The generated client has an explicit output directory, and `src/lib/db/client.ts` creates a server-only, lazy singleton using the PostgreSQL driver adapter. No candidate, job, or application schema is created in RP-001.
