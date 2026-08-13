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
