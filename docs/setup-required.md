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

## 2. Neon PostgreSQL

**Why needed:** RoleProwl-owned account records and all later private domain data.

**Account/action:** Create/select a Neon Preview branch and apply the committed migrations using the direct connection URL. The application continues to use ordinary PostgreSQL through Prisma.

**Environment variable:**

```text
DATABASE_URL
DATABASE_URL_UNPOOLED
```

**Without setup:** Static/public compilation works; authenticated data access cannot persist RoleProwl records.

## 3. Hosted private object storage

**Why needed:** RP-004 stores original résumé documents privately. The included filesystem adapter is deliberately restricted to non-production environments.

**Account/action:** Provision the private Backblaze B2 `roleprowl` bucket and configure the existing provider-neutral `S3ObjectStorageProvider`. Public object URLs and public-read ACLs must remain disabled. Neon remains PostgreSQL-only.

**Hosted environment variables:**

```text
ROLEPROWL_STORAGE_PROVIDER=s3
ROLEPROWL_STORAGE_BUCKET
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_ENDPOINT_URL_S3
AWS_REGION
```

**Development default:** No account is needed. Files are written with private permissions beneath `ROLEPROWL_LOCAL_STORAGE_PATH` (default: `.roleprowl-storage`) and the directory is ignored by Git.

**Without setup:** Local development and automated tests work; Preview and production initialization fail clearly rather than falling back to filesystem persistence.

The exact first-Preview sequence is in [Hosted alpha runbook](./hosted-alpha.md).

## 4. Temporary Gemini synthetic-only structured AI

**Why needed:** RP-031A temporarily uses the Gemini Developer API free tier for synthetic-data proof-of-concept testing. RP-012 and later résumé, writing, semantic-comparison, and application-assistance tasks remain schema-constrained behind the provider-neutral `AIProvider` contract.

**Account/action:** Create a Gemini Developer API key in Google AI Studio. No Vertex AI or paid Google Cloud service is required for this proof of concept. Keep the key server-side and out of source control.

**Required temporary configuration:**

```text
AI_PROVIDER=gemini
GEMINI_API_KEY=<secret>
ROLEPROWL_GEMINI_MODEL_LITE=gemini-3.5-flash-lite
ROLEPROWL_GEMINI_MODEL_FLASH=gemini-3.5-flash
ROLEPROWL_GEMINI_LITE_RPM_LIMIT=12
ROLEPROWL_GEMINI_LITE_RPD_LIMIT=450
ROLEPROWL_GEMINI_FLASH_RPM_LIMIT=4
ROLEPROWL_GEMINI_FLASH_RPD_LIMIT=15
ROLEPROWL_GEMINI_SYNTHETIC_ONLY=true
ROLEPROWL_DEPLOYMENT_ENVIRONMENT=local
```

The RoleProwl defaults leave headroom beneath the project limits reported in AI Studio: Lite 12 RPM/450 RPD beneath 15/500, and Flash 4 RPM/15 RPD beneath 5/20. These are deployment configuration, not permanent product constants. Google states that limits are project-level, can change with account/tier status, and daily limits reset on Pacific time.

**Data restriction:** While the unpaid Developer API is selected, use only `fixtures/synthetic`. Do not use real names, addresses, phone numbers, personal email addresses, résumés, work authorization, health or demographic information, sensitive answers, or other confidential candidate information. Authenticated areas display a synthetic-mode warning when this mode is active.

**Deployment safeguard:** Local synthetic testing is allowed. A preview requires `ROLEPROWL_ALLOW_SYNTHETIC_AI_PREVIEW=true`. Production initialization is blocked unless `ROLEPROWL_ALLOW_SYNTHETIC_AI_PRODUCTION=true`; do not enable that override for the free-tier proof of concept.

**OpenAI preservation:** `OPENAI_API_KEY`, `ROLEPROWL_AI_MODEL_DEFAULT`, and task-specific OpenAI model overrides remain supported. To switch back, set `AI_PROVIDER=openai` and provide the OpenAI key. A Gemini key is then unnecessary. Gemini failures and quota exhaustion never fall back to OpenAI automatically.

**Official references:** [Google Gen AI JavaScript SDK](https://googleapis.github.io/js-genai/), [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), and [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

**Optional live smoke:** `pnpm test:ai:gemini:live` makes exactly one Lite request with a fictional fixture identifier. It is never run by CI or the ordinary test commands.

**Without setup:** Unit, integration, build, and browser tests use mocked or deterministic providers and consume zero Gemini requests. Live AI tasks fail closed with a typed configuration error.

## 5. Inngest durable workflows

**Why needed:** RP-021 uses event-driven durable functions for retriable application workflow execution and run observability.

**Account/action:** Create an Inngest application, sync the deployed `/api/inngest` endpoint, and configure event/signing keys. For local development, run the Inngest Dev Server against the Next.js endpoint; cloud credentials are not needed for the deterministic workflow tests.

**Environment variables:**

```text
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
```

**Official references:** [Next.js quick start](https://www.inngest.com/docs/getting-started/nextjs-quick-start) and [idempotency guide](https://www.inngest.com/docs/guides/handling-idempotency).

**Without setup:** Application workflow requests remain durably represented in PostgreSQL but cannot be delivered to the hosted workflow executor. Unit tests use the provider-neutral contract.

## 6. Authorized ATS submission integrations

**Why needed:** RP-023 supports true API submission only when RoleProwl has a legitimate integration relationship and source-specific credential.

**Account/action:** Obtain authorization from each participating employer/ATS account and implement the corresponding `AuthorizedApplicationAdapter`. Greenhouse submission credentials belong to the employer's Job Board API configuration; Lever's application POST key must be generated by a Super Admin of the relevant Lever account. Store credentials server-side in a secret manager and explicitly enable only the corresponding source/account pair.

**Alpha default:** No authorized ATS adapter or credential is assumed. Greenhouse and Lever applications are prepared and handed off to the official hosted application URL. LinkedIn and Indeed remain manual external sources regardless of a generic feature flag.

**Official references:** [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html) and [Lever Postings API](https://github.com/lever/postings-api).

**Without setup:** Application packages remain complete and auditable in `READY`; the candidate follows the validated employer/ATS URL and explicitly confirms any external submission.

## 7. Account-deletion storage cleanup

**Why needed:** RP-028 deletes every RoleProwl-held private document referenced by an account before removing the account record.

**Account/action:** The production object-storage adapter from section 3 must implement idempotent `delete(key)` for private candidate documents and rendered résumés. The Clerk secret key must retain permission to delete the authenticated Clerk identity.

**Without setup:** Production already blocks the development filesystem storage adapter. Account deletion therefore cannot claim completion until a production private-storage adapter is configured; a failed cleanup remains explicitly `CLEANUP_REQUIRED` for operator retry.

## 8. Security deployment verification

**Why needed:** RP-029 installs application controls, but proxy/CDN behavior and the exact Clerk frontend origins exist only in the deployed environment.

**Account/action:** After deployment, verify CSP reports/browser console output across sign-up, sign-in, sign-out, OAuth if enabled, résumé upload, application export, and external-application handoff. Confirm the deployment terminates HTTPS before enabling production traffic and preserves the original request origin used by the same-origin mutation check.

**No new secret is required.** The PostgreSQL database in section 2 stores rate-limit buckets. Apply `20260814120000_add_rate_limit_buckets` with the other committed migrations.

**Without verification:** Automated builds and synthetic tests pass, but RoleProwl does not claim a completed security assessment or deployment-specific CSP compatibility.

## 9. Product analytics

**No external setup is required.** RP-030 stores its fixed, minimized product-event vocabulary in the same PostgreSQL database as the application. No third-party analytics vendor, tracking cookie, IP enrichment, device fingerprint, or client-side tracking script is configured for alpha.

Apply `20260814130000_add_product_events` with the committed migrations. Candidate-attributed events are exported and deleted with their account.
