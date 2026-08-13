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
