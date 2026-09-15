"use server";

import { revalidatePath } from "next/cache";
import type { PreparedApplication } from "@/core/contracts/application-adapter";
import type { Prisma } from "@/generated/prisma/client";
import {
  isApplicationState,
  type ApplicationState,
} from "@/core/domain/applications/application-tracker";
import {
  requireLegitimateDestination,
  type ApplicationSubmissionRecord,
} from "@/core/domain/applications/submission";
import {
  candidateKnowledgePolicy,
  isCandidateKnowledgeConcept,
} from "@/core/domain/candidate/candidate-knowledge";
import {
  isApplicationIdentityKey,
  fanOutCompatibleApplicationAnswers,
  isApplicationPacket,
  validatedApplicationAnswerValue,
} from "@/core/domain/applications/application-packet";
import {
  AIInvalidOutputError,
  AIProviderCapacityError,
  ApplicationError,
  ConflictError,
  RateLimitExceededError,
  ValidationError,
} from "@/core/errors/application-errors";
import { readableJobDescription } from "@/core/domain/jobs/job-description";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { confirmExternalSubmission } from "@/features/applications/prepare-and-submit-application";
import { updateApplicationState } from "@/features/applications/update-application-state";
import { refreshApplicationPacket } from "@/features/applications/refresh-application-packet";
import { saveApplicationOverrides } from "@/features/applications/save-application-overrides";
import {
  generateApplicationWriting,
  selectRelevantWritingEvidence,
} from "@/features/writing/application-writing";
import { PrismaApplicationSubmissionRepository } from "@/integrations/applications/prisma-application-submission-repository";
import { PrismaApplicationTrackerRepository } from "@/integrations/applications/prisma-application-tracker-repository";
import { PrismaApplicationPacketRepository } from "@/integrations/applications/prisma-application-packet-repository";
import { PrismaApplicationOverrideRepository } from "@/integrations/applications/prisma-application-override-repository";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { PrismaProductAnalyticsProvider } from "@/integrations/analytics/prisma-product-analytics-provider";
import { currentAIProvider } from "@/integrations/ai/provider-factory";
import { PrismaApplicationWritingRepository } from "@/integrations/writing/prisma-application-writing-repository";
import { databaseClient } from "@/lib/db/client";
import {
  saveDirectCandidateKnowledgeBatch,
  queryCandidateKnowledgeBatch,
} from "@/integrations/candidate/prisma-candidate-knowledge";

const USER_OUTCOME_STATES = new Set<ApplicationState>([
  "RESPONSE",
  "INTERVIEW",
  "REJECTED",
  "WITHDRAWN",
  "OFFER",
  "CLOSED",
]);

const COVER_LETTER_STATES = new Set<ApplicationState>([
  "PREPARING",
  "NEEDS_REVIEW",
  "READY",
  "FAILED",
]);

const COVER_LETTER_FACT_TYPES = [
  "WORK_EXPERIENCE_TEXT",
  "EDUCATION_TEXT",
  "SKILL_TEXT",
  "PROJECT_TEXT",
  "CREDENTIAL_TEXT",
] as const;

export interface CoverLetterGenerationActionState {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
}

function evidenceSnapshot(value: Prisma.JsonValue | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function evidenceLabel(factType: string) {
  return `Verified candidate ${factType
    .replace(/_TEXT$/u, "")
    .replaceAll("_", " ")
    .toLocaleLowerCase("en-US")}`;
}

function coverLetterFailure(error: unknown): CoverLetterGenerationActionState {
  if (
    error instanceof AIProviderCapacityError ||
    error instanceof RateLimitExceededError ||
    (error instanceof ApplicationError && error.code === "AI_REFUSAL")
  ) {
    return {
      status: "error",
      message:
        "Cover letter generation is temporarily unavailable. Try again later.",
    };
  }
  if (error instanceof AIInvalidOutputError) {
    return {
      status: "error",
      message:
        "A safe evidence-backed draft could not be generated. No draft was saved.",
    };
  }
  return {
    status: "error",
    message:
      "Cover letter generation is not currently available. No draft was saved.",
  };
}

export async function generateCoverLetterAction(
  _previous: CoverLetterGenerationActionState,
  formData: FormData,
): Promise<CoverLetterGenerationActionState> {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) return coverLetterFailure(null);

  try {
    const database = databaseClient();
    const application = await database.application.findFirst({
      where: { id: applicationId, userId: actor.id },
      select: {
        id: true,
        jobId: true,
        state: true,
        submittedAt: true,
        job: {
          select: {
            company: true,
            description: true,
            employmentType: true,
            locations: true,
            preferredRequirements: true,
            remoteType: true,
            requirements: true,
            seniority: true,
            title: true,
          },
        },
      },
    });
    if (!application) return coverLetterFailure(null);
    if (
      application.submittedAt ||
      !COVER_LETTER_STATES.has(application.state)
    ) {
      return {
        status: "error",
        message: "Cover letter drafts can only be generated before submission.",
      };
    }

    const [facts, preferences] = await Promise.all([
      database.candidateFact.findMany({
        where: {
          factType: { in: [...COVER_LETTER_FACT_TYPES] },
          status: "ACTIVE",
          userId: actor.id,
          verificationState: "VERIFIED",
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { factType: true, id: true, value: true },
      }),
      database.candidatePreferences.findUnique({
        where: { userId: actor.id },
        select: {
          employmentTypes: true,
          industries: true,
          locationPreferences: true,
          remotePreference: true,
          roleFamilies: true,
          seniorities: true,
        },
      }),
    ]);
    const candidateEvidence = facts.flatMap((fact) => {
      const snapshot = evidenceSnapshot(fact.value);
      return snapshot
        ? [
            {
              evidenceField: "value",
              evidenceId: fact.id,
              evidenceType: "CANDIDATE_FACT",
              label: evidenceLabel(fact.factType),
              snapshot,
            },
          ]
        : [];
    });
    const jobContext = {
      company: application.job.company,
      description: readableJobDescription(application.job.description),
      employmentType: application.job.employmentType,
      locations: application.job.locations,
      preferredRequirements: application.job.preferredRequirements,
      remoteType: application.job.remoteType,
      requirements: application.job.requirements,
      seniority: application.job.seniority,
      title: application.job.title,
    };
    const evidence = selectRelevantWritingEvidence(
      candidateEvidence,
      jobContext,
    );
    if (evidence.length === 0) {
      return {
        status: "error",
        message:
          "Verify relevant candidate evidence before generating a cover letter draft.",
      };
    }

    await generateApplicationWriting({
      ai: currentAIProvider(),
      company: application.job.company,
      correlationId: crypto.randomUUID(),
      evidence,
      jobContext,
      preferences,
      repository: new PrismaApplicationWritingRepository(),
      targetJobId: application.jobId,
      type: "COVER_LETTER",
      userId: actor.id,
    });
    revalidatePath(`/applications/${application.id}`);
    return {
      status: "success",
      message: "Cover letter draft generated. Review it before any use.",
    };
  } catch (error) {
    return coverLetterFailure(error);
  }
}

export async function updateApplicationStateAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const applicationId = String(formData.get("applicationId") ?? "");
  const nextText = String(formData.get("next") ?? "");
  if (
    !applicationId ||
    !isApplicationState(nextText) ||
    !USER_OUTCOME_STATES.has(nextText)
  )
    return;
  await updateApplicationState({
    analytics: new PrismaProductAnalyticsProvider(),
    applicationId,
    userId: actor.id,
    next: nextText,
    detail: { note: String(formData.get("note") ?? "").trim() || null },
    repository: new PrismaApplicationTrackerRepository(),
  });
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/dashboard");
}

export async function markApplicationReadyAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) return;
  const application = await databaseClient().application.findFirst({
    where: { id: applicationId, userId: actor.id },
    select: {
      jobId: true,
      state: true,
      submissionDestination: true,
      job: {
        select: {
          reviewQueueItems: {
            where: {
              userId: actor.id,
              status: { in: ["PENDING", "DEFERRED"] },
            },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  if (
    !application ||
    (application.state !== "PREPARING" &&
      application.state !== "NEEDS_REVIEW") ||
    application.job.reviewQueueItems.length > 0
  )
    return;
  requireLegitimateDestination(application.submissionDestination);
  await refreshApplicationPacket({
    applicationId,
    reviewed: true,
    userId: actor.id,
    repository: new PrismaApplicationPacketRepository(),
  });
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/dashboard");
  revalidatePath("/queue");
}

export async function refreshApplicationPacketAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) return;
  await refreshApplicationPacket({
    applicationId,
    repository: new PrismaApplicationPacketRepository(),
    userId: actor.id,
  });
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/dashboard");
}

export async function selectApplicationResumeAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const applicationId = String(formData.get("applicationId") ?? "");
  const candidateDocumentId = String(formData.get("candidateDocumentId") ?? "");
  if (!applicationId || !candidateDocumentId) return;
  await refreshApplicationPacket({
    applicationId,
    repository: new PrismaApplicationPacketRepository(),
    resumeSelection: { kind: "CANDIDATE_DOCUMENT", id: candidateDocumentId },
    userId: actor.id,
  });
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/dashboard");
}

export async function saveApplicationOverridesAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) return;
  const submittedIdentity = [...formData.entries()].flatMap(
    ([name, candidate]) => {
      if (!name.startsWith("identity:") || typeof candidate !== "string")
        return [];
      const key = name.slice("identity:".length);
      return isApplicationIdentityKey(key)
        ? [{ key, value: candidate || null }]
        : [];
    },
  );
  const submittedAnswerNames = new Set(
    [...formData.keys()].filter((name) => name.startsWith("answer:")),
  );
  const application = await databaseClient().application.findFirst({
    where: { id: applicationId, userId: actor.id, submittedAt: null },
    select: { submissionPayloadSnapshot: true },
  });
  const payload = evidenceSnapshot(application?.submissionPayloadSnapshot);
  const packet = isApplicationPacket(payload?.packet) ? payload.packet : null;
  const submittedAnswers = [...submittedAnswerNames].map((name) => {
    const key = name.slice("answer:".length);
    const packetAnswer = packet?.answers.find(
      (candidate) => candidate.questionId === key,
    );
    if (!packetAnswer)
      throw new ValidationError(
        "An application question is no longer available. Refresh and try again.",
      );
    return {
      key,
      value: validatedApplicationAnswerValue(
        packetAnswer,
        formData
          .getAll(name)
          .flatMap((candidate) =>
            typeof candidate === "string" ? [candidate] : [],
          ),
      ),
    };
  });
  const expandedAnswers = packet
    ? fanOutCompatibleApplicationAnswers(packet.answers, submittedAnswers)
    : submittedAnswers;
  const identity = submittedIdentity.filter((answer) => {
    const packetIdentity = packet?.identity.find(
      (candidate) => candidate.key === answer.key,
    );
    return !(
      packetIdentity?.status === "RESOLVED" &&
      (packetIdentity.value?.normalize("NFKC").trim() || null) ===
        (answer.value?.normalize("NFKC").trim() || null)
    );
  });
  const answers = expandedAnswers.filter((answer) => {
    const packetAnswer = packet?.answers.find(
      (candidate) => candidate.questionId === answer.key,
    );
    return !(
      packetAnswer?.status === "RESOLVED" &&
      (packetAnswer.value?.normalize("NFKC").trim() || null) ===
        (answer.value?.normalize("NFKC").trim() || null)
    );
  });
  const reusableAnswers = answers.flatMap((answer) => {
    const packetAnswer = packet?.answers.find(
      (candidate) => candidate.questionId === answer.key,
    );
    const concept = packetAnswer?.canonicalConcept;
    const policy =
      concept && isCandidateKnowledgeConcept(concept)
        ? candidateKnowledgePolicy(concept)
        : null;
    return answer.value &&
      concept &&
      policy?.reusableForEmployerQuestions &&
      packetAnswer?.resolutionReasonCode !== "EMPLOYER_SPECIFIC_ANSWER" &&
      packetAnswer?.resolutionDisposition !== "AUTO_RESOLVED" &&
      packetAnswer?.resolutionDisposition !== "HUMAN_REQUIRED"
      ? [
          {
            userId: actor.id,
            concept,
            answer: { text: answer.value },
            resolvesConflicts:
              packetAnswer.resolutionReasonCode ===
              "CANDIDATE_KNOWLEDGE_CONFLICT",
          },
        ]
      : [];
  });
  const reusableAnswersByConcept = new Map<
    (typeof reusableAnswers)[number]["concept"],
    (typeof reusableAnswers)[number][]
  >();
  for (const answer of reusableAnswers)
    reusableAnswersByConcept.set(answer.concept, [
      ...(reusableAnswersByConcept.get(answer.concept) ?? []),
      answer,
    ]);
  const uniqueReusableAnswers = [...reusableAnswersByConcept.values()].flatMap(
    (conceptAnswers) =>
      new Set(conceptAnswers.map((answer) => JSON.stringify(answer.answer)))
        .size === 1
        ? [conceptAnswers[0]!]
        : [],
  );
  if (uniqueReusableAnswers.length)
    await saveDirectCandidateKnowledgeBatch(uniqueReusableAnswers);
  const reusableConcepts = new Set(
    uniqueReusableAnswers.map((answer) => answer.concept),
  );
  const applicationAnswers = answers.filter((answer) => {
    const concept = packet?.answers.find(
      (candidate) => candidate.questionId === answer.key,
    )?.canonicalConcept;
    return !concept || !reusableConcepts.has(concept);
  });
  if (identity.length || applicationAnswers.length)
    await saveApplicationOverrides({
      applicationId,
      userId: actor.id,
      identity,
      answers: applicationAnswers,
      repository: new PrismaApplicationOverrideRepository(),
    });
  else if (uniqueReusableAnswers.length)
    await refreshApplicationPacket({
      applicationId,
      repository: new PrismaApplicationPacketRepository(),
      userId: actor.id,
    });
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/dashboard");
}

export async function confirmCandidateKnowledgeAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const applicationId = String(formData.get("applicationId") ?? "");
  const questionIds = new Set(
    formData
      .getAll("questionId")
      .flatMap((value) => (typeof value === "string" && value ? [value] : [])),
  );
  if (!applicationId || !questionIds.size) return;
  const application = await databaseClient().application.findFirst({
    where: { id: applicationId, userId: actor.id, submittedAt: null },
    select: { submissionPayloadSnapshot: true },
  });
  const payload = evidenceSnapshot(application?.submissionPayloadSnapshot);
  const packet = isApplicationPacket(payload?.packet) ? payload.packet : null;
  const concepts = [
    ...new Set(
      (packet?.answers ?? []).flatMap((answer) =>
        questionIds.has(answer.questionId) &&
        answer.canonicalConcept &&
        isCandidateKnowledgeConcept(answer.canonicalConcept) &&
        answer.resolutionReasonCode === "CANDIDATE_KNOWLEDGE_STALE"
          ? [answer.canonicalConcept]
          : [],
      ),
    ),
  ];
  if (!concepts.length) return;
  const current = await queryCandidateKnowledgeBatch({
    userId: actor.id,
    concepts,
  });
  const confirmedAt = new Date();
  const confirmations = current.flatMap((item) =>
    item.value && item.status === "STALE_CONFIRMATION_REQUIRED"
      ? [
          {
            userId: actor.id,
            concept: item.concept,
            answer: item.value,
            confirmedAt,
          },
        ]
      : [],
  );
  if (!confirmations.length) return;
  await saveDirectCandidateKnowledgeBatch(confirmations);
  await refreshApplicationPacket({
    applicationId,
    repository: new PrismaApplicationPacketRepository(),
    userId: actor.id,
  });
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/dashboard");
}

export async function confirmExternalApplicationAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) return;
  const application = await databaseClient().application.findFirst({
    where: { id: applicationId, userId: actor.id },
    select: {
      id: true,
      userId: true,
      state: true,
      submissionDestination: true,
      submissionMechanism: true,
      submissionPayloadSnapshot: true,
    },
  });
  if (!application || application.state !== "READY") return;
  const payload =
    application.submissionPayloadSnapshot &&
    typeof application.submissionPayloadSnapshot === "object" &&
    !Array.isArray(application.submissionPayloadSnapshot)
      ? application.submissionPayloadSnapshot
      : null;
  if (
    !isApplicationPacket(payload?.packet) ||
    !payload.packet.completeness.readyForSubmissionHandoff
  )
    throw new ConflictError(
      "Refresh and review the application packet before confirming submission.",
    );
  const record: ApplicationSubmissionRecord = {
    applicationId: application.id,
    userId: application.userId,
    state: "READY",
    destinationUrl: application.submissionDestination,
    mechanism: application.submissionMechanism,
    package:
      application.submissionPayloadSnapshot as unknown as PreparedApplication,
  };
  await confirmExternalSubmission({
    analytics: new PrismaProductAnalyticsProvider(),
    application: record,
    userId: actor.id,
    repository: new PrismaApplicationSubmissionRepository(),
    confirmed: formData.get("confirmed") === "yes",
    confirmedAt: new Date(),
  });
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/dashboard");
  revalidatePath("/queue");
}
