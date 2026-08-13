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
