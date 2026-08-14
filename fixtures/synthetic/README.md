# Synthetic RP-032 preparation fixtures

Every file in this directory is fictional and is intended only for RoleProwl manual-alpha testing. The names, employers, school, credential, projects, jobs, URLs, and application questions do not describe a real person or opportunity.

- `candidate.json` covers employment, education, skills, projects, credentials, preferences, salary, location, remote preference, authorization, sponsorship, and application policy.
- `jobs.json` covers strong fit, weak fit, ambiguous skills, a mandatory missing skill, salary and location conflicts, sponsorship conflict, free text, sensitive data, consequential authorization, and attestation.
- `avery-quill-synthetic-resume.docx` is generated from the same fictional candidate by `pnpm fixtures:generate` and can exercise the résumé upload/extraction workflow.

Do not replace these with the product owner’s profile or any real résumé while free-tier Gemini synthetic-only mode is active.
