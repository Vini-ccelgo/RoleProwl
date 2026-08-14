# RoleProwl automated pre-alpha qualification

**Date:** 2026-08-13  
**Range:** RP-002 through RP-031  
**Branch:** `codex/alpha-build`  
**Result:** PASS — ready for user-led manual alpha testing after development services are configured

## Executive summary

RoleProwl now has a coherent closed-alpha implementation for authenticated candidate truth, private résumé import, explicit fact verification, canonical job discovery, explainable matching, evidence-bound résumé and application writing, application-question safety, reusable answer memory, deterministic candidate policy, auditable review, durable workflow state, honest source capabilities, application preparation/tracking, internal notifications, audit history, account export/deletion, engineering security controls, and privacy-minimized analytics.

The automated gate does not make RoleProwl production-ready. It does not validate live Clerk, PostgreSQL migration deployment, hosted Inngest, production object storage, deployment-specific CSP behavior, or a real authorized ATS relationship. It makes no real application and contacts no employer.

## RP status

| Ticket | Result | Ticket | Result | Ticket | Result |
| ------ | ------ | ------ | ------ | ------ | ------ |
| RP-002 | PASS   | RP-012 | PASS   | RP-022 | PASS   |
| RP-003 | PASS   | RP-013 | PASS   | RP-023 | PASS   |
| RP-004 | PASS   | RP-014 | PASS   | RP-024 | PASS   |
| RP-005 | PASS   | RP-015 | PASS   | RP-025 | PASS   |
| RP-006 | PASS   | RP-016 | PASS   | RP-026 | PASS   |
| RP-007 | PASS   | RP-017 | PASS   | RP-027 | PASS   |
| RP-008 | PASS   | RP-018 | PASS   | RP-028 | PASS   |
| RP-009 | PASS   | RP-019 | PASS   | RP-029 | PASS   |
| RP-010 | PASS   | RP-020 | PASS   | RP-030 | PASS   |
| RP-011 | PASS   | RP-021 | PASS   | RP-031 | PASS   |

## Working candidate journey

An authenticated candidate owns a RoleProwl account and Truth Vault. A PDF or DOCX résumé is validated, privately stored, and extracted into reviewable proposals rather than silently changing canonical facts. The candidate accepts, edits, or rejects those proposals and records search, authorization, and application-authority preferences.

Configured public job sources produce source records and canonical jobs through normalization, deduplication, and staleness handling. Matching separates qualifications, preferences, hard conflicts, gaps, and unknowns with evidence and confidence. The candidate can inspect a real job detail, record shortlist/reject state, and give match feedback.

For a selected target, résumé and application-writing operations receive bounded evidence and schema-constrained task inputs. Claim provenance and deterministic high-risk assertion checks block unsupported statements before readiness. Questions are classified before answering; sensitive data is never inferred, consequential answers require explicit fresh memory, and attestations require review.

The decision engine combines fit, policy, claims, questions, materials, source capability, and explicit authority. Review items preserve the decision snapshot and audit every resolution. Durable workflow and application records are idempotent. An authorized adapter can be invoked only after the registry and adapter capabilities agree; absent authorization, the product stops at a validated official external URL and requires explicit candidate confirmation. The tracker retains exact prepared/sent snapshots and recorded outcomes.

Dashboard, notifications, settings, audit history, export, deletion, and minimized lifecycle analytics all read owner-scoped RoleProwl data. Missing external outcomes remain unknown.

## Database

The Prisma/PostgreSQL schema contains 39 models and 25 enums. Twenty additive migrations cover accounts, candidate truth, résumé proposals/provenance, jobs/sources/matches, generated materials, answer memory, application policy/decisions/review/workflows/records, notifications, audit, deletion cleanup, shared rate limits, product events, and candidate job dispositions.

Prisma validation passed. An empty-to-current-schema migration diff generated complete PostgreSQL DDL without a schema error. Applying migrations to an actual development database remains part of external setup.

## AI system

The provider-neutral `AIProvider` boundary has a server-only OpenAI adapter plus deterministic tests. Task definitions separately cover résumé extraction assistance, requirement normalization, semantic evidence comparison, question classification, free-text application writing, résumé tailoring, and cover letters. Each operation uses a versioned instruction, bounded Zod output, per-task model selection, timeouts, retries, refusal/error separation, request correlation, and usage metadata.

Only explicit task input is serialized. Candidate content is not written to structured logs. Bounded input/output checks run before and after the provider. AI output cannot grant application authority; deterministic claim, question, policy, capability, review, and submission rules remain authoritative.

## Job sources and submission boundaries

| Source           | Discovery                                              | Application schema                | Submission                                                         | Authorization and limitation                                                             |
| ---------------- | ------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Greenhouse       | Implemented public Job Board discovery                 | Normalized from source job fields | External handoff by default; authorized adapter contract supported | Public read access is not submission authority; employer-specific permission is required |
| Lever            | Capability modeled; no live discovery adapter in alpha | Provider-neutral canonical model  | External handoff by default; authorized adapter contract supported | Employer/account-specific partner credential is required                                 |
| LinkedIn         | No automated discovery                                 | Not claimed                       | Manual external only                                               | Prohibited automation flag cannot be overridden by a generic authorization claim         |
| Indeed           | No automated discovery                                 | Not claimed                       | Manual external only                                               | Prohibited automation flag cannot be overridden by a generic authorization claim         |
| Generic external | Candidate-visible official URL                         | No provider schema assumed        | External handoff and explicit confirmation                         | HTTPS credential-free destination only; no impersonated API submission                   |

The alpha ships no live authorized ATS submission adapter. The controlled adapter in RP-031 is a fake and sends nothing externally.

## Security controls implemented

- Independent authentication and owner-scoped reads/mutations, including foreign-resource concealment.
- Same-origin, content-type, declared-size, webhook-signature, and maximum-body checks.
- Strict upload extension/MIME/signature/size validation and private randomized storage keys.
- PostgreSQL-backed hashed fixed-window limits for résumé uploads and live AI.
- Stable workflow, decision, notification, analytics, and submission idempotency keys.
- Bounded AI input/output, fail-closed schemas, claim provenance, and submission capability rechecks.
- Fixed structured-log envelope with sensitive-key redaction and truncation.
- HTTPS-only credential-free external application URLs.
- CSP, framing, MIME-sniffing, referrer, permissions, opener, and production HSTS controls.
- Validated environment bounds/provider key pairs and server-only secret imports.
- Static client-secret/raw-HTML/logging checks plus ownership and authorization regressions.
- Production and complete dependency audits with no known vulnerabilities reported on the qualification date.

These are engineering controls, not final security approval or a penetration test.

## Privacy controls

The account export is private, no-store, versioned JSON covering RoleProwl-held candidate, generated, application, audit, notification, policy, answer-memory, and product-event data. Exact typed confirmation is required for deletion. Private objects and the identity are cleaned before the user row; cleanup failures remain explicitly retryable rather than being reported as complete.

Sensitive questions use no-inference handling. Product analytics uses a closed first-party event vocabulary and per-event property allowlists; it excludes clickstream, IP/device fingerprinting, candidate prose, résumé/answer content, and provider payloads. Candidate-attributed events are exported and cascade with account deletion. RoleProwl explicitly cannot delete information already sent to an employer or ATS.

## Test and validation results

| Command                                                                                | Exact result                                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm test:pre-alpha`                                                                  | PASS — 4 files, 37 tests                                               |
| `pnpm test`                                                                            | PASS — 61 files, 283 tests                                             |
| `pnpm check`                                                                           | PASS — ESLint, strict TypeScript, Prettier check, 61 files / 283 tests |
| `pnpm test:e2e`                                                                        | PASS — 19 Chromium tests                                               |
| `pnpm build`                                                                           | PASS — Next.js 16.3 production build, 19 static pages generated        |
| `pnpm exec prisma validate`                                                            | PASS — schema valid                                                    |
| `pnpm exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` | PASS — complete PostgreSQL DDL generated                               |
| `pnpm audit --prod --audit-level high`                                                 | PASS — no known vulnerabilities found                                  |
| `pnpm audit --audit-level high`                                                        | PASS — no known vulnerabilities found                                  |

The 37 focused evaluations include the ten RP-031 journeys plus AI safety, fake-submission/failure, and security-hardening matrices. Unit, integration, repository, provider-contract, document, policy, ownership, privacy, and browser layers remain in the full suite.

## External setup still required

One consolidated, operational list is maintained in `docs/setup-required.md`. In summary: Clerk application/webhook credentials; PostgreSQL and migration deployment; private production object storage; an OpenAI project key for live AI; Inngest keys and endpoint sync for hosted workflows; legitimate per-employer ATS permission for any future live authorized adapter; storage and Clerk deletion permissions; and deployment-specific HTTPS/CSP/origin verification. Product analytics requires no third-party account.

## Known defects

No reproducible source defect remains from the automated qualification gate.

Credential-dependent authenticated browser workflows and migration deployment were not executed against live services, so they are unverified external integration areas rather than confirmed defects.

## Deferred scope

- User-led RP-032 manual alpha testing.
- Real-world job submission and live authorized ATS adapters.
- LinkedIn or Indeed browser automation.
- OCR for scanned résumés.
- Production private object-storage implementation.
- Email/SMS notifications.
- Legal review and final privacy/terms/security text.
- Penetration testing, deployment-specific CSP verification, and final security approval.
- Production deployment and operational monitoring.

## Major documentation

- `README.md` — current closed-alpha scope, setup, quality commands, and boundaries.
- `docs/architecture.md` — domain, provider, authority, privacy, security, analytics, and qualification boundaries.
- `docs/execution-log.md` — ticket-by-ticket automated gate evidence.
- `docs/setup-required.md` — single external setup list.
- `docs/automated-pre-alpha-report.md` — this consolidated stop-gate report.

## Git

The project is a Git repository. RP-002 through RP-030 are committed sequentially on `codex/alpha-build`; RP-031 is committed after the final gate. No push, merge, deployment, or remote mutation is performed by this execution plan.

## Ready for manual alpha testing?

**YES.** Configure the required development services, deploy the committed migrations to that development database, and begin user-led manual alpha testing. RP-032 has not been started.
