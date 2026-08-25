# RoleProwl private-beta readiness runbook

## Scope and safety boundary

This runbook is for a small, explicitly invited private beta using real candidate data in a new Vercel Preview deployment. It is not authorization to deploy Production, attach a Production alias, merge `main`, publish the browser extension, or submit test applications to employers.

Real candidate data may enter RoleProwl only after the operator has deliberately configured private-beta admission, private object storage, authentication, and any provider-specific real-data policy. All real-data AI processing is denied by default.

## Required hosted configuration

Configure names only through the Vercel environment interface. Never put values in source, tickets, logs, screenshots, or this document.

Core hosted runtime:

- `ROLEPROWL_DEPLOYMENT_ENVIRONMENT=preview` — non-secret deployment classification.
- `DATABASE_URL` — secret pooled PostgreSQL connection.
- `DATABASE_URL_UNPOOLED` — secret direct PostgreSQL connection for migrations.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — public Clerk publishable identifier.
- `CLERK_SECRET_KEY` — secret.
- `CLERK_WEBHOOK_SIGNING_SECRET` — secret when Clerk webhooks are enabled.
- `INNGEST_EVENT_KEY` — secret.
- `INNGEST_SIGNING_KEY` — secret.
- `GREENHOUSE_BOARDS_JSON` — non-secret operator-selected board configuration; validate its contents before deployment.

Private storage:

- `ROLEPROWL_STORAGE_PROVIDER=s3` — non-secret provider selection.
- `ROLEPROWL_STORAGE_BUCKET` — sensitive infrastructure identifier.
- `AWS_ACCESS_KEY_ID` — secret.
- `AWS_SECRET_ACCESS_KEY` — secret.
- `AWS_ENDPOINT_URL_S3` — sensitive infrastructure endpoint; HTTPS is required when hosted.
- `AWS_REGION` — non-secret region identifier.

Private-beta admission:

- `ROLEPROWL_PRIVATE_BETA_ENABLED=true` — non-secret feature switch.
- `ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS` — sensitive, comma-separated exact Clerk account emails. Values are normalized with Unicode NFKC, whitespace trimming, and lowercase comparison. The allowlist is server-only and must not be logged.

When beta mode is disabled, authenticated access behaves as before. When enabled, a missing/empty allowlist fails closed and authenticated non-invited accounts are denied before candidate workspace data/actions are accessed.

Authentication and beta admission are separate. A non-invited account may remain signed in to Clerk on the public Home page, but RoleProwl must not load candidate workspace data there or present an available Dashboard/Workspace action. The shared `(app)` server layout and each data-bearing workspace page enforce admission for Dashboard, Onboarding, Career Profile, Jobs and job details, Queue, Applications and application details, Notifications, and Settings. Workspace server actions and APIs use the same admitted-actor boundary; navigation visibility is never the authorization control.

## AI and real candidate data

The normal résumé upload path performs PDF/DOCX text extraction and initial fact proposals locally in RoleProwl code; it does not call Gemini or OpenAI. Current fit scoring is deterministic. AI-capable structured operations elsewhere in the codebase include résumé fact extraction, job-requirement normalization, semantic evidence comparison, application-question classification, free-text application generation, résumé tailoring, and cover-letter generation.

All provider-factory requests without an explicit synthetic classification are treated as real-candidate requests and fail closed unless policy permits them.

For an explicitly authorized Gemini real-data operation in a private-beta Preview, configure all of:

- `AI_PROVIDER=gemini`
- `GEMINI_API_KEY` — secret.
- `ROLEPROWL_GEMINI_SYNTHETIC_ONLY=false`
- `ROLEPROWL_PRIVATE_BETA_REAL_DATA_AI_ENABLED=true`
- `ROLEPROWL_DEPLOYMENT_ENVIRONMENT=preview`

For an explicitly selected OpenAI private-beta provider, configure:

- `AI_PROVIDER=openai`
- `OPENAI_API_KEY` — secret.
- `ROLEPROWL_PRIVATE_BETA_REAL_DATA_AI_ENABLED=true`
- `ROLEPROWL_DEPLOYMENT_ENVIRONMENT=preview`

Provider selection is singular and explicit. Gemini failure does not fall back to OpenAI, and no paid-provider fallback is enabled.

Synthetic Preview behavior remains separate. A deliberately isolated synthetic Preview uses:

- `AI_PROVIDER=gemini`
- `ROLEPROWL_GEMINI_SYNTHETIC_ONLY=true`
- `ROLEPROWL_ALLOW_SYNTHETIC_AI_PREVIEW=true`

`ROLEPROWL_ALLOW_SYNTHETIC_AI_PREVIEW` never authorizes real candidate data. Production real-data AI remains denied even if private-beta flags are mistakenly supplied.

To disable real-data AI immediately, set `ROLEPROWL_PRIVATE_BETA_REAL_DATA_AI_ENABLED=false` and redeploy the Preview. Do not change provider selection as an implicit fallback mechanism.

## Database

Apply committed forward migrations to the intended private-beta database:

```bash
pnpm exec prisma migrate status
pnpm exec prisma migrate deploy
```

Never use `prisma migrate reset` against candidate data. RP-034 itself adds no schema migration.

## Storage lifecycle

Hosted environments require private S3-compatible storage; filesystem storage is forbidden. The expected private-beta provider is the existing private Backblaze B2 S3 configuration.

The ordinary acceptance path must verify:

- upload creates an object and owner-scoped database reference;
- owner download returns `private, no-store` content;
- a second candidate receives a concealed not-found response;
- blocked deletion does not touch the object;
- successful deletion removes the intended record/object;
- an external cleanup failure is not reported as complete;
- account deletion includes candidate document and rendered résumé object keys.

Live B2 behavior is an operator test; ordinary automated tests use mocked storage.

When testing a Preview protected by Vercel Deployment Protection or a Shareable Link, first pass Vercel protection in the browser/session used for the ownership check. A Vercel login or interception page is not a RoleProwl authorization result. Do not disable Vercel protection or modify RoleProwl authorization to compensate for that interception.

## Shared jobs and candidate-private state

Canonical `Job` and `JobSourceRecord` rows are a global discovered catalog. Invited candidates may therefore see the same active jobs, including jobs discovered while another account was in use. Do not duplicate canonical jobs per candidate merely to make the visible catalog count private.

Candidate state joined to that catalog remains owner-scoped by `userId`: dispositions such as Shortlisted or Rejected by you, fit analyses, match feedback, review items, Applications and their status/answers, and other candidate-specific workflow state. Acceptance must use two invited candidates against the same canonical job and verify that candidate B sees none of candidate A's private state.

## Clerk and beta admission

Clerk proves identity. The RoleProwl beta allowlist determines admission. Confirm that the invited email on the Clerk account exactly matches a normalized allowlist entry. Test one invited and one non-invited authenticated account. Do not place the allowlist in `NEXT_PUBLIC_*` configuration.

To stop accepting all testers without deleting their data, set `ROLEPROWL_PRIVATE_BETA_ENABLED=true` with a replacement operator-only allowlist entry and redeploy. An empty enabled allowlist is treated as configuration failure. To return to the pre-beta authentication boundary, set `ROLEPROWL_PRIVATE_BETA_ENABLED=false`; do this only as a deliberate access-policy decision.

## Inngest

Configure the event and signing keys together. Missing one of the pair is an environment validation error. Workflow events contain opaque workflow identifiers rather than résumé or application payloads.

## Greenhouse

Set `GREENHOUSE_BOARDS_JSON` to reviewed public Greenhouse board entries. Greenhouse inspection and assisted transfer preserve the existing candidate-authority boundary: preparing/capturing/transferring fields never marks an application submitted.

## RoleProwl Helper distribution

The Helper remains a Manifest V3, Greenhouse-only, explicitly initiated, temporary-packet transfer tool. It does not automatically submit, bypass CAPTCHA, access unrelated hosts, or obtain packet data directly from content-script session storage.

Current distribution is an unpacked Developer Mode extension. That is acceptable only for the operator and technically capable invited testers who receive explicit installation and removal instructions. It is not appropriate for ordinary nontechnical private-beta onboarding. A signed/published browser distribution is required before expanding the beta to ordinary users; store publication is intentionally deferred.

## Preview deployment procedure

1. Confirm the exact `codex/alpha-build` commit intended for acceptance.
2. Create a new Vercel Preview deployment; do not deploy or promote Production.
3. Confirm all required environment variable names are attached to Preview only.
4. Run `pnpm exec prisma migrate status` and `pnpm exec prisma migrate deploy` against the intended database; never reset it.
5. Keep real-data AI disabled for initial storage/auth/admission smoke tests.
6. Confirm private-beta mode and the invited allowlist.
7. Deploy Preview and verify `/api/health`, Clerk sign-in, invited admission, and non-invited denial.
8. Only after those checks, deliberately enable the real-data AI variables if the beta requires an AI-backed operation, then create a new Preview deployment.

## Private-beta smoke journey

Use a consenting invited candidate and data they are authorized to provide. Do not submit a test application to a real employer.

1. Authenticate and pass beta admission.
2. Create or update Career Profile data.
3. Upload a real PDF/DOCX résumé.
4. Review and accept selected résumé-derived facts.
5. Search configured public jobs.
6. Analyze fit and inspect evidence/unknowns.
7. Shortlist or mark a job Not pursuing.
8. Prepare an Application.
9. Confirm unresolved required and consequential answers prevent Ready.
10. Enter candidate-authorized answers explicitly and review the rebuilt packet.
11. Mark Ready only after completeness is true.
12. Use the unpacked Helper with a technically capable tester, or continue manually.
13. Confirm transfer/opening the employer site does not mark Submitted.
14. Do not actually submit the smoke-test application; separately exercise explicit confirmation only with an application the candidate genuinely submitted.
15. Record a later outcome only from candidate-supplied information.
16. Export the account and inspect the documented scope.
17. Exercise document deletion and, in a disposable invited account, the truthful account-deletion/cleanup path.

## Hosted acceptance checklist

1. Confirm the deployment commit.
2. Confirm the deployment is Preview, not Production.
3. Confirm required environment names exist without printing their values.
4. Confirm private-beta admission configuration.
5. Confirm real-data AI remains disabled until explicitly enabled.
6. After explicit enablement, perform one controlled real candidate AI operation.
7. Verify runtime logs contain no résumé, prompt, application-answer, generated-prose, allowlist, or credential payload.
8. Upload and retrieve one candidate-owned résumé.
9. Verify another candidate cannot retrieve it and receives no existence disclosure.
10. Exercise search and deterministic fit analysis.
11. Prepare one Application Packet.
12. Verify unresolved required/consequential answers block Ready.
13. Resolve them explicitly.
14. Verify Ready.
15. Verify Greenhouse Helper or manual handoff.
16. Verify transfer/opening the employer site does not mark Submitted.
17. Verify explicit submission confirmation separately and idempotently.
18. Exercise account export and inspect résumé-ingestion, facts, fit, application, event, notification, and generated-material sections.
19. Verify document deletion and account-control behavior, including cleanup-required reporting on a simulated/provider failure.
20. Inspect Vercel, Inngest, storage, and AI operational logs for unexpected errors or PII.
21. With an authenticated non-invited account, directly request Dashboard, Settings, Career Profile, and Applications; verify RoleProwl denies workspace admission while Clerk may remain signed in.
22. With invited candidates A and B, confirm a shared canonical job may appear for both but A's disposition, analysis, feedback, Application, status, and answers do not appear for B.
23. After passing Vercel Preview protection in both browser sessions, confirm A can download A's application résumé and B receives a concealed not-found response for A's exact URL.

## Rollback and disable

- Real-data AI: set `ROLEPROWL_PRIVATE_BETA_REAL_DATA_AI_ENABLED=false` and redeploy.
- Tester admission: remove the tester from `ROLEPROWL_PRIVATE_BETA_ALLOWED_EMAILS` and redeploy; do not delete their data merely to revoke access.
- All beta admission: keep beta mode enabled with an operator-only allowlist while investigating. Do not use an empty list as a routine disable mechanism.
- Deployment: roll back the Preview to the last verified commit. Do not promote it to Production.
- Provider incident: disable the affected capability. Do not silently switch AI providers or claim external deletion/submission succeeded.

Candidate data already sent to an employer or ATS is outside RoleProwl's deletion authority and must not be represented as deleted by RoleProwl.
