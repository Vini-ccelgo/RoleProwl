# RoleProwl hosted alpha runbook

This runbook prepares the `codex/alpha-build` branch for its first Vercel Preview. It does not create a production deployment. Use synthetic candidate data only while the Gemini free-tier configuration below is active.

## A. Neon

1. Create or select the Neon PostgreSQL project for RoleProwl. Object storage is not provisioned through Neon.
2. From the repository root, authenticate, link the project, and create or select the Preview branch:

   ```bash
   pnpm dlx neon@latest auth
   pnpm dlx neon@latest link
   pnpm dlx neon@latest checkout roleprowl-alpha
   pnpm dlx neon@latest config plan
   pnpm dlx neon@latest deploy
   ```

   The committed `neon.ts` retains only the database branch policy and gives newly created non-default branches a seven-day TTL.

3. Confirm that Neon wrote the selected branch's variables to `.env.local`. The application uses the pooled `DATABASE_URL` at runtime and `DATABASE_URL_UNPOOLED` for Prisma migration commands.
4. Configure the database variables in Vercel using the values issued for this Neon branch:

   ```text
   DATABASE_URL
   DATABASE_URL_UNPOOLED
   ```

5. Apply the committed migrations manually before the first Preview deployment:

   ```bash
   pnpm exec prisma validate
   pnpm exec prisma migrate deploy
   pnpm exec prisma migrate status
   ```

   `prisma.config.ts` selects `DATABASE_URL_UNPOOLED` for migrations when present. Do not run `migrate reset` against the hosted branch.

6. In Backblaze B2, create a private bucket named `roleprowl` in `us-east-005`. Configure its server-only S3-compatible credentials in Vercel Preview:

   ```text
   ROLEPROWL_STORAGE_PROVIDER=s3
   ROLEPROWL_STORAGE_BUCKET=roleprowl
   AWS_ENDPOINT_URL_S3=https://s3.us-east-005.backblazeb2.com
   AWS_REGION=us-east-005
   AWS_ACCESS_KEY_ID
   AWS_SECRET_ACCESS_KEY
   ```

   Never prefix a storage variable with `NEXT_PUBLIC_`, enable public-read access, or expose a permanent object URL. Redeploy Preview after changing any environment variable because existing deployments retain their original environment snapshot.

## B. Vercel Preview

1. Import or link the RoleProwl Git repository in Vercel. Keep the production branch unchanged and deploy `codex/alpha-build` as a Preview only.
2. Select Node.js 24 for the project.
3. Add every variable in the Preview environment list below to Vercel's **Preview** scope. Do not place secret values in source control.
4. If Deployment Protection is enabled, create an Automation Bypass secret and set the same value as `VERCEL_AUTOMATION_BYPASS_SECRET` in the environment used to run hosted tests. This secret is optional when the Preview is publicly reachable.
5. Link and deploy from the repository root:

   ```bash
   pnpm dlx vercel@latest link
   pnpm dlx vercel@latest env pull .env.local --environment=preview
   pnpm alpha:doctor
   pnpm dlx vercel@latest deploy
   ```

   Do not use `--prod`.

### Preview environment variables

```text
ROLEPROWL_DEPLOYMENT_ENVIRONMENT=preview
DATABASE_URL
DATABASE_URL_UNPOOLED
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SIGNING_SECRET
ROLEPROWL_STORAGE_PROVIDER=s3
ROLEPROWL_STORAGE_BUCKET=roleprowl
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_ENDPOINT_URL_S3
AWS_REGION
AI_PROVIDER=gemini
GEMINI_API_KEY
ROLEPROWL_GEMINI_MODEL_LITE=gemini-3.5-flash-lite
ROLEPROWL_GEMINI_MODEL_FLASH=gemini-3.5-flash
ROLEPROWL_GEMINI_LITE_RPM_LIMIT=12
ROLEPROWL_GEMINI_LITE_RPD_LIMIT=450
ROLEPROWL_GEMINI_FLASH_RPM_LIMIT=4
ROLEPROWL_GEMINI_FLASH_RPD_LIMIT=15
ROLEPROWL_GEMINI_SYNTHETIC_ONLY=true
ROLEPROWL_ALLOW_SYNTHETIC_AI_PREVIEW=true
ROLEPROWL_ALLOW_SYNTHETIC_AI_PRODUCTION=false
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
```

`VERCEL_AUTOMATION_BYPASS_SECRET` is required only in the local/test environment making protected Preview requests. Do not expose it to browser code.

## C. Clerk

1. Use a Clerk development instance for this synthetic Preview.
2. Configure the Clerk application URLs for `https://<preview-host>`.
3. Add this webhook endpoint in Clerk:

   ```text
   https://<preview-host>/api/webhooks/clerk
   ```

4. Subscribe to exactly:

   ```text
   user.created
   user.updated
   user.deleted
   ```

5. Copy the endpoint signing secret into Vercel Preview as `CLERK_WEBHOOK_SIGNING_SECRET`, then redeploy.
6. If Vercel Deployment Protection prevents Clerk from reaching the endpoint, configure a Vercel protection bypass for the webhook before testing delivery. The route itself is intentionally public but verifies every request cryptographically.

## D. Inngest

1. Create the RoleProwl application/environment in Inngest or install Inngest's Vercel integration.
2. Configure the serving URL as:

   ```text
   https://<preview-host>/api/inngest
   ```

3. Put the issued `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in Vercel's Preview environment, then redeploy so Inngest can sync the functions.
4. If Vercel Deployment Protection is enabled, configure its automation bypass secret in the Inngest Vercel integration. Otherwise function synchronization and invocation will be rejected before reaching `/api/inngest`.

The existing route exports `GET`, `POST`, and `PUT` through `serve({ client, functions })`; no custom runtime or duration override is required for the current bounded alpha workflows.

## E. Gemini

Use the exact Preview posture shown in section B:

```text
AI_PROVIDER=gemini
GEMINI_API_KEY
ROLEPROWL_GEMINI_SYNTHETIC_ONLY=true
ROLEPROWL_ALLOW_SYNTHETIC_AI_PREVIEW=true
ROLEPROWL_ALLOW_SYNTHETIC_AI_PRODUCTION=false
```

This permits Gemini only for explicitly synthetic Preview operations. It does not enable paid OpenAI fallback and does not weaken Personal Mode or production safeguards.

## F. Validation

Run these commands in order after the Preview environment is present in `.env.local`:

```bash
pnpm exec prisma validate
pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
pnpm alpha:doctor
pnpm dlx vercel@latest deploy
ROLEPROWL_TEST_BASE_URL=https://<preview-host> pnpm test:e2e:hosted
```

For a protected Preview, also provide the bypass secret to the hosted-smoke process:

```bash
ROLEPROWL_TEST_BASE_URL=https://<preview-host> VERCEL_AUTOMATION_BYPASS_SECRET=<secret> pnpm test:e2e:hosted
```

The hosted smoke test is read-only: it checks the homepage, health response, security headers, authentication entry/redirect behavior, and Inngest endpoint reachability. It does not create users, applications, or employer submissions.

## Official references

- [Neon configuration as code](https://neon.com/blog/introducing-neon-ts)
- [Backblaze B2 S3-compatible API](https://www.backblaze.com/docs/cloud-storage-use-the-aws-sdk-for-javascript-v3-with-backblaze-b2)
- [Vercel environment-variable deployment behavior](https://vercel.com/docs/environment-variables)
- [Prisma `migrate deploy`](https://www.prisma.io/docs/cli/migrate/deploy)
- [Vercel CLI deployments](https://vercel.com/docs/projects/deploy-from-cli)
- [Vercel Automation Bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)
- [Clerk webhook synchronization](https://clerk.com/docs/guides/development/webhooks/syncing)
- [Inngest on Vercel](https://www.inngest.com/docs/deploy/vercel)
