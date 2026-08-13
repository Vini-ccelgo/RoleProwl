import "server-only";
import type {
  ApplicationSubmissionRecord,
  ApplicationSubmissionRepository,
} from "@/core/domain/applications/submission";
import type { Prisma } from "@/generated/prisma/client";
import { databaseClient } from "@/lib/db/client";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function recordFrom(application: {
  readonly id: string;
  readonly submissionDestination: string | null;
  readonly submissionMechanism: ApplicationSubmissionRecord["mechanism"];
  readonly state: string;
  readonly submissionPayloadSnapshot: unknown;
  readonly userId: string;
}): ApplicationSubmissionRecord {
  return {
    applicationId: application.id,
    destinationUrl: application.submissionDestination,
    mechanism: application.submissionMechanism,
    package:
      application.submissionPayloadSnapshot as unknown as ApplicationSubmissionRecord["package"],
    state: application.state as ApplicationSubmissionRecord["state"],
    userId: application.userId,
  };
}

export class PrismaApplicationSubmissionRepository implements ApplicationSubmissionRepository {
  async prepare(
    input: Parameters<ApplicationSubmissionRepository["prepare"]>[0],
  ) {
    const state =
      input.capability.mode === "AUTHORIZED_API"
        ? ("PREPARING" as const)
        : input.capability.mode === "UNSUPPORTED"
          ? ("FAILED" as const)
          : ("READY" as const);
    const type =
      state === "READY"
        ? ("READY_FOR_EXTERNAL_SUBMISSION" as const)
        : state === "FAILED"
          ? ("SUBMISSION_FAILED" as const)
          : ("PREPARED" as const);
    const application = await databaseClient().application.create({
      data: {
        userId: input.userId,
        jobId: input.jobId,
        decisionId: input.decisionId,
        workflowRunId: input.workflowRunId,
        resumeVersionId: input.package.resumeVersionId,
        state,
        fitSnapshot: json(input.fitSnapshot),
        generatedTextSnapshot: json(input.package.generatedText),
        answersSnapshot: json(input.package.answers),
        documentsSnapshot: json(input.package.documents),
        policyResultSnapshot: json(input.policyResultSnapshot),
        submissionPayloadSnapshot: json(input.package),
        submissionMechanism: input.capability.mode,
        submissionDestination: input.package.destinationUrl,
        events: {
          create: {
            actorUserId: input.userId,
            type,
            toState: state,
            detail: json({ mechanism: input.capability.mode }),
          },
        },
      },
    });
    return recordFrom(application);
  }

  async markSubmitting(applicationId: string, userId: string) {
    await databaseClient().$transaction(async (transaction) => {
      const current = await transaction.application.findFirstOrThrow({
        where: { id: applicationId, userId },
        select: { state: true, userId: true },
      });
      await transaction.application.update({
        where: { id: applicationId },
        data: { state: "SUBMITTING" },
      });
      await transaction.applicationEvent.create({
        data: {
          applicationId,
          actorUserId: current.userId,
          type: "SUBMISSION_STARTED",
          fromState: current.state,
          toState: "SUBMITTING",
        },
      });
    });
  }

  async markSubmitted(
    applicationId: string,
    userId: string,
    receipt: Parameters<ApplicationSubmissionRepository["markSubmitted"]>[2],
    confirmation: Parameters<
      ApplicationSubmissionRepository["markSubmitted"]
    >[3],
  ) {
    return databaseClient().$transaction(async (transaction) => {
      const current = await transaction.application.findFirstOrThrow({
        where: { id: applicationId, userId },
        select: { state: true, userId: true },
      });
      const application = await transaction.application.update({
        where: { id: applicationId },
        data: {
          state: "SUBMITTED",
          externalSubmissionId: receipt.externalId,
          submittedAt: receipt.submittedAt,
          externalConfirmedAt:
            confirmation === "USER_CONFIRMED_EXTERNAL"
              ? receipt.submittedAt
              : null,
        },
      });
      await transaction.applicationEvent.create({
        data: {
          applicationId,
          actorUserId: current.userId,
          type: "SUBMISSION_CONFIRMED",
          fromState: current.state,
          toState: "SUBMITTED",
          detail: json({ confirmation, externalId: receipt.externalId }),
        },
      });
      return recordFrom(application);
    });
  }
}
