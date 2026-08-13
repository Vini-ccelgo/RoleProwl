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
