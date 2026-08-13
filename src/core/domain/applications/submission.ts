import type {
  AuthorizedApplicationAdapter,
  PreparedApplication,
  SubmissionReceipt,
} from "@/core/contracts/application-adapter";
import {
  IntegrationError,
  ValidationError,
} from "@/core/errors/application-errors";
import type { ResolvedIntegrationCapability } from "@/core/integrations/capability-registry";

export type SubmissionState =
  "FAILED" | "PREPARING" | "READY" | "SUBMITTING" | "SUBMITTED";

export interface ApplicationSubmissionRecord {
  readonly applicationId: string;
  readonly destinationUrl: string | null;
  readonly mechanism: ResolvedIntegrationCapability["mode"];
  readonly package: PreparedApplication;
  readonly state: SubmissionState;
  readonly userId: string;
}

export interface ApplicationSubmissionRepository {
  prepare(input: {
    readonly capability: ResolvedIntegrationCapability;
    readonly decisionId: string | null;
    readonly fitSnapshot: Readonly<Record<string, unknown>>;
    readonly jobId: string;
    readonly package: PreparedApplication;
    readonly policyResultSnapshot: Readonly<Record<string, unknown>>;
    readonly userId: string;
    readonly workflowRunId: string | null;
  }): Promise<ApplicationSubmissionRecord>;
  markSubmitting(applicationId: string, userId: string): Promise<void>;
  markSubmitted(
    applicationId: string,
    userId: string,
    receipt: SubmissionReceipt,
    confirmation: "AUTHORIZED_ADAPTER" | "USER_CONFIRMED_EXTERNAL",
  ): Promise<ApplicationSubmissionRecord>;
}

export type SubmissionFailureCode =
  "TIMEOUT" | "RATE_LIMITED" | "UPSTREAM_RETRYABLE" | "PERMANENT_FAILURE";

export class SubmissionAttemptError extends IntegrationError {
  constructor(
    message: string,
    readonly failureCode: SubmissionFailureCode,
    readonly retryable: boolean,
    cause?: unknown,
  ) {
    super(message, cause);
  }
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status =
    (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : null;
}

export function normalizeSubmissionFailure(error: unknown) {
  if (error instanceof SubmissionAttemptError) return error;
  const status = statusCode(error);
  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : "";
  const message = error instanceof Error ? error.message : "Submission failed.";
  if (name === "AbortError" || /timed?\s*out/i.test(message))
    return new SubmissionAttemptError(
      "The submission adapter timed out.",
      "TIMEOUT",
      true,
      error,
    );
  if (status === 429)
    return new SubmissionAttemptError(
      "The submission adapter was rate limited.",
      "RATE_LIMITED",
      true,
      error,
    );
  if (status !== null && status >= 500)
    return new SubmissionAttemptError(
      "The submission provider is temporarily unavailable.",
      "UPSTREAM_RETRYABLE",
      true,
      error,
    );
  return new SubmissionAttemptError(
    "The submission adapter failed permanently.",
    "PERMANENT_FAILURE",
    false,
    error,
  );
}

export function requireLegitimateDestination(url: string | null): string {
  if (!url)
    throw new ValidationError("An application destination is required.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError("The application destination is invalid.");
  }
  if (parsed.protocol !== "https:")
    throw new ValidationError("The application destination must use HTTPS.");
  if (parsed.username || parsed.password)
    throw new ValidationError(
      "The application destination cannot contain credentials.",
    );
  return parsed.toString();
}

export function assertAuthorizedAdapter(input: {
  readonly adapter: AuthorizedApplicationAdapter | null;
  readonly capability: ResolvedIntegrationCapability;
}): AuthorizedApplicationAdapter {
  if (
    input.capability.mode !== "AUTHORIZED_API" ||
    !input.capability.canSubmit ||
    !input.capability.capabilities.has("SUBMIT_APPLICATION")
  )
    throw new IntegrationError(
      "The source is not authorized for API submission.",
    );
  if (!input.adapter || input.adapter.source !== input.capability.source)
    throw new IntegrationError(
      "No authorized submission adapter is configured for this source.",
    );
  if (!input.adapter.getCapabilities().has("SUBMIT_APPLICATION"))
    throw new IntegrationError(
      "The configured adapter does not advertise submission capability.",
    );
  return input.adapter;
}
