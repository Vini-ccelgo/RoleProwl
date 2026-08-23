import "server-only";
import {
  buildApplicationPacket,
  isApplicationPacket,
  parseApplicationPacketOverrides,
  type ApplicationPacketSource,
} from "@/core/domain/applications/application-packet";
import type { ApplicationPacketRepository } from "@/features/applications/refresh-application-packet";
import { ConflictError, NotFoundError } from "@/core/errors/application-errors";
import type { Prisma } from "@/generated/prisma/client";
import { databaseClient } from "@/lib/db/client";
import {
  fetchGreenhouseApplicationQuestions,
  greenhouseQuestionReference,
  type GreenhouseQuestionFetch,
} from "./greenhouse-application-inspector";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function object(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function text(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, Prisma.JsonValue>).text;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function unique(values: readonly (string | null | undefined)[]) {
  return [
    ...new Set(
      values.flatMap((value) => (value?.trim() ? [value.trim()] : [])),
    ),
  ];
}

function experienceLabel(value: {
  readonly employer: string;
  readonly title: string;
  readonly startDate: Date;
  readonly endDate: Date | null;
  readonly isCurrent: boolean;
}) {
  const end = value.isCurrent
    ? "Present"
    : (value.endDate?.toISOString().slice(0, 10) ?? "Unknown end");
  return `${value.title} at ${value.employer} (${value.startDate.toISOString().slice(0, 10)}–${end})`;
}

export class PrismaApplicationPacketRepository implements ApplicationPacketRepository {
  constructor(private readonly request: GreenhouseQuestionFetch = fetch) {}

  async refresh(input: Parameters<ApplicationPacketRepository["refresh"]>[0]) {
    const database = databaseClient();
    const application = await database.application.findFirst({
      where: { id: input.applicationId, userId: input.userId },
      select: {
        id: true,
        userId: true,
        jobId: true,
        state: true,
        submittedAt: true,
        submissionDestination: true,
        submissionPayloadSnapshot: true,
        job: {
          select: {
            title: true,
            sourceRecords: {
              orderBy: { lastSeenAt: "desc" },
              take: 1,
              select: {
                source: true,
                externalId: true,
                applicationUrl: true,
              },
            },
          },
        },
      },
    });
    if (!application) throw new NotFoundError("Application not found.");
    const existingPayload = object(application.submissionPayloadSnapshot);
    const applicationOverrides = parseApplicationPacketOverrides(
      existingPayload.overrides,
    );
    if (application.submittedAt) {
      const packet = existingPayload.packet;
      if (!isApplicationPacket(packet))
        throw new ConflictError(
          "The submitted application predates application packets and cannot be rebuilt.",
        );
      return packet;
    }
    if (
      !["PREPARING", "NEEDS_REVIEW", "READY", "FAILED"].includes(
        application.state,
      )
    )
      throw new ConflictError(
        "This application packet is no longer refreshable.",
      );

    const sourceRecord = application.job.sourceRecords[0] ?? null;
    const reference = sourceRecord
      ? greenhouseQuestionReference(sourceRecord)
      : null;
    let questions: Awaited<
      ReturnType<typeof fetchGreenhouseApplicationQuestions>
    > = [];
    let questionInspection: ApplicationPacketSource["questionInspection"] =
      sourceRecord?.source === "GREENHOUSE" ? "UNAVAILABLE" : "UNSUPPORTED";
    if (reference) {
      try {
        questions = await fetchGreenhouseApplicationQuestions(
          reference,
          this.request,
        );
        questionInspection = "AVAILABLE";
      } catch {
        questionInspection = "UNAVAILABLE";
      }
    }

    const [
      user,
      profile,
      verifiedResumeFacts,
      experiences,
      education,
      credentials,
      skills,
      authorization,
      preferences,
      answerMemories,
      tailoredResume,
      candidateDocument,
      writingArtifacts,
    ] = await Promise.all([
      database.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      }),
      database.candidateProfile.findUnique({ where: { userId: input.userId } }),
      database.candidateFact.findMany({
        where: { userId: input.userId, status: "ACTIVE" },
        select: { factType: true, value: true },
        orderBy: { createdAt: "asc" },
      }),
      database.workExperience.findMany({
        where: { userId: input.userId },
        orderBy: { startDate: "desc" },
      }),
      database.education.findMany({
        where: { userId: input.userId },
        orderBy: { startDate: "desc" },
      }),
      database.credential.findMany({
        where: { userId: input.userId },
        orderBy: { issuedAt: "desc" },
      }),
      database.skill.findMany({
        where: { userId: input.userId },
        orderBy: { canonicalName: "asc" },
      }),
      database.workAuthorizationProfile.findUnique({
        where: { userId: input.userId },
      }),
      database.candidatePreferences.findUnique({
        where: { userId: input.userId },
      }),
      database.answerMemory.findMany({
        where: { userId: input.userId },
        orderBy: { updatedAt: "desc" },
      }),
      database.resumeVersion.findFirst({
        where: { userId: input.userId, targetJobId: application.jobId },
        orderBy: { generatedAt: "desc" },
      }),
      database.candidateDocument.findFirst({
        where: { userId: input.userId, status: "EXTRACTED" },
        orderBy: { createdAt: "desc" },
      }),
      database.applicationWritingArtifact.findMany({
        where: { userId: input.userId, targetJobId: application.jobId },
        orderBy: { generatedAt: "desc" },
      }),
    ]);
    const facts = verifiedResumeFacts.flatMap((fact) => {
      const value = text(fact.value);
      return value ? [{ factType: fact.factType, text: value }] : [];
    });
    const selectedResume = tailoredResume
      ? {
          fileName: tailoredResume.renderedFileName,
          contentType: tailoredResume.renderedContentType,
          storageKey: tailoredResume.renderedStorageKey,
          tailored: true,
        }
      : candidateDocument
        ? {
            fileName: candidateDocument.originalFileName,
            contentType: candidateDocument.mimeType,
            storageKey: candidateDocument.storageKey,
            tailored: false,
          }
        : null;
    const coverLetter = writingArtifacts.find(
      (artifact) => artifact.type === "COVER_LETTER",
    );
    const source: ApplicationPacketSource = {
      accountEmail: user?.email ?? null,
      profile: profile
        ? {
            firstName: profile.firstName,
            lastName: profile.lastName,
            applicationEmail: profile.applicationEmail,
            phone: profile.phone,
            location: profile.location,
            countryCode: profile.countryCode,
            professionalTitle: profile.professionalTitle,
          }
        : null,
      verifiedResumeFacts: facts,
      applicationOverrides,
      experience: experiences.map(experienceLabel),
      education: education.map((item) =>
        [item.credential, item.program, item.institution]
          .filter(Boolean)
          .join(" · "),
      ),
      credentials: credentials.map((item) =>
        [item.name, item.issuer].filter(Boolean).join(" · "),
      ),
      skills: skills.map((item) => item.canonicalName),
      languages: [],
      workAuthorization: authorization?.authorizationStatus ?? null,
      sponsorshipRequired: authorization?.requiresSponsorship ?? null,
      answerMemories: answerMemories.map((memory) => ({
        concept: memory.concept,
        answer: object(memory.answer),
        source: memory.source,
        verifiedAt: memory.verifiedAt,
        reverifyAfterDays: memory.reverifyAfterDays,
        autoAnswerAllowed: memory.autoAnswerAllowed,
      })),
      preferences: preferences
        ? {
            desiredSalary:
              preferences.salaryMinimum && preferences.salaryCurrency
                ? `${preferences.salaryCurrency} ${preferences.salaryMinimum}`
                : preferences.salaryMinimum
                  ? String(preferences.salaryMinimum)
                  : null,
            willingToRelocate: preferences.willingToRelocate,
            remotePreference: preferences.remotePreference,
            travelPercent: preferences.maximumTravelPercent,
          }
        : null,
      selectedResume,
      coverLetter: coverLetter
        ? {
            fileName: "cover-letter.txt",
            contentType: "text/plain",
            storageKey: null,
          }
        : null,
      questions,
      questionInspection,
      sourceName: sourceRecord?.source ?? "UNKNOWN",
      targetRole: application.job.title,
    };
    const packet = buildApplicationPacket({
      source,
      reviewed: input.reviewed,
    });
    const generatedText = Object.fromEntries(
      unique(writingArtifacts.map((artifact) => artifact.type)).map((type) => [
        type,
        writingArtifacts.find((artifact) => artifact.type === type)!.content,
      ]),
    );
    const answers = Object.fromEntries(
      packet.answers.flatMap((answer) =>
        answer.status === "RESOLVED" && answer.value != null
          ? [[answer.questionId, answer.value]]
          : [],
      ),
    );
    const documents = packet.documents.map((document) => ({
      contentType: document.contentType,
      fileName: document.fileName,
      kind: document.kind,
      status: document.status,
      storageKey: document.storageKey,
    }));
    const desiredState =
      input.reviewed && packet.completeness.readyForSubmissionHandoff
        ? ("READY" as const)
        : application.state === "FAILED"
          ? ("PREPARING" as const)
          : ("NEEDS_REVIEW" as const);
    const submissionPackage = {
      ...existingPayload,
      answers,
      destinationUrl: application.submissionDestination,
      documents,
      generatedText,
      packet,
      resumeVersionId: tailoredResume?.id ?? null,
    };
    await database.$transaction(async (transaction) => {
      const updated = await transaction.application.updateMany({
        where: {
          id: application.id,
          userId: input.userId,
          state: application.state,
          submittedAt: null,
        },
        data: {
          state: desiredState,
          resumeVersionId: tailoredResume?.id ?? null,
          answersSnapshot: json(answers),
          documentsSnapshot: json(documents),
          generatedTextSnapshot: json(generatedText),
          policyResultSnapshot: json({
            status: packet.completeness.readyForSubmissionHandoff
              ? "PACKET_READY"
              : "PACKET_NEEDS_REVIEW",
            packetVersion: packet.version,
            needsReview: packet.completeness.needsReview,
            humanRequired: packet.completeness.humanRequired,
          }),
          submissionPayloadSnapshot: json(submissionPackage),
        },
      });
      if (updated.count !== 1)
        throw new ConflictError(
          "The application changed while its packet was rebuilt.",
        );
      await transaction.applicationEvent.create({
        data: {
          applicationId: application.id,
          actorUserId: input.userId,
          type:
            desiredState === "READY"
              ? "READY_FOR_EXTERNAL_SUBMISSION"
              : "PREPARED",
          fromState: application.state,
          toState: desiredState,
          detail: json({
            packetVersion: packet.version,
            reviewed: input.reviewed,
            ready: packet.completeness.readyForSubmissionHandoff,
          }),
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: input.userId,
          action: "APPLICATION_GENERATED",
          entityType: "application",
          entityId: application.id,
          metadata: {
            mechanism: "MANUAL_ASSISTED",
            decisionVersion: packet.version,
          },
        },
      });
    });
    return packet;
  }
}
