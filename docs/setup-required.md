# RoleProwl setup required

This is the consolidated list of user-side configuration that cannot be created from source code. Missing services remain disabled; ordinary tests and builds use provider-neutral fakes or safe unavailable states.

## 1. Clerk authentication

**Why needed:** RP-002 sign-up, sign-in, sessions, sign-out, and authenticated application routes.

**Account/action:** Create a Clerk application, configure `/sign-in` and `/sign-up`, and add a webhook endpoint for `user.created`, `user.updated`, and `user.deleted` at `/api/webhooks/clerk`.

**Environment variables:**

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SIGNING_SECRET
```

**Where obtained:** Clerk Dashboard → API keys; webhook signing secret from Clerk Dashboard → Webhooks.

**Free tier:** Sufficient for closed-alpha development subject to Clerk's current plan limits.

**Without setup:** Public routes and builds work. Protected application routes remain closed and the sign-in/sign-up pages show an explicit configuration notice.

## 2. PostgreSQL

**Why needed:** RoleProwl-owned account records and all later private domain data.

**Account/action:** Provide a development PostgreSQL database and apply committed migrations.

**Environment variable:**

```text
DATABASE_URL
```

**Without setup:** Static/public compilation works; authenticated data access cannot persist RoleProwl records.

## 3. Production object storage

**Why needed:** RP-004 stores original résumé documents privately. The included filesystem adapter is deliberately restricted to non-production environments.

**Account/action:** Before deployment, select a private object-storage provider, create a non-public bucket, and implement/configure its `ObjectStorageProvider` adapter. Public object URLs must remain disabled.

**Development default:** No account is needed. Files are written with private permissions beneath `ROLEPROWL_LOCAL_STORAGE_PATH` (default: `.roleprowl-storage`) and the directory is ignored by Git.

**Without setup:** Local development and automated tests work; production résumé upload is intentionally blocked by configuration.

## 4. OpenAI structured AI

**Why needed:** RP-012 and later résumé, writing, semantic-comparison, and application-assistance tasks use schema-constrained server-side generation.

**Account/action:** Create an OpenAI API project and a restricted server-side API key. Keep the key out of browsers and source control. Set project spending and rate limits appropriate for a closed alpha.

**Required environment variable:**

```text
OPENAI_API_KEY
```

**Optional controls:** `ROLEPROWL_AI_MODEL_DEFAULT`, task-specific `ROLEPROWL_AI_MODEL_*` overrides listed in `.env.example`, `ROLEPROWL_AI_TIMEOUT_MS`, and `ROLEPROWL_AI_MAX_RETRIES`. The source default is `gpt-5.6-luna`; model access and current pricing depend on the configured API project.

**Official references:** [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

**Without setup:** Unit, integration, build, and browser tests use deterministic test doubles. Live AI tasks fail closed with a typed configuration error.
