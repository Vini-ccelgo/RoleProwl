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
