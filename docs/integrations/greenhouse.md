# Greenhouse Job Board integration

## Purpose

Discover published jobs from explicitly configured employer job boards and normalize them into RoleProwl's canonical job model.

## Official API/documentation

- Greenhouse Job Board API: https://developers.greenhouse.io/job-board

Reviewed: 2026-08-23.

## Access model

Greenhouse documents Job Board GET data as public and unauthenticated. Requests are scoped to an employer's board token; this is not a global job-search API. RoleProwl therefore requires an explicit board token/company mapping and does not guess employers or enumerate boards.

Application submission is separate: Greenhouse documents its Job Board application POST as Basic-authenticated. RoleProwl does not possess arbitrary employers' Job Board API keys and does not advertise submission capability.

## Candidate-side suitability

Suitable for read-only discovery of already-published jobs and for sending the candidate to the employer-hosted job URL. It is not evidence of partner submission authorization.

The documented public job detail request with `questions=true` can expose the published application-question schema. RP-033C uses that fixed-host public read to map packet values and unresolved questions. Fetching or mapping a field is not evidence that the field reached the employer form.

Greenhouse's candidate-controlled MyGreenhouse Quick Apply can autofill information saved in the candidate's own MyGreenhouse account when an employer enables it. RoleProwl does not possess that candidate session, does not copy data into it, and does not claim its autofill as a RoleProwl transfer.

## Rate limits and errors

The public documentation does not publish a stable numeric GET limit. The adapter uses bounded requests, an explicit timeout, typed HTTP/rate-limit failures, and source-health reporting. Operators must reduce refresh frequency if Greenhouse signals throttling.

## Terms constraints

Only documented public GET endpoints are used. No authenticated Harvest, Candidate Ingestion, or application-submission endpoint is called. Raw payloads are retained only for provenance/refresh of configured public boards.

## Capabilities

- `READ_JOBS`
- `REQUIRES_USER_INTERACTION` (the candidate follows the hosted application URL)

- `READ_APPLICATION_SCHEMA` for published questions retrieved from the documented public job detail interface

Not advertised: application submission, application status, or partner authentication.

## Data stored

Published identifier, title, location, description, department/office metadata, update time, hosted URL, normalized canonical fields, hashes, and fetch timestamps. Unknown salary, sponsorship, authorization, skills, seniority, and requirement structures remain null.

## Refresh policy

Fetch the configured board and refresh individual published job identifiers. Missing or failed data is not immediately interpreted as closed; staleness policy in RP-009 uses repeated observations and timestamps.

## Submission status and fallback

Submission is unsupported without an employer-controlled Job Board API key. The fallback is the public Greenhouse hosted job/application page, a candidate-reviewed RoleProwl Application Packet with copy/download assistance, human completion of unsupported or verification controls, and explicit candidate submission confirmation.

## Chromium assisted transfer

RP-033C1 adds a developer-mode Manifest V3 helper under `browser-helper/` for
the two official Greenhouse job-board domains. The candidate explicitly
prepares a five-minute packet on an authenticated Application page, opens the
extension action, and grants one-time `activeTab` access to capture only that
prepared payload. No persistent RoleProwl host permission or public packet URL
is required.

The helper fills only uniquely matched supported controls, reads values back
when safe, and distinguishes `VERIFIED`, `TRANSFERRED`, `UNSUPPORTED`,
`HUMAN_REQUIRED`, and `FAILED`. It consumes the packet from Chromium session
storage after one authorized attempt. Résumé file inputs, CAPTCHA, employer
authentication, unsupported widgets, final review, and final Submit remain
candidate actions. Assisted transfer never changes an Application to
`SUBMITTED`; explicit candidate confirmation remains the durable boundary.

Build with `pnpm browser-helper:build`, then load `browser-helper/dist` through
Chromium's developer-mode **Load unpacked** control. No public extension-store
publication is required for alpha qualification.
