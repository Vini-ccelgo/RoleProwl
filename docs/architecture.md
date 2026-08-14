# RoleProwl architecture

## Dependency direction

```text
UI / App Router → Features / Use Cases → Core Domain
                         ↑                 ↑
                         └── Infrastructure / Integrations
```

`src/core` owns provider-neutral types, errors, invariants, and contracts. It must not import Next.js or concrete SDKs. `src/features` will coordinate use cases through those contracts. `src/integrations` will contain concrete adapters for AI, authentication, job sources, application systems, object storage, and durable workflows. App Router files compose UI and invoke features; they do not make scattered provider calls or own business policy.

## Provider and authority boundaries

Provider-specific response objects stop at their adapter. The OpenAI adapter implements `AIProvider` using the official SDK, but domain logic receives validated RoleProwl types only.

Each allowed AI task owns a distinct versioned instruction, Zod schema, and optional model override. The production adapter uses Responses API structured parsing, validates parsed values again at the boundary, detects refusals separately from malformed output, and returns correlation, provider-request, and token metadata. Only explicitly constructed task input is serialized. Logs contain operational metadata but exclude prompts, inputs, outputs, names, emails, and résumé content. Deterministic tests use a provider double and require no live API access.

An LLM adapter cannot decide application authority. Models are probabilistic content-processing tools; candidate consent, factual constraints, review requirements, and permission to submit are deterministic business policy. Those rules belong in the core/policy feature boundary and are enforced before an application adapter is invoked.

## Routes and shells

The marketing shell owns `/`, `/privacy`, `/terms`, and `/security`. Legal routes visibly contain development placeholders. The application shell owns `/dashboard`, `/onboarding`, `/profile`, `/jobs`, `/queue`, `/applications`, and `/settings`. All navigation derives from `src/config/routes.ts`.

Application routes are protected in RP-002 at the server layout/resource boundary. Clerk is the initial adapter, while `User` records retain a RoleProwl-owned ID keyed to the provider identity. When Clerk is not configured, protected routes remain closed; no replacement development session is invented.

Identity webhooks are signature-verified and provide eventual synchronization. Authenticated requests also resolve the active external identity to an internal account, preventing the domain from treating the Clerk user object as its user model.

## Candidate Truth Vault

RP-003 stores candidate facts in user-owned tables with explicit `VerificationState` and `FactSource` values. User-entered data begins unverified. Extracted résumé data will enter through proposal records in RP-004 rather than writing directly to canonical tables. Every read and mutation derives `userId` from the authenticated actor and scopes record identifiers by that owner; foreign and missing records produce the same not-found behavior.

Skills use a canonical normalized name per user while preserving display spelling and distinct technical identifiers such as `C`, `C++`, Java, and JavaScript. Work authorization and sponsorship are explicit records, never computed from other profile fields.

## Source adapter strategy

Each future job/application source implements a narrow contract and advertises a `SourceCapabilitySet`. Use cases check capabilities rather than provider names. This lets RoleProwl distinguish read-only sources, schema-aware sources, supported submission paths, partner authentication, and required user interaction without placing ATS-specific branches throughout the app.

Canonical jobs are separate from `JobSourceRecord`. A canonical opportunity may retain multiple source associations without discarding raw source payloads or pretending source-specific identifiers are global. Nullable scalar/JSON fields preserve the difference between “not specified” and explicit false, zero, or empty values. Content hashes track material revisions while first-seen, last-seen, last-verified, expiry, and status timestamps support refresh and staleness policy.

The RP-007 adapter lifecycle is `discover → fetch/refresh → normalize`, with capabilities checked before use. Multi-source orchestration settles each source independently and reports sanitized health events to durable `JobSourceHealth`; one rejected source promise is returned as a scoped failure while healthy-source jobs continue through the feed.

## Résumé import boundary

RP-004 accepts only signature-checked, size-limited PDF and DOCX uploads. The original bytes are stored behind `ObjectStorageProvider` under a randomized private key; the API exposes document metadata, never a public object URL. `unpdf` handles machine-readable PDF text and Mammoth handles DOCX raw text. Encrypted, malformed, scanned, or text-empty documents produce the explicit `EXTRACTION_UNSUPPORTED` state because OCR is outside the alpha scope.

Extracted text and source-line locations live in `DocumentExtraction` and `CandidateFactProposal`. Import is deliberately one-way into pending proposals: it cannot mutate `CandidateProfile`, `WorkExperience`, `Education`, `Skill`, or other canonical Truth Vault models. RP-005 owns the separate accept/edit/reject transition. The filesystem storage adapter uses owner-only file permissions and is development-only; production must provide durable private object storage.

## Database

Prisma 7 targets PostgreSQL via `prisma.config.ts`. The generated client has an explicit output directory, and `src/lib/db/client.ts` creates a server-only, lazy singleton using the PostgreSQL driver adapter. No candidate, job, or application schema is created in RP-001.

## Verification and claim provenance

RP-005 separates extracted proposals, user decisions, verified canonical facts, generated claims, and claim evidence. Accepting or editing a pending proposal transactionally creates a `CandidateFact` and records the canonical identifier on the proposal. Rejecting changes only the proposal status, so provenance history remains without influencing the candidate. Reviewed proposals cannot be decided twice and foreign identifiers remain concealed.

Every generated claim carries a classification, generator identity, prompt version, structured assertions, and immutable evidence snapshots. Deterministic policy checks high-risk atoms such as employer names, credentials, durations, management scope, and numeric achievements against owned evidence. `UNSUPPORTED` and evidence-free claims are categorically ineligible for application readiness.

## Matching

Matching v1 is deterministic and evidence-bearing. It evaluates hard constraints first, then qualification signals, then candidate preferences as a separate score. Exact normalized skill identities prevent substring matches such as Java/JavaScript, C/C++, React/React Native, and SQL/PostgreSQL. Duration and proficiency are evaluated only when explicit evidence exists. Unknown candidate or job data lowers confidence and appears as an unknown; it is never silently converted into false, zero, or a gap. Hard conflicts cap overall fit regardless of other scores.

## Tailored résumé pipeline

RP-013 selects a bounded subset of candidate evidence using deterministic target-job overlap, then sends only that evidence and target job to the dedicated structured AI task. A generated résumé cannot be rendered unless every non-empty headline, summary, and bullet has a matching claim; every claim cites known input evidence; and the RP-005 deterministic assertion policy accepts high-risk employer, credential, duration, management, and numeric atoms. Unsupported or unknown-evidence claims fail the entire operation before storage.

Accepted content and its immutable claim/evidence graph are stored in `ResumeVersion`, versioned by prompt and document template. The server-side DOCX renderer is intentionally plain and replaceable. Rendered files use private randomized storage keys while user-facing filenames are sanitized from the target role and company.

## Application writing

RP-014 routes cover letters and shorter application responses through separate RP-012 tasks. Inputs are limited to target-job context, candidate preferences, and explicitly selected evidence. The output schema bounds prose length; deterministic policy then requires each declared candidate claim to occur in the content, resolve only to supplied evidence, and pass the same high-risk assertion validator used for résumés. A targeted rule also rejects fabricated statements of long-standing personal attachment to the employer. Accepted artifacts and their claim graph are persisted independently of application state.

## Question classification

RP-015 classifies application questions before selecting an answer path. Ordered deterministic rules own attestations, sensitive demographic/health data, work authorization and other consequential fields, candidate policies, computable facts, profile facts, and common role narratives. Safety categories are resolved without invoking AI and therefore cannot be downgraded by a model. Only unmatched questions may use the schema-constrained classifier task; without a provider they remain explicitly `UNKNOWN`.

## Answer memory

RP-016 maps semantically equivalent application wording to a bounded set of canonical concepts; it does not use exact-question equality as identity. Each user-owned memory retains structured answer data, its source, verification timestamp, explicit auto-answer permission, example wording, and a concept-specific re-verification interval. Freshness is deterministic. An expired or permission-disabled memory remains available for review but cannot auto-answer.

## Answer authority

RP-017 is a pure deterministic boundary after classification. Sensitive questions always use `NO_INFERENCE` and require review, even if an answer exists. Consequential questions auto-answer only from a fresh memory explicitly sourced as consequential. Attestations always require direct user review. Unknown questions fail closed, narrative questions may only prepare a draft, and ordinary canonical answers must be fresh and explicitly auto-answerable.

## Candidate application policy

RP-018 stores candidate-defined authority separately from preferences and evaluates it as a pure versioned function. Hard exclusions reject; unknown salary, location, role, work mode, or employment type require review rather than being treated as false. Sensitive questions, unsupported claims, daily limits, source submission capability, and explicit submission authorization are evaluated before autonomy. `ELIGIBLE_FOR_SUBMISSION` is only a policy result and does not execute an application.

## Review queue and audit

RP-019 persists an owner-scoped snapshot of every input a candidate needs to review: reason codes, job, fit, materials, unresolved questions, policy result, and source capability. Queue mutations are explicit state transitions. Approved/rejected items are terminal, defer dates must be future dates, and optimistic status matching prevents concurrent overwrite. Creation, edits, approval, rejection, and deferral produce audit events with actor, action, before/after snapshots, optional note, and timestamp.

## Application decisions

RP-020 is the single combined decision boundary. It receives job, fit, policy, claim counts, question dispositions, source capability, materials, and explicit submission authorization. Inputs are canonicalized and SHA-256 hashed; the complete snapshot, policy/decision versions, result, and reason codes are persisted under an idempotent uniqueness key. Hard rejection retains priority. Any non-answered question becomes review work, while unsupported claims, missing source capability, or missing authorization can never produce eligibility. A review decision and its initial audit event are created in the same database transaction.

## Durable workflows

RP-021 retains durable application state in PostgreSQL and uses `WorkflowProvider` as the feature boundary. A stable user/decision idempotency key protects database creation and is also sent as the Inngest event ID; the Inngest function adds consumer-side idempotency keyed to the workflow run. Named steps make start, decision validation, and outcome persistence independently retriable/observable. Terminal states are immutable, attempts and sanitized failures are durable, and exhausted retries become `FAILED_FINAL` instead of disappearing.

## Integration capability registry

RP-022 centralizes source permissions in one typed registry. Greenhouse and Lever public listings advertise read access and partner-auth requirements, but never submission without explicit legitimate authorization. LinkedIn and Indeed are permanently represented as prohibited automation/manual-external sources in the alpha, so a configuration flag cannot accidentally enable them. Business decisions receive their capability input through a registry resolver rather than provider-name conditionals.

## Application submission boundary

RP-023 makes application adapters a discriminated union. Only an `AUTHORIZED_API` adapter exposes `submit` and `verifySubmission`; external/manual adapters can resolve a destination but cannot impersonate an API submission path. Execution rechecks the resolved registry capability, exact source identity, and advertised `SUBMIT_APPLICATION` capability before invoking an adapter.

Every attempt first persists an immutable payload snapshot containing the exact résumé reference, private document references, generated text, and answers. External/manual paths stop at `READY` with a validated HTTPS employer/ATS destination. They reach `SUBMITTED` only through explicit candidate confirmation. Authorized adapters must return and verify a receipt. Application and event records retain the mechanism and state change so RP-024 can answer what was prepared and sent.

## Application tracker

RP-024 exposes owner-scoped `/applications` and `/applications/[applicationId]` views over the durable application record. The detail route shows job identity, fit/policy snapshots, exact generated text and answers, document metadata, exact résumé version, submission mechanism/receipt, timestamps, and ordered history. Private storage keys and credential-shaped fields are excluded from rendering even when retained server-side.

Application state changes use a deterministic transition graph and an optimistic owner-and-prior-state update. Every successful transition appends an actor-attributed event in the same transaction. The UI offers only currently valid candidate outcome transitions. External-ready applications include the RP-023 explicit-confirmation flow; missing integration status is rendered as unknown instead of inferred.

## Operational dashboard

RP-025 replaces the authenticated dashboard placeholder with owner-scoped database queries. Counts are computed from active match analyses, the candidate's configured high-fit threshold, prepared/application states, unresolved review items, and recorded outcomes. Top matches and recent application events are likewise live records. Empty states direct the candidate to the next relevant product surface; the dashboard has no fixture counts, fabricated activity, or unsupported conversion claims.

## Internal notifications

RP-026 uses a provider-neutral `NotificationProvider` with PostgreSQL as the alpha delivery channel. Notifications are owner-scoped, bounded, deduplicated by user and causal event, and support read/unread state. Review creation, unresolved questions, exhausted workflow retries, confirmed submissions, and explicit job-unavailable transitions generate durable notifications at their existing transaction or use-case boundary. The authenticated shell displays an unread count and `/notifications` is the inbox. No email address, phone number, external messaging vendor, or behavioral tracking is required.

## Consequential audit history

RP-027 adds a separate append-only audit stream for candidate fact verification/change, policy changes, application generation and submission, blocked claims, answered questions, approvals, failures, state changes, and future export/deletion requests. A per-action metadata allowlist strips unknown keys and nested content before persistence; audit records contain actor, action, entity reference, timestamp, and only bounded scalar/array metadata. They never copy candidate answers, generated prose, résumé content, tokens, or credentials. User-attributed events are visible in Settings; deletion policy is defined in RP-028.

## Account export and deletion

RP-028 provides a no-store JSON export of RoleProwl-held profile, experience, education, skills, preferences, answer memory, policy, application history, generated material, notifications, and safe audit history. The envelope is versioned and explicitly excludes information independently retained by employers or ATS providers.

Deletion requires the exact typed confirmation. A recovery/cleanup request first captures only a one-way subject hash, private storage keys, and the external identity needed for cleanup. Private objects and the Clerk identity are removed before the RoleProwl `User` row; its cascading relations remove candidate, generated, application, notification, and user-owned audit data. On full completion, the cleanup record discards the external identity and storage keys. Any cleanup error retains a minimal `CLEANUP_REQUIRED` record so failure is observable rather than falsely reported as deletion. RoleProwl does not claim authority to delete data already transmitted to an employer or ATS.

## Engineering security controls

RP-029 adds controls but is not a security certification. Resource handlers authenticate independently and scope object identifiers to the authenticated RoleProwl user. Cookie-authenticated mutation handlers reject cross-origin browser requests, validate their media type and declared size, and return sanitized errors. Clerk webhook requests remain outside the CSRF rule because they are independently signature-verified; their type and maximum size are still checked. React rendering is used without raw HTML injection, and externally rendered application links must be credential-free HTTPS URLs.

Expensive résumé uploads and live AI calls consume owner-keyed fixed-window quotas stored in PostgreSQL under a one-way bucket key. Serializable transactions prevent separate server instances from independently granting the same quota. Live AI input is JSON-serialized and size-checked before provider invocation, its application-controlled metadata is bounded, and task output schemas have bounded text and collection sizes. Workflow and submission idempotency remain enforced by stable unique keys and durable terminal states.

Structured logs use a fixed envelope, redact credential/content-shaped keys, and truncate remaining strings. Browser responses receive CSP, frame, MIME-sniffing, referrer, permissions, and opener protections; HSTS and insecure-request upgrading are production-only. Server environment parsing validates provider key pairs and bounded AI controls, while secret-reading modules use `server-only`. The CI dependency gate audits production packages at high severity. RP-029 remediated the resulting dependency findings by upgrading Prisma to 7.9.1 and selecting patched Hono and Lodash versions through explicit pnpm overrides.
