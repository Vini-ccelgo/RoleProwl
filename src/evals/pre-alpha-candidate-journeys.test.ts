import { describe, expect, it, vi } from "vitest";
import type {
  AnalyticsProvider,
  ExternalIdentity,
  UserAccount,
  UserAccountRepository,
} from "@/core/contracts";
import type {
  AuthorizedApplicationAdapter,
  PreparedApplication,
} from "@/core/contracts/application-adapter";
import type { SourceCapabilitySet } from "@/core/types/capabilities";
import {
  decideApplication,
  type ApplicationDecisionInput,
} from "@/core/domain/applications/application-decision";
import {
  evaluateApplicationPolicy,
  type ApplicationPolicyContext,
  type CandidateApplicationPolicy,
} from "@/core/domain/applications/application-policy";
import {
  assertWorkflowTransition,
  workflowOutcomeForDecision,
  type ApplicationWorkflowStatus,
} from "@/core/domain/applications/application-workflow";
import { decideAnswerAuthority } from "@/core/domain/applications/answer-authority";
import { buildAuditedReviewMutation } from "@/core/domain/applications/review-queue";
import {
  type ApplicationSubmissionRecord,
  type ApplicationSubmissionRepository,
  SubmissionAttemptError,
} from "@/core/domain/applications/submission";
import {
  decideFactProposal,
  type ReviewableProposal,
} from "@/core/domain/candidate/fact-verification";
import {
  candidatePreferencesSchema,
  candidateProfileSchema,
} from "@/core/domain/candidate/truth-vault";
import {
  proposeFactsFromResumeText,
  requireOwnedCandidateDocument,
  validateResumeUpload,
} from "@/core/domain/candidate/resume-import";
import {
  claimCanPassReadiness,
  classifyGeneratedClaim,
} from "@/core/domain/claims/provenance";
import { decideJobDeduplication } from "@/core/domain/jobs/deduplication";
import { requireOwnedJobDisposition } from "@/core/domain/jobs/job-disposition";
import {
  matchCandidateToJob,
  type CandidateMatchSnapshot,
  type JobMatchSnapshot,
} from "@/core/domain/matching/match-job";
import { NotFoundError } from "@/core/errors/application-errors";
import { resolveIntegrationCapability } from "@/core/integrations/capability-registry";
import {
  assertOwnedResource,
  resolveUserAccount,
} from "@/features/accounts/resolve-user-account";
import { decideAndRecordApplication } from "@/features/applications/decide-and-record-application";
import { prepareAndMaybeSubmitApplication } from "@/features/applications/prepare-and-submit-application";
import {
  updateApplicationState,
  type ApplicationTrackerRepository,
} from "@/features/applications/update-application-state";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  deleteAccount,
  type AccountDeletionRepository,
} from "@/features/privacy/delete-account";
import { buildPortableAccountExport } from "@/features/privacy/account-export";
import { generateTailoredResume } from "@/features/resumes/tailored-resume";
import { generateApplicationWriting } from "@/features/writing/application-writing";
import { DeterministicAIProvider } from "@/integrations/ai/deterministic-ai-provider";
import { GreenhouseJobSource } from "@/integrations/jobs/greenhouse-job-source";

class JourneyUserRepository implements UserAccountRepository {
  readonly users = new Map<string, UserAccount>();

  async upsertIdentity(identity: ExternalIdentity) {
    const key = `${identity.provider}:${identity.externalId}`;
    const existing = this.users.get(key);
    const user: UserAccount = {
      id: existing?.id ?? `user-${this.users.size + 1}`,
      authProvider: identity.provider,
      externalAuthId: identity.externalId,
      email: identity.email,
      deletedAt: null,
    };
    this.users.set(key, user);
    return user;
  }

  async deactivateIdentity() {}
}

const openPolicy: CandidateApplicationPolicy = {
  allowedEmploymentTypes: [],
  allowedLocations: [],
  allowedRoleFamilies: [],
  autonomyLevel: "AUTO_SUBMIT_AUTHORIZED",
  companyBlacklist: [],
  dailyApplicationLimit: 10,
  excludedSeniorities: [],
  minimumOverallFit: 70,
  rejectAuthorizationConflict: true,
  requireRemote: false,
  salaryMinimum: null,
};

const cleanPolicyContext: ApplicationPolicyContext = {
  applicationsToday: 0,
  authorizationConflict: false,
  company: "Target Co",
  employmentType: "FULL_TIME",
  location: "Remote",
  overallFit: 92,
  remoteType: "REMOTE",
  roleFamily: "Software Engineering",
  salaryMaximum: 150_000,
  seniority: "SENIOR",
  sourceCanSubmit: true,
  submissionAuthorized: true,
  unresolvedSensitiveQuestions: 0,
  unsupportedClaims: 0,
};

function decisionInput(
  userId: string,
  questions: ApplicationDecisionInput["questions"] = [],
  unsupported = 0,
): ApplicationDecisionInput {
  return {
    claims: { total: 3, unsupported },
    fit: { overallFit: 92, scoringVersion: "match-v1.0" },
    job: { id: "job-1", company: "Target Co", title: "Engineer" },
    materials: { resumeVersionId: "resume-1", writingId: "writing-1" },
    policy: openPolicy,
    policyContext: cleanPolicyContext,
    questions,
    sourceCapability: { canSubmit: true, mode: "AUTHORIZED_API" },
    submissionAuthorized: true,
    userId,
  };
}

const candidateSnapshot: CandidateMatchSnapshot = {
  authorizationCountries: ["US"],
  clearances: null,
  educationLevels: ["BACHELOR"],
  experienceMonths: 72,
  industries: ["Technology"],
  languages: null,
  licenses: null,
  locationExclusions: [],
  preferredIndustries: ["Technology"],
  preferredLocations: ["Remote"],
  preferredRemoteTypes: ["REMOTE"],
  preferredRoleFamilies: ["Software Engineering"],
  requiredSalaryMinimum: 100_000,
  requiresSponsorship: false,
  roleFamilies: ["Software Engineering"],
  seniority: "SENIOR",
  skills: [
    { name: "TypeScript", proficiency: "ADVANCED", experienceMonths: 48 },
  ],
};

const strongJobSnapshot: JobMatchSnapshot = {
  authorizationCountries: ["US"],
  educationLevels: null,
  excludedSkills: null,
  industry: "Technology",
  locations: ["Remote"],
  maximumSalary: 150_000,
  minimumExperienceMonths: 36,
  preferredSkills: null,
  remoteType: "REMOTE",
  requiredClearance: null,
  requiredLanguages: null,
  requiredLicenses: null,
  requiredSkills: [
    {
      name: "TypeScript",
      minimumExperienceMonths: 24,
      minimumProficiency: "WORKING",
    },
  ],
  roleFamily: "Software Engineering",
  seniority: "SENIOR",
  sponsorshipAvailable: false,
};

const applicationPackage: PreparedApplication = {
  answers: { workAuthorization: "Authorized in the US" },
  destinationUrl: null,
  documents: [
    {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "target-co-engineer.docx",
      storageKey: "private/resume-1.docx",
    },
  ],
  generatedText: { coverLetter: "Verified candidate content." },
  idempotencyKey: "application:user-1:decision-1",
  reference: { source: "LEVER", externalId: "lever-1" },
  resumeVersionId: "resume-1",
};

class JourneyApplicationRepository implements ApplicationSubmissionRepository {
  record: ApplicationSubmissionRecord | null = null;
  preparedPackage: PreparedApplication | null = null;

  async prepare(
    input: Parameters<ApplicationSubmissionRepository["prepare"]>[0],
  ) {
    this.preparedPackage = input.package;
    this.record ??= {
      applicationId: "application-1",
      destinationUrl: input.package.destinationUrl,
      mechanism: input.capability.mode,
      package: input.package,
      state: input.capability.mode === "AUTHORIZED_API" ? "PREPARING" : "READY",
      userId: input.userId,
    };
    return this.record;
  }

  async markSubmitting() {
    this.record = { ...this.required(), state: "SUBMITTING" };
  }

  async markSubmitted() {
    this.record = { ...this.required(), state: "SUBMITTED" };
    return this.record;
  }

  private required() {
    if (!this.record) throw new Error("No application record exists.");
    return this.record;
  }
}

function authorizedAdapter(
  submit: AuthorizedApplicationAdapter["submit"] = async () => ({
    externalId: "receipt-1",
    submittedAt: new Date("2026-08-13T12:00:00.000Z"),
  }),
): AuthorizedApplicationAdapter {
  return {
    source: "LEVER",
    mode: "AUTHORIZED_API",
    getCapabilities: () =>
      new Set(["SUBMIT_APPLICATION"]) as SourceCapabilitySet,
    inspect: async () => ({ fields: [] }),
    submit,
    verifySubmission: async () => true,
  };
}

function submissionContext(repository: JourneyApplicationRepository) {
  return {
    adapter: authorizedAdapter(),
    capability: resolveIntegrationCapability({
      source: "LEVER",
      partnerSubmissionAuthorized: true,
    }),
    decisionId: "decision-1",
    fitSnapshot: { overallFit: 92 },
    jobId: "job-1",
    package: applicationPackage,
    policyResultSnapshot: { result: "ELIGIBLE_FOR_SUBMISSION" },
    repository,
    userId: "user-1",
    workflowRunId: "workflow-1",
  } as const;
}

describe("RP-031 synthetic candidate journeys", () => {
  it("journey 1: creates an account, validates onboarding facts, verifies a resume proposal, and reaches dashboard-ready state", async () => {
    const accounts = new JourneyUserRepository();
    const actor = await resolveUserAccount(
      {
        provider: "CLERK",
        externalId: "clerk-candidate-1",
        email: "candidate@example.test",
      },
      accounts,
    );
    const profile = candidateProfileSchema.parse({
      firstName: "Synthetic",
      lastName: "Candidate",
      professionalTitle: "Engineer",
      summary: "Builds reliable systems",
      phone: "",
      location: "Remote",
      websiteUrl: "",
      linkedInUrl: "",
    });
    const upload = validateResumeUpload({
      bytes: new TextEncoder().encode("%PDF-1.7 synthetic"),
      fileName: "resume.pdf",
      mimeType: "application/pdf",
    });
    const proposals = proposeFactsFromResumeText(
      "EXPERIENCE\nEngineer at Acme\nSKILLS\nTypeScript",
    );
    const proposal: ReviewableProposal = {
      id: "proposal-1",
      factType: proposals[0]!.factType,
      proposedValue: proposals[0]!.proposedValue,
      status: "PENDING",
      targetPath: proposals[0]!.targetPath,
      userId: actor.id,
    };
    const verified = decideFactProposal(proposal, actor.id, "ACCEPT");
    const preferences = candidatePreferencesSchema.parse({
      roleFamilies: ["Software Engineering"],
      industries: ["Technology"],
      remotePreference: "REMOTE",
      locationPreferences: ["Remote"],
      salaryMinimum: 100_000,
      salaryCurrency: "USD",
      employmentTypes: ["FULL_TIME"],
      seniorities: ["SENIOR"],
      maximumTravelPercent: 10,
      willingToRelocate: false,
      exclusions: [],
    });
    const dashboard = {
      candidateId: actor.id,
      verifiedFacts: verified.createCanonicalFact ? 1 : 0,
      activeDocuments: upload.sizeBytes > 0 ? 1 : 0,
      preferredRoles: preferences.roleFamilies.length,
    };

    expect(actor.id).toBe("user-1");
    expect(profile.professionalTitle).toBe("Engineer");
    expect(proposals).toHaveLength(2);
    expect(verified.status).toBe("ACCEPTED");
    expect(dashboard).toEqual({
      candidateId: "user-1",
      verifiedFacts: 1,
      activeDocuments: 1,
      preferredRoles: 1,
    });
  });

  it("journey 2: discovers a fixture job, normalizes it, deduplicates it, ranks it, and exposes fit evidence", async () => {
    const request = vi.fn(async () =>
      Response.json({
        jobs: [
          {
            id: 42,
            title: "Senior TypeScript Engineer",
            content: "<p>Build reliable TypeScript systems.</p>",
            absolute_url: "https://boards.greenhouse.io/acme/jobs/42",
            location: { name: "Remote" },
          },
        ],
      }),
    );
    const source = new GreenhouseJobSource(
      { boardToken: "acme", company: "Acme" },
      request,
    );
    const discovered = await source.discover({
      query: "TypeScript",
      limit: 10,
    });
    const normalized = await source.normalize(discovered.jobs[0]!);
    const duplicate = decideJobDeduplication(
      {
        id: "incoming",
        source: normalized.source.source,
        externalId: normalized.source.externalId,
        applicationUrl: normalized.source.applicationUrl,
        company: normalized.canonical.company,
        title: normalized.canonical.title,
        description: normalized.canonical.description,
        locations: normalized.canonical.locations,
        seniority: normalized.canonical.seniority,
        contentHash: "hash-new",
        postedAt: null,
        lastSeenAt: new Date(),
        status: "ACTIVE",
      },
      [
        {
          id: "canonical-42",
          source: "LEVER",
          externalId: "other-42",
          applicationUrl: "https://boards.greenhouse.io/acme/jobs/42",
          company: "Acme",
          title: "Senior TypeScript Engineer",
          description: "Build reliable TypeScript systems.",
          locations: ["Remote"],
          seniority: null,
          contentHash: "hash-old",
          postedAt: null,
          lastSeenAt: new Date(),
          status: "ACTIVE",
        },
      ],
    );
    const strong = matchCandidateToJob(candidateSnapshot, strongJobSnapshot);
    const weak = matchCandidateToJob(candidateSnapshot, {
      ...strongJobSnapshot,
      maximumSalary: 80_000,
      requiredSkills: [
        {
          name: "Rust",
          minimumExperienceMonths: 24,
          minimumProficiency: "ADVANCED",
        },
      ],
    });
    const ranking = [
      { id: "weak", fit: weak },
      { id: "strong", fit: strong },
    ].sort(
      (left, right) =>
        (right.fit.overallFit ?? -1) - (left.fit.overallFit ?? -1),
    );

    expect(discovered.jobs).toHaveLength(1);
    expect(normalized.canonical.description).toContain("TypeScript systems");
    expect(duplicate).toMatchObject({
      kind: "MATCH",
      canonicalJobId: "canonical-42",
      reason: "APPLICATION_URL",
    });
    expect(ranking[0]!.id).toBe("strong");
    expect(strong.strengths.some(({ code }) => code.includes("SKILL"))).toBe(
      true,
    );
    expect(weak.hardConflicts).not.toHaveLength(0);
  });

  it("journey 3: tailors grounded materials, creates an answer, validates every claim, and evaluates policy", async () => {
    const evidence = [
      {
        evidenceType: "work_experience",
        evidenceId: "work-1",
        evidenceField: "employer",
        label: "Verified work experience",
        searchableText: "Acme Senior Engineer TypeScript platform",
        snapshot: { employer: "Acme", title: "Senior Engineer" },
      },
    ] as const;
    const reference = {
      evidenceType: "work_experience",
      evidenceId: "work-1",
      evidenceField: "employer",
    };
    const resume = await generateTailoredResume({
      ai: new DeterministicAIProvider(() => ({
        headline: "Senior Engineer",
        summary: "Engineer with verified platform experience.",
        sections: [
          { heading: "Experience", bullets: ["Senior Engineer at Acme"] },
        ],
        claims: [
          {
            text: "Senior Engineer",
            classification: "DIRECT_FACT",
            assertions: [],
            sourceEvidence: [reference],
          },
          {
            text: "Engineer with verified platform experience.",
            classification: "SUPPORTED_REWRITE",
            assertions: [],
            sourceEvidence: [reference],
          },
          {
            text: "Senior Engineer at Acme",
            classification: "DIRECT_FACT",
            assertions: [{ kind: "EMPLOYER_NAME", value: "Acme" }],
            sourceEvidence: [reference],
          },
        ],
      })),
      correlationId: "journey-3-resume",
      evidence,
      job: {
        id: "job-1",
        company: "Target Co",
        title: "TypeScript Engineer",
        description: "Build TypeScript platforms",
        requirements: ["TypeScript"],
      },
      renderer: { render: async () => new Uint8Array([80, 75, 3, 4]) },
      repository: { save: async () => ({ id: "resume-1" }) },
      storage: { put: async () => undefined },
      userId: "user-1",
    });
    const answerText = "At Acme, I worked as a Senior Engineer.";
    const writing = await generateApplicationWriting({
      ai: new DeterministicAIProvider(() => ({
        text: answerText,
        claims: [
          {
            text: answerText,
            classification: "DIRECT_FACT",
            assertions: [{ kind: "EMPLOYER_NAME", value: "Acme" }],
            sourceEvidence: [reference],
          },
        ],
      })),
      company: "Target Co",
      correlationId: "journey-3-writing",
      evidence,
      jobContext: { title: "TypeScript Engineer" },
      preferences: { roleFamilies: ["Software Engineering"] },
      repository: { save: async () => ({ id: "writing-1" }) },
      targetJobId: "job-1",
      type: "MOTIVATION_RESPONSE",
      userId: "user-1",
    });
    const policy = evaluateApplicationPolicy(openPolicy, cleanPolicyContext);

    expect(resume.claims).toHaveLength(3);
    expect(
      resume.claims.every((claim) =>
        claimCanPassReadiness(claim.classification, claim.evidence.length),
      ),
    ).toBe(true);
    expect(writing.content).toBe(answerText);
    expect(writing.claims).toHaveLength(1);
    expect(policy.result).toBe("ELIGIBLE_FOR_SUBMISSION");
  });

  it("journey 4: routes consequential and sensitive questions to review, resolves one, and recomputes the decision", async () => {
    const consequential = decideAnswerAuthority({
      classification: "LEGAL_OR_CONSEQUENTIAL",
      answer: null,
    });
    const sensitive = decideAnswerAuthority({
      classification: "SENSITIVE_PERSONAL_DATA",
      answer: {
        memoryStatus: "FRESH",
        source: "EXPLICIT_CONSEQUENTIAL",
      },
    });
    const repository = {
      save: vi.fn(async () => ({
        id: "decision-review",
        reviewQueueItemId: "queue-1",
      })),
    };
    const first = await decideAndRecordApplication({
      decisionInput: decisionInput("user-1", [
        {
          classification: "LEGAL_OR_CONSEQUENTIAL",
          disposition: consequential.disposition,
          reasonCode: consequential.reasonCode,
        },
      ]),
      repository,
    });
    const resolution = buildAuditedReviewMutation({
      action: "APPROVED",
      current: { status: "PENDING", deferredUntil: null, editableDraft: null },
      note: "Candidate supplied a current authorization answer.",
    });
    const readyAnswer = decideAnswerAuthority({
      classification: "LEGAL_OR_CONSEQUENTIAL",
      answer: {
        memoryStatus: "FRESH",
        source: "EXPLICIT_CONSEQUENTIAL",
      },
    });
    const recomputed = decideApplication(
      decisionInput("user-1", [
        {
          classification: "LEGAL_OR_CONSEQUENTIAL",
          disposition: readyAnswer.disposition,
          reasonCode: readyAnswer.reasonCode,
        },
      ]),
    );

    expect(first.result).toBe("NEEDS_REVIEW");
    expect(first.reviewQueueItemId).toBe("queue-1");
    expect(sensitive).toMatchObject({
      handling: "NO_INFERENCE",
      disposition: "NEEDS_REVIEW",
    });
    expect(resolution.update.status).toBe("APPROVED");
    expect(recomputed.result).toBe("ELIGIBLE_FOR_SUBMISSION");
  });

  it("journey 5: moves an eligible workflow through a fake authorized adapter and preserves exact tracker content", async () => {
    const repository = new JourneyApplicationRepository();
    const analytics: AnalyticsProvider = { track: vi.fn() };
    const workflow: ApplicationWorkflowStatus[] = ["PENDING"];
    for (const next of [
      "PROCESSING",
      workflowOutcomeForDecision("ELIGIBLE_FOR_SUBMISSION"),
    ] as const) {
      assertWorkflowTransition(workflow.at(-1)!, next);
      workflow.push(next);
    }
    const submitted = await prepareAndMaybeSubmitApplication({
      ...submissionContext(repository),
      analytics,
    });
    assertWorkflowTransition(workflow.at(-1)!, "SUBMITTED");
    workflow.push("SUBMITTED");

    expect(submitted.state).toBe("SUBMITTED");
    expect(workflow).toEqual([
      "PENDING",
      "PROCESSING",
      "SUBMITTING",
      "SUBMITTED",
    ]);
    expect(repository.preparedPackage).toEqual(applicationPackage);
    expect(repository.record?.package.generatedText).toEqual(
      applicationPackage.generatedText,
    );
    expect(analytics.track).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "APPLICATION_SUBMITTED" }),
    );
  });

  it("journey 6: classifies a retryable provider error, retries idempotently, and reaches a final submitted state", async () => {
    const repository = new JourneyApplicationRepository();
    const submit = vi
      .fn<AuthorizedApplicationAdapter["submit"]>()
      .mockRejectedValueOnce(
        Object.assign(new Error("upstream failed"), { status: 503 }),
      )
      .mockResolvedValueOnce({
        externalId: "receipt-after-retry",
        submittedAt: new Date("2026-08-13T12:05:00.000Z"),
      });
    const context = {
      ...submissionContext(repository),
      adapter: authorizedAdapter(submit),
    };
    await expect(
      prepareAndMaybeSubmitApplication(context),
    ).rejects.toMatchObject({
      failureCode: "UPSTREAM_RETRYABLE",
      retryable: true,
    } satisfies Partial<SubmissionAttemptError>);
    const submitted = await prepareAndMaybeSubmitApplication(context);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submitted.state).toBe("SUBMITTED");
    expect(submitted.applicationId).toBe("application-1");
  });

  it("journey 7: rejects cross-user access to profile, job state, application, and file", async () => {
    expect(() => assertOwnedResource("user-a", "user-b")).toThrow(
      NotFoundError,
    );
    expect(() =>
      requireOwnedJobDisposition({ id: "state-b", userId: "user-b" }, "user-a"),
    ).toThrow(NotFoundError);

    const tracker: ApplicationTrackerRepository = {
      findState: async () => null,
      transition: async () => undefined,
    };
    await expect(
      updateApplicationState({
        applicationId: "application-b",
        next: "CLOSED",
        repository: tracker,
        userId: "user-a",
      }),
    ).rejects.toThrow(NotFoundError);
    expect(() =>
      requireOwnedCandidateDocument(
        { id: "document-b", storageKey: "private-b", userId: "user-b" },
        "user-a",
      ),
    ).toThrow(NotFoundError);
  });

  it("journey 8: blocks a deliberately unsupported claim from submission readiness", () => {
    const classification = classifyGeneratedClaim({
      assertions: [{ kind: "CREDENTIAL_NAME", value: "Invented PMP" }],
      evidence: [
        {
          evidenceType: "WORK_EXPERIENCE",
          evidenceId: "work-1",
          evidenceField: "record",
          snapshot: { employer: "Acme", title: "Engineer" },
        },
      ],
      intendedClassification: "DIRECT_FACT",
    });
    const decision = decideApplication(decisionInput("user-1", [], 1));

    expect(classification).toBe("UNSUPPORTED");
    expect(claimCanPassReadiness(classification, 1)).toBe(false);
    expect(decision.result).not.toBe("ELIGIBLE_FOR_SUBMISSION");
    expect(decision.reasons).toContain("UNSUPPORTED_CLAIM");
  });

  it("journey 9: rejects or reviews every policy edge and detects sponsorship conflict", () => {
    const strict: CandidateApplicationPolicy = {
      ...openPolicy,
      allowedRoleFamilies: ["Software Engineering"],
      autonomyLevel: "AUTO_SUBMIT_AUTHORIZED",
      companyBlacklist: ["Blocked Co"],
      dailyApplicationLimit: 2,
      excludedSeniorities: ["EXECUTIVE"],
      requireRemote: true,
      salaryMinimum: 120_000,
    };
    const cases = [
      [{ salaryMaximum: 100_000 }, "SALARY_BELOW_MINIMUM", "REJECT"],
      [{ seniority: "EXECUTIVE" }, "SENIORITY_EXCLUDED", "REJECT"],
      [{ remoteType: "HYBRID" }, "REMOTE_REQUIRED", "REJECT"],
      [{ company: "blocked co" }, "COMPANY_BLACKLISTED", "REJECT"],
      [{ authorizationConflict: true }, "AUTHORIZATION_CONFLICT", "REJECT"],
      [{ applicationsToday: 2 }, "DAILY_LIMIT_REACHED", "NEEDS_REVIEW"],
    ] as const;
    for (const [override, reason, result] of cases) {
      const evaluated = evaluateApplicationPolicy(strict, {
        ...cleanPolicyContext,
        ...override,
      });
      expect(evaluated.result).toBe(result);
      expect(evaluated.reasons).toContain(reason);
    }
    const sponsorship = matchCandidateToJob(
      {
        ...candidateSnapshot,
        authorizationCountries: ["CA"],
        requiresSponsorship: true,
      },
      strongJobSnapshot,
    );
    expect(sponsorship.hardConflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SPONSORSHIP_CONFLICT" }),
      ]),
    );
  });

  it("journey 10: exports inspectable data, deletes internal/private state, and makes the account inaccessible", async () => {
    const state = {
      user: { id: "user-1", email: "candidate@example.test" } as {
        id: string;
        email: string;
      } | null,
      documents: new Set(["documents/resume-1", "resumes/tailored-1"]),
      productEvents: [{ eventType: "JOB_VIEWED" }],
      deletionStatus: "PENDING",
    };
    const exported = buildPortableAccountExport({
      exportedAt: new Date("2026-08-13T13:00:00.000Z"),
      sections: {
        account: state.user,
        answers: [{ concept: "WORK_AUTHORIZATION" }],
        applications: [{ id: "application-1", state: "SUBMITTED" }],
        auditHistory: [{ action: "APPLICATION_SUBMITTED" }],
        candidate: { skills: ["TypeScript"] },
        generatedMaterials: { resumes: [{ id: "resume-1" }] },
        notifications: [],
        policy: openPolicy,
        productEvents: state.productEvents,
      },
    });
    const repository: AccountDeletionRepository = {
      begin: async () => ({
        requestId: "delete-1",
        externalAuthId: "clerk-1",
        storageKeys: [...state.documents],
      }),
      deleteRoleProwlData: async () => {
        state.user = null;
        state.productEvents = [];
      },
      markCleanupRequired: async () => {
        state.deletionStatus = "CLEANUP_REQUIRED";
      },
      markComplete: async () => {
        state.deletionStatus = "COMPLETE";
      },
    };
    const result = await deleteAccount({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      userId: "user-1",
      repository,
      storage: {
        put: async (key, data, contentType) => ({
          key,
          contentType,
          size: data.byteLength,
        }),
        get: async () => null,
        delete: async (key) => {
          state.documents.delete(key);
        },
      },
      identity: { deleteIdentity: async () => undefined },
    });

    expect(exported.data.account).toEqual({
      id: "user-1",
      email: "candidate@example.test",
    });
    expect(exported.data.productEvents).toEqual([{ eventType: "JOB_VIEWED" }]);
    expect(result.status).toBe("COMPLETE");
    expect(state).toMatchObject({
      user: null,
      productEvents: [],
      deletionStatus: "COMPLETE",
    });
    expect(state.documents.size).toBe(0);
    expect(() =>
      assertOwnedResource("user-1", state.user?.id ?? "deleted"),
    ).toThrow(NotFoundError);
  });
});
