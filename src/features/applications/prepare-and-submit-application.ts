import type {
  AuthorizedApplicationAdapter,
  PreparedApplication,
  SubmissionReceipt,
} from "@/core/contracts/application-adapter";
import type { AnalyticsProvider } from "@/core/contracts/analytics-provider";
import {
  assertAuthorizedAdapter,
  normalizeSubmissionFailure,
  requireLegitimateDestination,
  type ApplicationSubmissionRecord,
  type ApplicationSubmissionRepository,
} from "@/core/domain/applications/submission";
import {
  IntegrationError,
  ValidationError,
} from "@/core/errors/application-errors";
import type { ResolvedIntegrationCapability } from "@/core/integrations/capability-registry";
import { trackProductEvent } from "@/features/analytics/track-product-event";

interface PreparationContext {
  readonly analytics?: AnalyticsProvider;
  readonly capability: ResolvedIntegrationCapability;
  readonly decisionId: string | null;
  readonly fitSnapshot: Readonly<Record<string, unknown>>;
  readonly jobId: string;
  readonly package: PreparedApplication;
  readonly policyResultSnapshot: Readonly<Record<string, unknown>>;
  readonly repository: ApplicationSubmissionRepository;
  readonly revalidateAuthority?: () => Promise<{
    readonly allowed: boolean;
    readonly reason: string;
    readonly requiresReview: boolean;
  }>;
  readonly resolveCurrentCapability?: () => Promise<ResolvedIntegrationCapability>;
  readonly userId: string;
  readonly workflowRunId: string | null;
}

export async function prepareAndMaybeSubmitApplication(
  input: PreparationContext & {
    readonly adapter: AuthorizedApplicationAdapter | null;
  },
): Promise<ApplicationSubmissionRecord> {
  if (input.capability.prohibitedAutomation && input.adapter)
    throw new IntegrationError("Automation is prohibited for this source.");

  const applicationPackage =
    input.capability.mode === "AUTHORIZED_API" ||
    input.capability.mode === "UNSUPPORTED"
      ? input.package
      : {
          ...input.package,
          destinationUrl: requireLegitimateDestination(
            input.package.destinationUrl,
          ),
        };
  const prepared = await input.repository.prepare({
    capability: input.capability,
    decisionId: input.decisionId,
    fitSnapshot: input.fitSnapshot,
    jobId: input.jobId,
    package: applicationPackage,
    policyResultSnapshot: input.policyResultSnapshot,
    userId: input.userId,
    workflowRunId: input.workflowRunId,
  });
  await trackProductEvent(input.analytics, {
    dedupeKey: `application-prepared:${prepared.applicationId}`,
    entityId: prepared.applicationId,
    entityType: "application",
    eventType: "APPLICATION_PREPARED",
    occurredAt: new Date(),
    properties: { mechanism: input.capability.mode },
    userId: input.userId,
  });

  if (input.capability.mode !== "AUTHORIZED_API") return prepared;

  if (prepared.state === "SUBMITTED") return prepared;

  const authority = await input.revalidateAuthority?.();
  if (authority && !authority.allowed)
    throw new ValidationError(
      authority.requiresReview
        ? `Submission requires review: ${authority.reason}`
        : `Submission authority was withdrawn: ${authority.reason}`,
    );
  const currentCapability = input.resolveCurrentCapability
    ? await input.resolveCurrentCapability()
    : input.capability;

  const adapter = assertAuthorizedAdapter({
    adapter: input.adapter,
    capability: currentCapability,
  });
  await input.repository.markSubmitting(prepared.applicationId, input.userId);
  let receipt: SubmissionReceipt;
  try {
    receipt = await adapter.submit(applicationPackage);
  } catch (error) {
    throw normalizeSubmissionFailure(error);
  }
  if (!(await adapter.verifySubmission(receipt)))
    throw new IntegrationError(
      "The authorized adapter could not verify submission.",
    );
  const submitted = await input.repository.markSubmitted(
    prepared.applicationId,
    input.userId,
    receipt,
    "AUTHORIZED_ADAPTER",
  );
  await trackProductEvent(input.analytics, {
    dedupeKey: `application-submitted:${submitted.applicationId}`,
    entityId: submitted.applicationId,
    entityType: "application",
    eventType: "APPLICATION_SUBMITTED",
    occurredAt: receipt.submittedAt,
    properties: { mechanism: "AUTHORIZED_API" },
    userId: input.userId,
  });
  return submitted;
}

export async function confirmExternalSubmission(input: {
  readonly analytics?: AnalyticsProvider;
  readonly application: ApplicationSubmissionRecord;
  readonly confirmed: boolean;
  readonly confirmedAt: Date;
  readonly externalId?: string;
  readonly repository: ApplicationSubmissionRepository;
  readonly userId: string;
}): Promise<ApplicationSubmissionRecord> {
  if (!input.confirmed)
    throw new ValidationError(
      "External submission requires explicit user confirmation.",
    );
  if (input.application.state !== "READY")
    throw new ValidationError(
      "Only a ready external application can be confirmed.",
    );
  if (input.application.mechanism === "AUTHORIZED_API")
    throw new ValidationError(
      "Authorized API submissions cannot use external confirmation.",
    );
  if (input.application.userId !== input.userId)
    throw new ValidationError("The application does not belong to this user.");
  requireLegitimateDestination(input.application.destinationUrl);
  const receipt: SubmissionReceipt = {
    externalId:
      input.externalId ?? `external:${input.application.applicationId}`,
    submittedAt: input.confirmedAt,
  };
  const submitted = await input.repository.markSubmitted(
    input.application.applicationId,
    input.userId,
    receipt,
    "USER_CONFIRMED_EXTERNAL",
  );
  await trackProductEvent(input.analytics, {
    dedupeKey: `application-submitted:${submitted.applicationId}`,
    entityId: submitted.applicationId,
    entityType: "application",
    eventType: "APPLICATION_SUBMITTED",
    occurredAt: receipt.submittedAt,
    properties: { mechanism: input.application.mechanism },
    userId: input.userId,
  });
  return submitted;
}
