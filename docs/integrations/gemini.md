# Temporary Gemini Developer API integration

## Purpose and boundary

RP-031A selects Gemini temporarily to control proof-of-concept cost during synthetic-data manual-alpha testing. It does not remove OpenAI or change any RoleProwl business rule. Features call `AIProvider`; the provider factory selects `gemini`, `openai`, or an explicitly injected deterministic test provider.

This is not approval to send real candidate or confidential information through an unpaid API. Use only the clearly fictional files under `fixtures/synthetic`.

## Current SDK and model identifiers

- Package: `@google/genai` 2.17.1, Google's current JavaScript/TypeScript SDK.
- Routine model: `gemini-3.5-flash-lite`.
- Scarce advanced model: `gemini-3.5-flash`.

These IDs were verified against Google's current [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [supported-model list](https://ai.google.dev/gemini-api/docs/interactions-overview), and [pricing/model page](https://ai.google.dev/gemini-api/docs/pricing). The deprecated `@google/generative-ai` package is not used.

## Configuration

```text
AI_PROVIDER=gemini
GEMINI_API_KEY=<secret from Google AI Studio>
ROLEPROWL_GEMINI_MODEL_LITE=gemini-3.5-flash-lite
ROLEPROWL_GEMINI_MODEL_FLASH=gemini-3.5-flash
ROLEPROWL_GEMINI_LITE_RPM_LIMIT=12
ROLEPROWL_GEMINI_LITE_RPD_LIMIT=450
ROLEPROWL_GEMINI_FLASH_RPM_LIMIT=4
ROLEPROWL_GEMINI_FLASH_RPD_LIMIT=15
ROLEPROWL_GEMINI_SYNTHETIC_ONLY=true
ROLEPROWL_DEPLOYMENT_ENVIRONMENT=local
ROLEPROWL_AI_TIMEOUT_MS=30000
ROLEPROWL_AI_MAX_RETRIES=1
```

The real key belongs only in `.env.local` or the deployment secret manager. It must never use a `NEXT_PUBLIC_` name.

The limits reflect conservative ceilings below the current project values supplied from AI Studio. They are configurable because Google documents that limits vary by project and tier. RoleProwl does not wait for a Google 429 before controlling its own traffic.

## Routing

| Task                                | Normal model | Flash escalation                      |
| ----------------------------------- | ------------ | ------------------------------------- |
| Résumé fact extraction              | Lite         | No automatic escalation               |
| Job requirement normalization       | Lite         | Eligible after bounded schema failure |
| Semantic evidence comparison        | Lite         | Eligible after bounded schema failure |
| Application-question classification | Lite         | No automatic escalation               |
| Routine free-text response          | Lite         | Eligible after bounded schema failure |
| Résumé tailoring                    | Flash        | Direct configured difficult task      |
| Cover-letter generation             | Flash        | Direct configured difficult task      |

An individual request can explicitly select Flash for a classified difficult task. A rate limit, daily ceiling, missing key, or provider outage never causes Flash escalation.

## Structured output and safety

The adapter derives Gemini's JSON Schema from the task's existing Zod schema and requests `application/json`. The response must then pass JSON decoding and the original RoleProwl Zod schema. Downstream résumé, writing, claim-provenance, sensitive-question, policy, review, capability, and submission checks are unchanged.

The adapter logs only bounded operational fields: provider, model, task, prompt/schema versions, correlation, latency, retry count, status, and token counts when present. It does not log keys, prompts, inputs, résumé content, candidate data, answers, or generated prose.

## Quota and errors

Each actual SDK request consumes a serializable PostgreSQL fixed-window bucket for its model's daily and minute windows. This includes retries and prevents parallel application instances from independently granting the same capacity.

RoleProwl distinguishes:

- `AVAILABLE`
- `NEAR_LIMIT`
- `LIMIT_REACHED`
- `RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`

Usable retry information from 429 responses is honored within a bounded delay. Otherwise retry uses bounded exponential backoff with jitter. Exhaustion produces a sanitized temporary-capacity error. It does not invoke OpenAI, retry indefinitely, or expose raw Google details.

## Synthetic-only deployment guard

- Local: allowed when synthetic-only mode is enabled.
- Preview: refused unless `ROLEPROWL_ALLOW_SYNTHETIC_AI_PREVIEW=true` is explicitly set for an isolated synthetic deployment.
- Production: refused by default. `ROLEPROWL_ALLOW_SYNTHETIC_AI_PRODUCTION=true` is an explicit override and must not be enabled for the free-tier proof of concept.

Authenticated pages display the synthetic-mode notice, but provider initialization also enforces the deployment guard. The notice is not the only control.

Never use real names, addresses, phone numbers, personal emails, résumés, authorization details, health information, demographic information, sensitive answers, or confidential employment history in this phase.

## Switching back to OpenAI

```text
AI_PROVIDER=openai
OPENAI_API_KEY=<secret>
```

Keep the existing `ROLEPROWL_AI_MODEL_DEFAULT` and optional task-specific OpenAI overrides. A Gemini key is not required when OpenAI is selected. There is no automatic paid fallback in either direction.

## Testing

Ordinary lint, unit, integration, E2E, and build commands mock providers or use the deterministic provider and consume zero Gemini quota.

The mocked Gemini contracts, routing, quota, provider-isolation, real task-schema, and fictional-fixture checks run with:

```bash
pnpm test:ai:gemini
```

The opt-in command below makes exactly one structured Lite request using only a fictional fixture ID:

```bash
pnpm test:ai:gemini:live
```

It is not part of CI and fails immediately without `GEMINI_API_KEY`.
