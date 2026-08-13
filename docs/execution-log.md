# RoleProwl alpha execution log

This log records automated implementation gates for RP-002 through RP-031. It does not replace test results or migrations.

## Phase A — Identity and candidate truth

### RP-002 — Authentication and user accounts

- **Status:** Pass
- **Major implementation:** Clerk boundary, server-side application-route protection, RoleProwl-owned user identity mapping, sign-in/sign-up UI, safe redirects, signed-in navigation, verified identity webhook.
- **Tests:** Account identity stability, authenticated fixture access, invalid session rejection, ownership concealment, configuration completeness, route classification, safe redirects, webhook email mapping, and 16 browser tests covering public/protected behavior.
- **Migration:** `20260813090000_add_user_accounts`
- **Known limitations:** Live Clerk flows require credentials; PostgreSQL persistence requires a configured database.
- **Follow-up:** Live Clerk sign-in/sign-out verification remains credential-dependent and is recorded in `docs/setup-required.md`.

### RP-003 — Candidate Truth Vault

- **Status:** Pass
- **Major implementation:** Owned candidate profile, employment, education, skill/evidence, project, credential, preferences, and work-authorization models; authenticated Server Actions; candidate-facing profile editor; explicit verification/source metadata.
- **Tests:** Truth Vault validation, current-employment and date rules, skill/alias normalization, explicit authorization answers, complete owned CRUD lifecycle, deletion, and foreign-record rejection.
- **Migration:** `20260813120000_add_candidate_truth_vault`
- **Known limitations:** Database-backed browser interaction requires the PostgreSQL and Clerk setup already recorded in `docs/setup-required.md`.
- **Follow-up:** RP-004 résumé document ingestion creates unverified fact proposals instead of canonical facts.

### RP-004 — Resume importer and extraction

- **Status:** Pass
- **Major implementation:** Private PDF/DOCX upload API, signature/MIME/extension/size validation, randomized internal storage keys, development filesystem storage adapter, format-specific text extraction, persistent extraction provenance, and pending candidate-fact proposals.
- **Tests:** Valid synthetic PDF and DOCX extraction, malformed and text-empty extraction failures, oversized and empty files, incorrect MIME/extension/signature, duplicate rejection, proposal source regions, and foreign-document concealment.
- **Migration:** `20260813150000_add_resume_import`
- **Known limitations:** OCR is intentionally unsupported. The local filesystem adapter is not production-ready and live authenticated uploads require the Clerk/PostgreSQL setup already recorded.
- **Follow-up:** RP-005 will provide the explicit candidate review and canonicalization workflow for pending proposals.

### RP-005 — Fact verification and claim provenance

- **Status:** Pass
- **Major implementation:** Candidate accept/edit-and-accept/reject review UI and API, transactional canonical-fact creation, retained proposal history, generated-claim and evidence graph models, deterministic claim classification and readiness guardrails.
- **Tests:** Decision lifecycle, empty edits, repeated decisions, foreign proposal concealment, invented certification, changed employer, exaggerated duration, unsupported management/numeric claims, valid paraphrase, supported synthesis, and unsupported-readiness rejection.
- **Migration:** `20260813180000_add_fact_verification`
- **Known limitations:** Claim generation itself begins in later AI/application tickets; RP-005 supplies and validates the policy and persistence boundary those workflows must use.
- **Follow-up:** Phase B begins with RP-006 canonical job ingestion.

## Phase B — Jobs and matching

### RP-006 — Canonical job model

- **Status:** Pass
- **Major implementation:** Source-neutral canonical job, distinct source records, nullable unknown fields, compensation/location/authorization structures, source/raw metadata retention, lifecycle timestamps/status, and content hashing.
- **Tests:** Sparse/unknown source fields, stable identity normalization, material content changes, and contradictory salary bounds.
- **Migration:** `20260813200000_add_canonical_jobs`
- **Known limitations:** Discovery adapters and cross-source deduplication are deliberately implemented by RP-007 through RP-009 rather than embedded in persistence models.
- **Follow-up:** RP-007 adds capability-advertising, failure-isolated adapter orchestration.

### RP-007 — Job source adapter framework

- **Status:** Pass
- **Major implementation:** Discover/fetch/normalize/refresh adapter lifecycle, explicit capability checks, paged raw source records, multi-source orchestration, typed source errors, durable source-health state, and sanitized failure reporting.
- **Tests:** Healthy ingestion, capability exclusion, typed rate-limit failure, health events, and isolation of a broken source from successful feed results.
- **Migration:** `20260813210000_add_job_source_health`
- **Known limitations:** Retry scheduling fields are persisted but durable retry execution begins in the workflow phase.
- **Follow-up:** RP-008 implements only source access currently justified by official documentation.

### RP-008 — Initial job source integration

- **Status:** Pass
- **Major implementation:** Greenhouse public Job Board discovery/fetch/refresh/normalization adapter, bounded requests, timeout and typed error handling, public hosted application links, and a source-specific access/terms/capability dossier.
- **Tests:** Public fixture discovery, query/location filtering, HTML-to-text normalization, unknown-field preservation, capability truthfulness, rate limiting, and malformed upstream responses.
- **External setup:** Operator-selected Greenhouse board-token/company mappings use `GREENHOUSE_BOARDS_JSON`; these are public identifiers, not credentials.
- **Known limitations:** No global Greenhouse search exists in the documented API. Submission and application schemas are not advertised because RoleProwl has no employer Job Board API key. LinkedIn/Indeed automation is not implemented.
- **Follow-up:** RP-009 persists normalized source records and deduplicates without merging distinct openings.

### RP-009 — Job normalization and deduplication

- **Status:** Pass
- **Major implementation:** Deterministic company/title/location/employment/URL/skill normalization, conservative multi-signal deduplication, material-change hashing, repost protection, source-association persistence, and observed stale/expiry policy.
- **Tests:** Same source, same opportunity across sources, different locations, different seniority, later repost, changed description, stale/expired observations, URL tracking removal, and technical skill distinctions.
- **Migration:** None; RP-006 source-association tables support this workflow.
- **Known limitations:** Description similarity is a conservative token-overlap signal, not an embedding model; ambiguous openings remain separate.
- **Follow-up:** RP-010 evaluates candidate qualification and preference with evidence-bearing deterministic layers.

### RP-010 — Matching engine v1

- **Status:** Pass
- **Major implementation:** Deterministic hard-constraint, qualification, and preference layers; evidence-bearing strengths/partials/gaps/conflicts/unknowns; confidence calculation; hard-conflict fit cap; versioned scoring.
- **Tests:** Highly suitable and clearly unsuitable fixtures, sponsorship conflict, unknown requirements, Java/JavaScript, C/C++, React/React Native, SQL/PostgreSQL, proficiency/duration non-inference, sparse descriptions, and contradictory requirements.
- **Migration:** None; RP-011 persists candidate-facing analyses.
- **Known limitations:** V1 intentionally uses explicit normalized facts and requirements; semantic comparison remains a separately governed AI task.
- **Follow-up:** RP-011 stores and displays the evidence behind every score.

### RP-011 — Explainable fit analysis

- **Status:** Pass
- **Major implementation:** Persistent versioned match analyses, candidate-facing Jobs workspace, evidence sections for strong/partial/gap/conflict/unknown signals, score suppression when decision evidence is absent, and owned accurate/inaccurate/not-relevant feedback.
- **Tests:** Preference/qualification separation, explicit authorization interpretation, unclassified-skill non-escalation, evidence-bearing scoring, sparse-job confidence, and the complete RP-010 adversarial fixture set.
- **Migration:** `20260813230000_add_job_match_analysis`
- **Known limitations:** Live analyses require ingested jobs and an authenticated PostgreSQL-backed candidate. Semantic requirement structuring begins in RP-012.
- **Follow-up:** Phase C begins with the provider-neutral structured AI implementation.

## Phase C — Application intelligence

### RP-012 — Structured AI layer

- **Status:** Pass
- **Major implementation:** Provider-neutral structured-generation contract, official OpenAI server-side SDK with Responses API structured parsing, seven task-specific versioned prompt/schema definitions, model-per-task overrides, bounded timeout/retry controls, refusal and invalid-output errors, request correlation, token metadata, PII-safe structured logs, and deterministic test provider.
- **Tests:** Complete task-definition coverage, schema rejection, test-double validation, Responses API request shape, usage/request metadata, explicit refusals, absent parsed output, model override precedence, bounded defaults, and log-content privacy.
- **External setup:** Live tasks require `OPENAI_API_KEY`; model and operational overrides are consolidated in `docs/setup-required.md` and `.env.example`.
- **Known limitations:** RP-012 establishes the governed boundary only. Ticket-specific evidence selection, claim persistence, document rendering, and application behavior are implemented in RP-013 onward.
- **Follow-up:** RP-013 composes evidence-grounded résumé generation on this boundary.

### RP-013 — Tailored résumé engine

- **Status:** Pass
- **Major implementation:** Deterministic target-evidence selection, dedicated structured résumé generation, complete statement-to-claim coverage, known-evidence resolution, RP-005 high-risk assertion validation, persistent versioned résumé/claim graph, randomized private object key, safe attachment filename, and maintainable server-side DOCX renderer.
- **Tests:** Relevance ordering, successful full pipeline, rendered/stored/persisted output, invented employer rejection, uncovered statement rejection, deterministic fixture schema rejection, valid DOCX ZIP signature, and text round-trip extraction.
- **Migration:** `20260814010000_add_resume_versions`
- **Known limitations:** The alpha template prioritizes stable document structure over visual customization. Live generation and persistence require the OpenAI, PostgreSQL, and private-storage setup already recorded.
- **Follow-up:** RP-014 generalizes the same evidence and claim guarantees for cover letters and application free text.

### RP-014 — Application writing engine

- **Status:** Pass
- **Major implementation:** Evidence-grounded cover letters, motivation responses, role summaries, and employer free-text answers; distinct task routing; bounded structured prose; claim-to-content and claim-to-evidence validation; high-risk assertion checks; fabricated employer-attachment rejection; and persistent versioned writing/claim graph.
- **Tests:** Free-text and cover-letter paths, task selection, provenance persistence, missing employer question, absent claim text, invented factual assertion, fabricated personal attachment, and bounded output schemas.
- **Migration:** `20260814020000_add_application_writing`
- **Known limitations:** Generation is an internal use case until the review queue and application workspace expose it. The attachment heuristic is deliberately narrow; factual safety is primarily enforced through structured claims and evidence.
- **Follow-up:** RP-015 classifies employer questions before any writing or answer path is selected.

### RP-015 — Application question classifier

- **Status:** Pass
- **Major implementation:** Complete eight-category taxonomy, ordered deterministic rules, high-risk safety precedence, optional schema-constrained AI assistance for unmatched prompts only, confidence/source metadata, and explicit unknown behavior without credentials.
- **Tests:** Work authorization, sponsorship, motivation, disability, demographics, legal attestation, salary, relocation, experience duration, profile field, unknown prompt, mixed attestation/profile wording, deterministic safety override, and AI-assisted fallback.
- **Migration:** None.
- **Known limitations:** Language coverage is English-first for the closed alpha. Unknown or novel phrasing deliberately remains unknown unless the configured AI classifier resolves it.
- **Follow-up:** RP-016 maps varied question wording onto durable answer concepts with staleness controls.

### RP-016 — Answer memory

- **Status:** Pass
- **Major implementation:** User-owned canonical answer memories, semantic deterministic concept mapping across varied wording, structured answers and sources, explicit auto-answer permission, remembered example wording, last-use support, and concept-specific re-verification windows.
- **Tests:** Multiple sponsorship phrasings, work authorization, salary, relocation, remote preference, availability, location, travel, unknown concepts, fresh/stale boundary, explicit permission denial, owned upsert shape, and empty/unmapped answer rejection.
- **Migration:** `20260814030000_add_answer_memory`
- **Known limitations:** The initial concept catalog is intentionally bounded and English-first. New concepts require an explicit domain addition instead of silently creating labels from model output.
- **Follow-up:** RP-017 applies hard answer-authority rules to sensitive, consequential, attestation, and stale-memory cases.

### RP-017 — Sensitive and consequential question handling

- **Status:** Pass
- **Major implementation:** Deterministic answer-authority decisions with separate handling/disposition, sensitive-data `NO_INFERENCE`, explicit fresh source requirement for consequential answers, non-automatable attestations, stale-memory blocking, unknown fail-closed behavior, and review-only narrative drafts.
- **Tests:** Sensitive missing/present answers, explicit/stale/wrong-source consequential answers, attestations, narrative drafts, stale ordinary memories, unknown questions, and the full reusable Phase C adversarial evaluation dataset.
- **Migration:** None.
- **Known limitations:** Sensitive answers are intentionally review-only in the alpha even when explicitly stored. This is stricter than the minimum no-inference rule.
- **Follow-up:** Phase D begins with candidate-defined deterministic application authority.

### Phase C AI evaluation gate

- **Status:** Pass (noncredential-dependent)
- **Dataset:** 12 reusable cases covering fabricated degree, fabricated certification, ambiguous experience, valid paraphrase, salary, sponsorship, demographics, attestation, motivation, unsupported skill, conflicting résumé dates, and contradictory job requirements.
- **Result:** Structural schemas and deterministic safety invariants pass with the mandatory mocked provider. Live OpenAI evaluation is deferred until credentials are supplied; no production rule is weakened by that absence.

## Phase D — Agent authority

### RP-018 — Application policy engine

- **Status:** Pass
- **Major implementation:** Persisted candidate policy for role, fit, seniority, salary, location, remote requirement, employment type, authorization, company blacklist, daily limit, and autonomy; versioned deterministic evaluation; explicit reject/recommend/prepare/review/eligibility outputs; reason codes; and unknown-data review semantics.
- **Tests:** Authorized eligibility, authorization conflict, salary floor/unknown, weak fit, company/seniority/role/employment/location/remote exclusions, unknown job fields, sensitive questions, unsupported claims, daily limit, source capability, missing submission authorization, autonomy levels, configuration bounds, and deterministic replay.
- **Migration:** `20260814040000_add_application_policy`
- **Known limitations:** The policy is persisted and enforced in the domain; the candidate-facing settings editor is completed with the real-settings page work in Phase F.
- **Follow-up:** RP-019 creates the auditable human review queue for cases that policy cannot safely resolve.

### RP-019 — Review queue

- **Status:** Pass
- **Major implementation:** Real authenticated `/queue` workspace, comprehensive decision snapshots, reason explanations, editable draft, approve/reject/defer controls, terminal resolution states, future-only deferral, owner-scoped atomic mutations, optimistic concurrency check, and immutable actor/before/after audit history including creation.
- **Tests:** Approve/reject transitions, valid/invalid deferral, terminal-state protection, and before/after audit generation for every mutable action. Production compilation and protected-route browser coverage remain part of the phase gate.
- **Migration:** `20260814050000_add_review_queue`
- **Known limitations:** Queue creation is invoked by the RP-020 decision engine; live interaction requires authenticated PostgreSQL setup.
- **Follow-up:** RP-020 combines fit, policy, claims, questions, capability, and submission authorization into reproducible persisted decisions.

### RP-020 — Application decision engine

- **Status:** Pass
- **Major implementation:** Versioned deterministic composition of job, fit, candidate policy, claim validity, question resolution, source capability, materials, and submission authorization; canonical input hashing; complete input snapshots; specific reason codes; idempotent persistence; and atomic queue/audit creation for review decisions.
- **Tests:** Clean eligibility, stale sponsorship, attestation normalization, narrative-draft review, hard-reject precedence, hash replay/change behavior, queue/no-queue persistence contracts, and a 36-combination safety/determinism matrix.
- **Migration:** `20260814060000_add_application_decisions`
- **Known limitations:** Eligibility remains an inert decision state. RP-021 introduces durable workflow state, and RP-023 is the first ticket allowed to invoke a legitimate adapter.
- **Follow-up:** Phase E begins with idempotent durable application workflow state.

### Phase D automated gate

- **Status:** Pass
- **Matrix:** 36 combinations spanning unsupported claim counts, resolved/consequential/attestation questions, source capability, and explicit submission authorization; replayed outputs and hashes are identical.
- **Invariant:** No application with an unsupported claim, unresolved consequential question, attestation, missing source submission capability, or missing submission authorization becomes `ELIGIBLE_FOR_SUBMISSION`.
