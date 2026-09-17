import "server-only";
import {
  applicationQuestionControlDisposition,
  buildApplicationPacket,
  isApplicationPacket,
  materialRequiredQuestionSchemaChanged,
  parseApplicationPacketOverrides,
  reconcileApplicationQuestionOverrides,
  type ApplicationPacketSource,
} from "@/core/domain/applications/application-packet";
import type { AIProvider } from "@/core/contracts/ai-provider";
import type {
  CandidateKnowledgeConcept,
  CandidateKnowledgeQueryResult,
} from "@/core/domain/candidate/candidate-knowledge";
import type { ApplicationPacketRepository } from "@/features/applications/refresh-application-packet";
import { ConflictError, NotFoundError } from "@/core/errors/application-errors";
import type { Prisma } from "@/generated/prisma/client";
import {
  selectedApplicationResume,
  selectApplicationResume,
} from "@/core/domain/applications/application-resume";
import { databaseClient } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { queryCandidateKnowledgeBatch } from "@/integrations/candidate/prisma-candidate-knowledge";
import { currentAIProvider } from "@/integrations/ai/provider-factory";
import {
  candidateKnowledgeDisplayValue,
  resolveApplicationQuestions,
} from "@/features/applications/resolve-application-questions";
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

function unique(values: readonly (string | null | undefined)[]) {
  return [
    ...new Set(
      values.flatMap((value) => (value?.trim() ? [value.trim()] : [])),
    ),
  ];
}

export class PrismaApplicationPacketRepository implements ApplicationPacketRepository {
  constructor(
    private readonly request: GreenhouseQuestionFetch = fetch,
    private readonly queryKnowledge: typeof queryCandidateKnowledgeBatch = queryCandidateKnowledgeBatch,
    private readonly aiProvider: () => AIProvider | undefined = () =>
      currentAIProvider(),
  ) {}

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
        updatedAt: true,
        submissionDestination: true,
        documentsSnapshot: true,
        resumeVersionId: true,
        submissionPayloadSnapshot: true,
        job: {
          select: {
            locations: true,
            preferredRequirements: true,
            requirements: true,
            skills: true,
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
    const storedApplicationOverrides = parseApplicationPacketOverrides(
      existingPayload.overrides,
    );
    if (application.submittedAt) {
      if (input.resumeSelection)
        throw new ConflictError(
          "The résumé for a submitted application cannot be changed.",
        );
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
    const previousPacket = isApplicationPacket(existingPayload.packet)
      ? existingPayload.packet
      : null;
    const applicationOverrides = reconcileApplicationQuestionOverrides({
      overrides: storedApplicationOverrides,
      previousAnswers: previousPacket?.answers ?? [],
      questions,
    });
    const reviewInvalidated = Boolean(
      input.reviewed &&
      previousPacket &&
      materialRequiredQuestionSchemaChanged({
        previousAnswers: previousPacket.answers ?? [],
        questions,
      }),
    );
    const effectiveReviewed = input.reviewed && !reviewInvalidated;

    const [user, candidateKnowledge, writingArtifacts] = await Promise.all([
      database.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      }),
      this.queryKnowledge({ userId: input.userId }),
      database.applicationWritingArtifact.findMany({
        where: { userId: input.userId, targetJobId: application.jobId },
        orderBy: { generatedAt: "desc" },
      }),
    ]);
    let resume = selectedApplicationResume({
      documentsSnapshot: application.documentsSnapshot,
      resumeVersionId: application.resumeVersionId,
    });
    if (input.resumeSelection?.kind === "CANDIDATE_DOCUMENT") {
      const candidateDocument = await database.candidateDocument.findFirst({
        where: {
          id: input.resumeSelection.id,
          userId: input.userId,
          status: "EXTRACTED",
        },
        select: {
          originalFileName: true,
          mimeType: true,
          storageKey: true,
        },
      });
      if (!candidateDocument)
        throw new NotFoundError("The selected résumé was not found.");
      resume = selectApplicationResume({
        tailoredResume: null,
        candidateDocument,
      });
    } else if (input.resumeSelection?.kind === "RESUME_VERSION") {
      const tailoredResume = await database.resumeVersion.findFirst({
        where: {
          id: input.resumeSelection.id,
          userId: input.userId,
          targetJobId: application.jobId,
        },
        select: {
          id: true,
          renderedContentType: true,
          renderedFileName: true,
          renderedStorageKey: true,
        },
      });
      if (!tailoredResume)
        throw new NotFoundError("The selected résumé was not found.");
      resume = selectApplicationResume({
        tailoredResume,
        candidateDocument: null,
      });
    }
    const coverLetter = writingArtifacts.find(
      (artifact) => artifact.type === "COVER_LETTER",
    );
    const knowledgeByConcept = new Map<
      CandidateKnowledgeConcept,
      CandidateKnowledgeQueryResult
    >(candidateKnowledge.map((item) => [item.concept, item]));
    const currentValue = (concept: CandidateKnowledgeConcept) => {
      const item = knowledgeByConcept.get(concept);
      return item?.status === "AVAILABLE" && !item.conflict
        ? candidateKnowledgeDisplayValue(item.value)
        : null;
    };
    const firstName = currentValue("FIRST_NAME");
    const lastName = currentValue("LAST_NAME");
    const applicationEmail = currentValue("APPLICATION_EMAIL");
    const phone = currentValue("PHONE");
    const location = currentValue("CURRENT_LOCATION");
    const professionalTitle = currentValue("TARGET_ROLE");
    const questionResolutions = await resolveApplicationQuestions({
      aiFactory: this.aiProvider,
      applicationAnswers: applicationOverrides.answers,
      correlationId: application.id,
      knowledge: candidateKnowledge,
      jurisdictionContext: {
        jobLocations: Array.isArray(application.job.locations)
          ? application.job.locations.filter(
              (location): location is string => typeof location === "string",
            )
          : null,
      },
      jobContext: {
        title: application.job.title,
        requirements: application.job.requirements,
        preferredRequirements: application.job.preferredRequirements,
        skills: application.job.skills,
      },
      questions: questions.map((question) => ({
        ...question,
        controlDisposition: applicationQuestionControlDisposition(question),
      })),
      userId: input.userId,
      log: logger,
    });
    const sponsorship = knowledgeByConcept.get("US_FUTURE_SPONSORSHIP")?.value
      ?.required;
    const source: ApplicationPacketSource = {
      accountEmail:
        knowledgeByConcept.get("APPLICATION_EMAIL")?.conflict === true
          ? null
          : (user?.email ?? null),
      profile:
        firstName || lastName || applicationEmail || phone || location
          ? {
              firstName: firstName ?? "",
              lastName: lastName ?? "",
              applicationEmail,
              phone,
              location,
              countryCode: null,
              professionalTitle,
            }
          : null,
      verifiedResumeFacts: [],
      applicationOverrides,
      experience: currentValue("EMPLOYMENT_HISTORY")
        ? [currentValue("EMPLOYMENT_HISTORY")!]
        : [],
      education: currentValue("EDUCATION_HISTORY")
        ? [currentValue("EDUCATION_HISTORY")!]
        : [],
      credentials: currentValue("CERTIFICATIONS")
        ? [currentValue("CERTIFICATIONS")!]
        : [],
      skills: currentValue("SKILLS") ? [currentValue("SKILLS")!] : [],
      languages: candidateKnowledge.flatMap((item) => {
        if (!item.concept.startsWith("LANGUAGE_PROFICIENCY:")) return [];
        const value = candidateKnowledgeDisplayValue(item.value);
        return value
          ? [`${item.concept.slice(item.concept.indexOf(":") + 1)} — ${value}`]
          : [];
      }),
      workAuthorization: currentValue("US_WORK_AUTHORIZATION"),
      sponsorshipRequired:
        typeof sponsorship === "boolean" ? sponsorship : null,
      answerMemories: [],
      preferences: null,
      selectedResume: resume?.packetSource ?? null,
      coverLetter: coverLetter
        ? {
            fileName: "cover-letter.txt",
            contentType: "text/plain",
            storageKey: null,
          }
        : null,
      profileProvenance: {
        source: "STRUCTURED_CAREER_PROFILE",
        label: "Candidate memory",
      },
      questions,
      questionResolutions,
      questionInspection,
      sourceName: sourceRecord?.source ?? "UNKNOWN",
      targetRole: application.job.title,
    };
    const packet = buildApplicationPacket({
      source,
      reviewed: effectiveReviewed,
      reviewInvalidatedReason: reviewInvalidated
        ? "MATERIAL_REQUIRED_QUESTION_SCHEMA_CHANGED"
        : null,
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
    const documents = [
      ...(resume ? [resume.document] : []),
      ...packet.documents
        .filter((document) => document.kind !== "RESUME")
        .map((document) => ({
          contentType: document.contentType,
          fileName: document.fileName,
          kind: document.kind,
          status: document.status,
          storageKey: document.storageKey,
        })),
    ];
    const desiredState =
      effectiveReviewed && packet.completeness.readyForSubmissionHandoff
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
      overrides: applicationOverrides,
      packet,
      resumeVersionId: resume?.resumeVersionId ?? null,
    };
    await database.$transaction(async (transaction) => {
      const updated = await transaction.application.updateMany({
        where: {
          id: application.id,
          userId: input.userId,
          state: application.state,
          submittedAt: null,
          updatedAt: application.updatedAt,
        },
        data: {
          state: desiredState,
          resumeVersionId: resume?.resumeVersionId ?? null,
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
            reviewed: effectiveReviewed,
            reviewInvalidated,
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
