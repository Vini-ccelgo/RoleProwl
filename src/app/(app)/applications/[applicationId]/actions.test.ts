import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApplicationPacket } from "@/core/domain/applications/application-packet";
import { AIInvalidOutputError } from "@/core/errors/application-errors";

const {
  candidateFactsFindMany,
  confirmExternalSubmission,
  currentAIProvider,
  findFirst,
  generateApplicationWriting,
  preferencesFindUnique,
  refreshApplicationPacket,
  requireAuthenticatedActor,
  revalidatePath,
  saveApplicationOverrides,
  saveDirectCandidateKnowledgeBatch,
  queryCandidateKnowledgeBatch,
  selectRelevantWritingEvidence,
} = vi.hoisted(() => ({
  candidateFactsFindMany: vi.fn(),
  confirmExternalSubmission: vi.fn(async () => undefined),
  currentAIProvider: vi.fn(() => ({ provider: "policy-enforced" })),
  findFirst: vi.fn(),
  generateApplicationWriting: vi.fn(async () => ({ id: "writing-1" })),
  preferencesFindUnique: vi.fn(),
  refreshApplicationPacket: vi.fn(async () => undefined),
  requireAuthenticatedActor: vi.fn(async () => ({ id: "user-1" })),
  revalidatePath: vi.fn(),
  saveApplicationOverrides: vi.fn(async () => undefined),
  saveDirectCandidateKnowledgeBatch: vi.fn(async () => []),
  queryCandidateKnowledgeBatch: vi.fn(),
  selectRelevantWritingEvidence: vi.fn(
    (evidence: Array<{ snapshot: unknown }>) =>
      evidence.filter((item) =>
        JSON.stringify(item.snapshot).includes("Python"),
      ),
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/features/accounts/require-authenticated-actor", () => ({
  requireAuthenticatedActor,
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({})),
}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    application: { findFirst },
    candidateFact: { findMany: candidateFactsFindMany },
    candidatePreferences: { findUnique: preferencesFindUnique },
  })),
}));
vi.mock("@/features/writing/application-writing", () => ({
  generateApplicationWriting,
  selectRelevantWritingEvidence,
}));
vi.mock("@/integrations/ai/provider-factory", () => ({ currentAIProvider }));
vi.mock("@/integrations/writing/prisma-application-writing-repository", () => ({
  PrismaApplicationWritingRepository: class {},
}));
vi.mock("@/features/applications/refresh-application-packet", () => ({
  refreshApplicationPacket,
}));
vi.mock("@/features/applications/save-application-overrides", () => ({
  saveApplicationOverrides,
}));
vi.mock("@/integrations/candidate/prisma-candidate-knowledge", () => ({
  queryCandidateKnowledgeBatch,
  saveDirectCandidateKnowledgeBatch,
}));
vi.mock("@/features/applications/prepare-and-submit-application", () => ({
  confirmExternalSubmission,
}));
vi.mock(
  "@/integrations/applications/prisma-application-packet-repository",
  () => ({ PrismaApplicationPacketRepository: class {} }),
);
vi.mock(
  "@/integrations/applications/prisma-application-override-repository",
  () => ({ PrismaApplicationOverrideRepository: class {} }),
);
vi.mock(
  "@/integrations/applications/prisma-application-submission-repository",
  () => ({ PrismaApplicationSubmissionRepository: class {} }),
);
vi.mock(
  "@/integrations/applications/prisma-application-tracker-repository",
  () => ({ PrismaApplicationTrackerRepository: class {} }),
);
vi.mock("@/integrations/analytics/prisma-product-analytics-provider", () => ({
  PrismaProductAnalyticsProvider: class {},
}));

import {
  confirmCandidateKnowledgeAction,
  confirmExternalApplicationAction,
  generateCoverLetterAction,
  markApplicationReadyAction,
  saveApplicationOverridesAction,
  selectApplicationResumeAction,
} from "./actions";

function form() {
  const value = new FormData();
  value.set("applicationId", "application-1");
  return value;
}

const idleCoverLetterState = { status: "idle" as const, message: "" };

const coverLetterApplication = {
  id: "application-1",
  jobId: "job-1",
  state: "PREPARING",
  submittedAt: null,
  job: {
    company: "Authoritative Co",
    description: "<p>Build Python services.</p>",
    employmentType: "FULL_TIME",
    locations: ["Remote - Brazil"],
    preferredRequirements: null,
    remoteType: "REMOTE",
    requirements: [
      {
        kind: "SKILL",
        skillName: "Python",
        statement: "Python is required",
      },
    ],
    seniority: "MID",
    title: "Python Engineer",
  },
};

const readyPacket = buildApplicationPacket({
  reviewed: true,
  source: {
    accountEmail: "candidate@example.test",
    profile: {
      firstName: "Avery",
      lastName: "Quill",
      applicationEmail: null,
      phone: null,
      location: null,
      countryCode: null,
      professionalTitle: null,
    },
    verifiedResumeFacts: [],
    experience: [],
    education: [],
    credentials: [],
    skills: [],
    languages: [],
    workAuthorization: null,
    sponsorshipRequired: null,
    answerMemories: [],
    selectedResume: {
      fileName: "resume.pdf",
      contentType: "application/pdf",
      storageKey: "candidate-documents/safe",
      tailored: false,
    },
    coverLetter: null,
    questions: [],
    questionInspection: "AVAILABLE",
    sourceName: "GREENHOUSE",
    targetRole: "Security Analyst",
  },
});

function packetForResolution(input: {
  readonly concept: "LANGUAGE_PROFICIENCY:english" | null;
  readonly disposition: "CANDIDATE_REQUIRED" | "PROPOSED_FOR_CANDIDATE";
  readonly reasonCode: string;
  readonly value: string | null;
}) {
  return buildApplicationPacket({
    reviewed: false,
    source: {
      accountEmail: "candidate@example.test",
      profile: {
        firstName: "Avery",
        lastName: "Quill",
        applicationEmail: null,
        phone: null,
        location: null,
        countryCode: null,
        professionalTitle: null,
      },
      verifiedResumeFacts: [],
      experience: [],
      education: [],
      credentials: [],
      skills: [],
      languages: [],
      workAuthorization: null,
      sponsorshipRequired: null,
      answerMemories: [],
      selectedResume: null,
      coverLetter: null,
      questions: [
        {
          id: "question-42",
          source: "GREENHOUSE",
          group: "STANDARD",
          label: "English proficiency",
          required: true,
          fieldNames: ["english_proficiency"],
          fieldTypes: ["input_text"],
          options: [],
        },
      ],
      questionResolutions: [
        {
          questionId: "question-42",
          canonicalConcept: input.concept,
          disposition: input.disposition,
          value: input.value,
          candidateKnowledgeReferences: input.concept ? ["memory-1"] : [],
          reasonCode: input.reasonCode,
        },
      ],
      questionInspection: "AVAILABLE",
      sourceName: "GREENHOUSE",
      targetRole: "Security Analyst",
    },
  });
}

describe("application packet actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedActor.mockResolvedValue({ id: "user-1" });
    currentAIProvider.mockReturnValue({ provider: "policy-enforced" });
    generateApplicationWriting.mockResolvedValue({ id: "writing-1" });
    candidateFactsFindMany.mockResolvedValue([]);
    preferencesFindUnique.mockResolvedValue(null);
  });

  it("derives cover-letter evidence and job context from the authenticated owner", async () => {
    findFirst.mockResolvedValue(coverLetterApplication);
    candidateFactsFindMany.mockResolvedValue([
      {
        factType: "SKILL_TEXT",
        id: "fact-python",
        value: { text: "Languages: Python" },
      },
      {
        factType: "PROJECT_TEXT",
        id: "fact-unrelated",
        value: { text: "Created pastry menus for a neighborhood bakery" },
      },
    ]);
    preferencesFindUnique.mockResolvedValue({
      employmentTypes: ["FULL_TIME"],
      industries: ["Technology"],
      locationPreferences: ["Brazil"],
      remotePreference: "REMOTE",
      roleFamilies: ["Software Engineering"],
      seniorities: ["MID"],
    });
    const value = form();
    value.set("company", "Browser-controlled Company");
    value.set("evidence", "Fabricated browser evidence");
    value.set("jobContext", "Untrusted job context");

    const result = await generateCoverLetterAction(idleCoverLetterState, value);

    expect(result).toEqual({
      status: "success",
      message: "Cover letter draft generated. Review it before any use.",
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "application-1", userId: "user-1" },
      }),
    );
    expect(candidateFactsFindMany).toHaveBeenCalledWith({
      where: {
        factType: {
          in: [
            "WORK_EXPERIENCE_TEXT",
            "EDUCATION_TEXT",
            "SKILL_TEXT",
            "PROJECT_TEXT",
            "CREDENTIAL_TEXT",
          ],
        },
        status: "ACTIVE",
        userId: "user-1",
        verificationState: "VERIFIED",
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { factType: true, id: true, value: true },
    });
    expect(currentAIProvider).toHaveBeenCalledOnce();
    expect(selectRelevantWritingEvidence).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ evidenceId: "fact-python" }),
        expect.objectContaining({ evidenceId: "fact-unrelated" }),
      ]),
      expect.objectContaining({ title: "Python Engineer" }),
    );
    expect(generateApplicationWriting).toHaveBeenCalledOnce();
    expect(generateApplicationWriting).toHaveBeenCalledWith(
      expect.objectContaining({
        ai: { provider: "policy-enforced" },
        company: "Authoritative Co",
        evidence: [
          {
            evidenceField: "value",
            evidenceId: "fact-python",
            evidenceType: "CANDIDATE_FACT",
            label: "Verified candidate skill",
            snapshot: { text: "Languages: Python" },
          },
        ],
        jobContext: {
          company: "Authoritative Co",
          description: "Build Python services.",
          employmentType: "FULL_TIME",
          locations: ["Remote - Brazil"],
          preferredRequirements: null,
          remoteType: "REMOTE",
          requirements: coverLetterApplication.job.requirements,
          seniority: "MID",
          title: "Python Engineer",
        },
        preferences: {
          employmentTypes: ["FULL_TIME"],
          industries: ["Technology"],
          locationPreferences: ["Brazil"],
          remotePreference: "REMOTE",
          roleFamilies: ["Software Engineering"],
          seniorities: ["MID"],
        },
        targetJobId: "job-1",
        type: "COVER_LETTER",
        userId: "user-1",
      }),
    );
    expect(
      JSON.stringify(generateApplicationWriting.mock.calls[0]),
    ).not.toContain("Browser-controlled");
    expect(
      JSON.stringify(generateApplicationWriting.mock.calls[0]),
    ).not.toContain("Fabricated browser evidence");
    expect(
      JSON.stringify(generateApplicationWriting.mock.calls[0]),
    ).not.toContain("pastry menus");
    expect(revalidatePath).toHaveBeenCalledWith("/applications/application-1");
    expect(refreshApplicationPacket).not.toHaveBeenCalled();
    expect(confirmExternalSubmission).not.toHaveBeenCalled();
  });

  it("requires authentication before cover-letter generation", async () => {
    requireAuthenticatedActor.mockRejectedValueOnce(new Error("signed out"));

    await expect(
      generateCoverLetterAction(idleCoverLetterState, form()),
    ).rejects.toThrow("signed out");

    expect(findFirst).not.toHaveBeenCalled();
    expect(currentAIProvider).not.toHaveBeenCalled();
    expect(generateApplicationWriting).not.toHaveBeenCalled();
  });

  it("conceals foreign applications and performs no generation", async () => {
    findFirst.mockResolvedValue(null);

    const result = await generateCoverLetterAction(
      idleCoverLetterState,
      form(),
    );

    expect(result).toEqual({
      status: "error",
      message:
        "Cover letter generation is not currently available. No draft was saved.",
    });
    expect(candidateFactsFindMany).not.toHaveBeenCalled();
    expect(currentAIProvider).not.toHaveBeenCalled();
    expect(generateApplicationWriting).not.toHaveBeenCalled();
  });

  it("returns a bounded failure when provenance validation rejects output", async () => {
    findFirst.mockResolvedValue(coverLetterApplication);
    candidateFactsFindMany.mockResolvedValue([
      {
        factType: "SKILL_TEXT",
        id: "fact-python",
        value: { text: "Languages: Python" },
      },
    ]);
    generateApplicationWriting.mockRejectedValueOnce(
      new AIInvalidOutputError("unknown evidence: private details"),
    );

    const result = await generateCoverLetterAction(
      idleCoverLetterState,
      form(),
    );

    expect(result).toEqual({
      status: "error",
      message:
        "A safe evidence-backed draft could not be generated. No draft was saved.",
    });
    expect(result.message).not.toContain("unknown evidence");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(refreshApplicationPacket).not.toHaveBeenCalled();
    expect(confirmExternalSubmission).not.toHaveBeenCalled();
  });

  it("does not generate for a submitted application", async () => {
    findFirst.mockResolvedValue({
      ...coverLetterApplication,
      state: "SUBMITTED",
      submittedAt: new Date("2026-09-06T12:00:00Z"),
    });

    const result = await generateCoverLetterAction(
      idleCoverLetterState,
      form(),
    );

    expect(result).toEqual({
      status: "error",
      message: "Cover letter drafts can only be generated before submission.",
    });
    expect(candidateFactsFindMany).not.toHaveBeenCalled();
    expect(generateApplicationWriting).not.toHaveBeenCalled();
  });

  it("rebuilds from current owner data before marking ready", async () => {
    findFirst.mockResolvedValue({
      jobId: "job-1",
      state: "NEEDS_REVIEW",
      submissionDestination: "https://job-boards.greenhouse.io/acme/jobs/42",
      job: { reviewQueueItems: [] },
    });
    await markApplicationReadyAction(form());
    expect(refreshApplicationPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "application-1",
        reviewed: true,
        userId: "user-1",
      }),
    );
  });

  it("blocks external confirmation when READY lacks a reviewed coherent packet", async () => {
    findFirst.mockResolvedValue({
      id: "application-1",
      userId: "user-1",
      state: "READY",
      submissionDestination: "https://job-boards.greenhouse.io/acme/jobs/42",
      submissionMechanism: "EXTERNAL_APPLICATION",
      submissionPayloadSnapshot: {},
    });
    await expect(confirmExternalApplicationAction(form())).rejects.toThrow(
      "Refresh and review",
    );
    expect(confirmExternalSubmission).not.toHaveBeenCalled();
  });

  it("retains explicit candidate confirmation for a reviewed packet", async () => {
    findFirst.mockResolvedValue({
      id: "application-1",
      userId: "user-1",
      state: "READY",
      submissionDestination: "https://job-boards.greenhouse.io/acme/jobs/42",
      submissionMechanism: "EXTERNAL_APPLICATION",
      submissionPayloadSnapshot: { packet: readyPacket },
    });
    const value = form();
    value.set("confirmed", "yes");
    await confirmExternalApplicationAction(value);
    expect(confirmExternalSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ confirmed: true, userId: "user-1" }),
    );
  });

  it("saves only typed application-specific fields for the owner", async () => {
    findFirst.mockResolvedValue({
      submissionPayloadSnapshot: {
        packet: packetForResolution({
          concept: "LANGUAGE_PROFICIENCY:english",
          disposition: "PROPOSED_FOR_CANDIDATE",
          reasonCode: "AI_GROUNDED_REFRAME_APPROVAL_REQUIRED",
          value: "Professional fluent",
        }),
      },
    });
    const value = form();
    value.set("identity:phone", "+55 51 5555 0100");
    value.set("answer:question-42", "Yes");
    value.set("identity:unsupported", "ignored");
    await saveApplicationOverridesAction(value);
    expect(saveApplicationOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "application-1",
        userId: "user-1",
        identity: [{ key: "phone", value: "+55 51 5555 0100" }],
        answers: [{ key: "question-42", value: "Yes" }],
      }),
    );
    expect(saveDirectCandidateKnowledgeBatch).toHaveBeenCalledWith([
      {
        userId: "user-1",
        concept: "LANGUAGE_PROFICIENCY:english",
        answer: { text: "Yes" },
        resolvesConflicts: false,
      },
    ]);
  });

  it("does not globalize an employer-specific answer", async () => {
    findFirst.mockResolvedValue({
      submissionPayloadSnapshot: {
        packet: packetForResolution({
          concept: null,
          disposition: "CANDIDATE_REQUIRED",
          reasonCode: "EMPLOYER_SPECIFIC_ANSWER",
          value: null,
        }),
      },
    });
    const value = form();
    value.set("answer:question-42", "Because this role is specific to Inter.");
    await saveApplicationOverridesAction(value);
    expect(saveApplicationOverrides).toHaveBeenCalledOnce();
    expect(saveDirectCandidateKnowledgeBatch).not.toHaveBeenCalled();
  });

  it("reconfirms a stale reusable value through candidate memory and refreshes the application", async () => {
    findFirst.mockResolvedValue({
      submissionPayloadSnapshot: {
        packet: packetForResolution({
          concept: "LANGUAGE_PROFICIENCY:english",
          disposition: "CANDIDATE_REQUIRED",
          reasonCode: "CANDIDATE_KNOWLEDGE_STALE",
          value: "Professional fluent",
        }),
      },
    });
    queryCandidateKnowledgeBatch.mockResolvedValue([
      {
        concept: "LANGUAGE_PROFICIENCY:english",
        status: "STALE_CONFIRMATION_REQUIRED",
        value: { proficiency: "Professional fluent" },
      },
    ]);
    const value = form();
    value.set("questionId", "question-42");
    await confirmCandidateKnowledgeAction(value);
    expect(queryCandidateKnowledgeBatch).toHaveBeenCalledWith({
      userId: "user-1",
      concepts: ["LANGUAGE_PROFICIENCY:english"],
    });
    expect(saveDirectCandidateKnowledgeBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "user-1",
        concept: "LANGUAGE_PROFICIENCY:english",
        answer: { proficiency: "Professional fluent" },
      }),
    ]);
    expect(refreshApplicationPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "application-1",
        userId: "user-1",
      }),
    );
  });

  it("passes only the explicit owner selection into packet synchronization", async () => {
    const value = form();
    value.set("candidateDocumentId", "document-b");
    await selectApplicationResumeAction(value);
    expect(refreshApplicationPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "application-1",
        userId: "user-1",
        resumeSelection: { kind: "CANDIDATE_DOCUMENT", id: "document-b" },
      }),
    );
  });
});
