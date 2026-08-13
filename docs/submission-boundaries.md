# Submission integration boundaries

RoleProwl treats job discovery and application submission as separate authorities. A public listing endpoint never implies permission to submit. The central capability registry and the discriminated application-adapter contract enforce that distinction before provider code can run.

## Alpha source behavior

| Source                            | Listing access                 | Alpha submission behavior                                                                                          |
| --------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Greenhouse                        | Public Job Board GET endpoints | `EXTERNAL_APPLICATION` unless RoleProwl is configured with the employer's legitimate submission credential         |
| Lever                             | Public Postings GET endpoints  | `EXTERNAL_APPLICATION` unless RoleProwl is configured with an API key issued by that Lever account's administrator |
| LinkedIn                          | No RoleProwl automation        | `MANUAL_EXTERNAL`; no scraping, browser bot, or submission automation                                              |
| Indeed                            | No RoleProwl automation        | `MANUAL_EXTERNAL`; no unofficial Indeed Apply automation                                                           |
| Other legitimate employer/ATS URL | Source-dependent               | `EXTERNAL_APPLICATION` with explicit user confirmation after submission                                            |

Greenhouse documents that GET job-board data is public while its application POST requires HTTP Basic authentication with an API key. Lever likewise documents a hosted `applyUrl`, recommends that implementers use it if they cannot correctly operate the custom application API, and requires an administrator-generated API key for the POST endpoint. These are integration credentials belonging to the relevant employer/account; RoleProwl does not infer or fabricate them.

LinkedIn's current user-facing guidance prohibits third-party software that scrapes or automates activity on its site, and its crawling terms require express permission. Indeed's developer agreement limits integrations to approved purposes and prohibits circumvention, unauthorized integration, and scraping outside the documentation. The alpha therefore has no LinkedIn or Indeed automation adapter.

## External handoff invariant

When an authorized API adapter is unavailable, RoleProwl preserves the exact answer, document, generated-text, fit, and policy snapshots, records the legitimate HTTPS destination, and enters `READY`. It does not mark the application `SUBMITTED` until the candidate explicitly confirms the external submission or a later authorized integration supplies a verifiable receipt.

No adapter may defeat CAPTCHA, spoof credentials, conceal identity, bypass access controls, or upgrade its own advertised capability. Authorized API execution requires all three of: a registry decision allowing submission, an adapter for the same source, and the adapter advertising `SUBMIT_APPLICATION`.

## Primary references

- [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html)
- [Lever Postings API](https://github.com/lever/postings-api)
- [LinkedIn prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions)
- [LinkedIn crawling terms](https://www.linkedin.com/legal/crawling-terms)
- [Indeed Developer Agreement](https://docs.indeed.com/legal-terms/developer-agreement)
