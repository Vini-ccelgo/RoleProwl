# RoleProwl Personal

Personal mode is a local, single-user job discovery, ranking, history, and
application-preparation workflow. It does not require the web application,
Clerk, PostgreSQL, or Inngest. It never submits an application.

## Setup

1. Copy `resume.example.txt` to `resume.txt` and replace the fictional content
   with your plaintext résumé. Conventional headings such as `Summary`,
   `Skills`, `Experience`, `Education`, `Projects`, `Certifications`,
   `Languages`, `Location`, and `Work authorization` improve local extraction.
2. Copy `preferences.example.json` to `preferences.json` and edit the small
   search/filter schema. This file is optional; neutral defaults are used when
   it is absent.
3. Optionally copy `sources.example.txt` to `sources.txt` to add targeted
   employer boards. Jobicy and Remotive work without this file.

All non-example files under `personal/` are ignored by Git. Never put a real
résumé or credentials in an `*.example.*` file.

## Daily workflow

```bash
pnpm personal:prowl
pnpm personal:prowl -- --limit 25
pnpm personal:prowl -- --new-only
pnpm personal:prowl -- --refresh
```

The normal six-hour local cache reduces public API traffic. `--refresh`
explicitly bypasses it. A run writes `results.md`, `results.json`, `state.json`,
and `cache.json`. On the next run, the prior `NEW` jobs become `SEEN`; user-set
statuses are preserved.

Copy a stable 16-character job ID from `results.md`, then use:

```bash
pnpm personal:shortlist -- --job <id>
pnpm personal:reject -- --job <id> --note "Reason"
pnpm personal:prepare -- --job <id>
pnpm personal:export-resume -- --job <id>
pnpm personal:open -- --job <id>
pnpm personal:mark -- --job <id> --status APPLIED
pnpm personal:mark -- --job <id> --status INTERVIEW --note "Interview date"
pnpm personal:history
pnpm personal:doctor
```

Allowed statuses are `NEW`, `SEEN`, `SHORTLISTED`, `REJECTED`, `APPLIED`,
`INTERVIEW`, `OFFER`, and `CLOSED`.

## Preferences

`preferences.json` accepts only these fields:

```json
{
  "targetRoles": ["Security Analyst", "SOC Analyst"],
  "searchTerms": ["cybersecurity", "information security"],
  "locations": ["Brazil", "São Paulo", "Remote", "LATAM"],
  "remotePreferred": true,
  "minimumSalary": null,
  "excludedSeniorities": ["LEAD"],
  "excludedCompanies": [],
  "employmentTypes": ["FULL_TIME", "INTERNSHIP"],
  "maximumJobAgeDays": 30,
  "adzunaCountry": null,
  "semanticLimit": 25
}
```

Hard filters use only known information: excluded company/seniority, known
incompatible location, known salary below the minimum, known employment-type
mismatch, explicit authorization/sponsorship conflict, and reliable posting age.
An absent field remains unknown and does not cause rejection.

## Discovery sources

- **Jobicy:** automatic public remote-jobs API; no credentials. Results retain
  and display the Jobicy link/attribution.
- **Remotive:** automatic public remote-jobs API; no credentials. Remotive notes
  that public-API listings are delayed by 24 hours and requests attribution and
  links back to Remotive. RoleProwl fetches once per refresh and normally relies
  on the six-hour cache.
- **Adzuna:** optional. Set `adzunaCountry` to a two-letter country code and set
  `ADZUNA_APP_ID` plus `ADZUNA_APP_KEY` in the environment. Missing configuration
  is reported as `SKIPPED`, not a run failure.
- **Greenhouse:** optional targeted public employer board.
- **Lever:** optional targeted public employer board. Use `lever-eu` for the EU
  host. Personal mode performs only public GET requests and never uses Lever's
  application POST endpoint.
- **Ashby:** optional targeted public employer board. Personal mode uses the
  documented public job-board endpoint and the returned `applyUrl`.

The targeted-source format is:

```text
greenhouse|Company Name|board-token-or-supported-URL
lever|Company Name|site-or-supported-URL
lever-eu|Company Name|site-or-supported-URL
ashby|Company Name|board-name-or-supported-URL
```

The original `Company Name|greenhouse-token` format remains accepted. RoleProwl
does not crawl arbitrary hosts, scrape authenticated pages, or automate LinkedIn
or Indeed.

Official source documentation:

- Jobicy: <https://jobicy.com/jobs-rss-feed>
- Remotive: <https://remotive.com/remote-jobs/api>
- Adzuna: <https://developer.adzuna.com/overview>
- Lever: <https://github.com/lever/postings-api>
- Ashby: <https://developers.ashbyhq.com/docs/public-job-posting-api>
- Greenhouse: <https://developers.greenhouse.io/job-board.html>

## Matching

Stage one runs locally across every normalized, deduplicated job using
RoleProwl's deterministic matcher plus preferences, explicit skill overlap,
freshness, and hard conflicts. Résumé skill mentions do not imply proficiency,
duration, professional use, or certification.

Stage two is optional and applies only to the top `semanticLimit` jobs. It can
recognize equivalent terminology and transferable evidence, but score changes
are limited to plus/minus 10 points. Positive semantic claims without an exact
supporting résumé quote are discarded.

## Optional local AI

Personal mode accepts only an OpenAI-compatible HTTP server on `localhost`,
`127.0.0.1`, or `::1`. It does not route the real résumé through RoleProwl's
Gemini free-tier synthetic configuration.

For Ollama, install and start Ollama separately, choose/download a model
yourself, and expose its OpenAI-compatible API. RoleProwl never downloads a
model. Then run:

```bash
export PERSONAL_AI_PROVIDER=local
export PERSONAL_AI_BASE_URL=http://127.0.0.1:11434
export PERSONAL_AI_MODEL=<your-installed-model>
pnpm personal:prowl
```

If local AI is not configured, deterministic mode remains fully usable. If a
job-level semantic call fails, its deterministic result is retained with a
warning. Local AI configuration also allows `personal:prepare` to create
grounded `tailored-resume.md`, `cover-letter.md`, and `application-draft.md`.
Unsupported generated claims block those optional AI files.

## Application preparation and boundary

`personal:prepare` always creates:

```text
personal/applications/<job-id>/job.md
personal/applications/<job-id>/fit-analysis.md
personal/applications/<job-id>/evidence.md
personal/applications/<job-id>/application-checklist.md
personal/applications/<job-id>/application.md
```

The evidence pack maps known requirements/matches to résumé evidence and keeps
gaps and unknowns visible. With configured local AI it additionally creates the
three review-required drafts listed above. For Greenhouse jobs with a retained
public board reference, it also retrieves the questions exposed by Greenhouse's
documented public `questions=true` endpoint and writes `questions.md`.
Compliance and demographic groups are always treated as sensitive; legal,
consequential, sensitive, and attestation questions remain user-controlled.
Question retrieval failure does not block the rest of the dossier.
Run `pnpm personal:prowl -- --refresh` once after upgrading an older Personal
Mode state so stored Greenhouse jobs gain the public question reference.

`application.md` is the dossier control sheet: job identity, URL, status, fit,
strengths, gaps, questions needing input, prepared documents, and next action.
All package files refer to the same stored job snapshot and résumé evidence.

`personal:export-resume` writes a minimal, single-column,
`tailored-resume.html` from the plaintext source résumé. It uses conventional
headings and source text only. Open it in a browser and use Print → Save as PDF
when a PDF is needed.

`personal:doctor` performs local readiness checks for Node, pnpm, private input
files, state/cache JSON, sources, optional Adzuna/local AI configuration, and
Git privacy rules. It reports status only and never prints résumé contents or
credentials.

`personal:open` opens the stored HTTPS application/listing URL in the desktop
browser. It does not inspect the form, answer questions, upload documents, click
submit, or claim that an external handoff is an API submission. After applying
manually, use `personal:mark --status APPLIED` to record the outcome locally.

## Personal files

Required:

- `resume.txt`

Optional inputs:

- `preferences.json`
- `sources.txt`

Generated and Git-ignored:

- `results.md`, `results.json`
- `state.json`, `cache.json`
- `applications/<job-id>/*`

The résumé is not embedded in results or state, and personal mode does not log
its contents. Source APIs receive search terms and source-supported location
filters, not the résumé text.
