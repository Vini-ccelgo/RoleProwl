import type {
  AuthorizedApplicationAdapter,
  PreparedApplication,
  SubmissionReceipt,
} from "@/core/contracts/application-adapter";
import {
  assertAuthorizedAdapter,
  requireLegitimateDestination,
  type ApplicationSubmissionRecord,
  type ApplicationSubmissionRepository,
} from "@/core/domain/applications/submission";
import {
  IntegrationError,
  ValidationError,
} from "@/core/errors/application-errors";
import type { ResolvedIntegrationCapability } from "@/core/integrations/capability-registry";

interface PreparationContext {
  readonly capability: ResolvedIntegrationCapability;
  readonly decisionId: string | null;
  readonly fitSnapshot: Readonly<Record<string, unknown>>;
  readonly jobId: string;
  readonly package: PreparedApplication;
  readonly policyResultSnapshot: Readonly<Record<string, unknown>>;
  readonly repository: ApplicationSubmissionRepository;
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

  if (input.capability.mode !== "AUTHORIZED_API") return prepared;

  const adapter = assertAuthorizedAdapter({
    adapter: input.adapter,
    capability: input.capability,
  });
  await input.repository.markSubmitting(prepared.applicationId, input.userId);
  const receipt = await adapter.submit(applicationPackage);
  if (!(await adapter.verifySubmission(receipt)))
    throw new IntegrationError(
      "The authorized adapter could not verify submission.",
    );
  return input.repository.markSubmitted(
    prepared.applicationId,
    input.userId,
    receipt,
    "AUTHORIZED_ADAPTER",
  );
}

export async function confirmExternalSubmission(input: {
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
  return input.repository.markSubmitted(
    input.application.applicationId,
    input.userId,
    receipt,
    "USER_CONFIRMED_EXTERNAL",
  );
}
