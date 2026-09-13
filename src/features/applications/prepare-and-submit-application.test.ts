import type {
  AuthorizedApplicationAdapter,
  PreparedApplication,
} from "@/core/contracts/application-adapter";
import type { AnalyticsProvider } from "@/core/contracts/analytics-provider";
import type {
  ApplicationSubmissionRecord,
  ApplicationSubmissionRepository,
} from "@/core/domain/applications/submission";
import {
  resolveIntegrationCapability,
  type ResolvedIntegrationCapability,
} from "@/core/integrations/capability-registry";
import type { SourceCapabilitySet } from "@/core/types/capabilities";
import { describe, expect, it, vi } from "vitest";
import {
  confirmExternalSubmission,
  prepareAndMaybeSubmitApplication,
} from "./prepare-and-submit-application";

const applicationPackage: PreparedApplication = {
  idempotencyKey: "application:user-1:decision-1",
  reference: { source: "GREENHOUSE", externalId: "job-1" },
  destinationUrl: "https://boards.greenhouse.io/example/jobs/1",
  resumeVersionId: "resume-1",
  generatedText: { coverLetter: "Truthful letter" },
  answers: { name: "Candidate", authorized: true },
  documents: [
    {
      storageKey: "private/resume.docx",
      fileName: "resume.docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  ],
};

class MemoryRepository implements ApplicationSubmissionRepository {
  preparedInput:
    Parameters<ApplicationSubmissionRepository["prepare"]>[0] | null = null;
  record: ApplicationSubmissionRecord | null = null;
  confirmation:
    Parameters<ApplicationSubmissionRepository["markSubmitted"]>[3] | null =
    null;

  async prepare(
    input: Parameters<ApplicationSubmissionRepository["prepare"]>[0],
  ) {
    this.preparedInput = input;
    this.record = {
      applicationId: "application-1",
      destinationUrl: input.package.destinationUrl,
      mechanism: input.capability.mode,
      package: input.package,
      userId: input.userId,
      state:
        input.capability.mode === "AUTHORIZED_API"
          ? "PREPARING"
          : input.capability.mode === "UNSUPPORTED"
            ? "FAILED"
            : "READY",
    };
    return this.record;
  }

  async markSubmitting() {
    this.record = { ...this.required(), state: "SUBMITTING" };
  }

  async markSubmitted(
    _applicationId: string,
    _userId: string,
    _receipt: Parameters<ApplicationSubmissionRepository["markSubmitted"]>[2],
    confirmation: Parameters<
      ApplicationSubmissionRepository["markSubmitted"]
    >[3],
  ) {
    this.confirmation = confirmation;
    this.record = { ...this.required(), state: "SUBMITTED" };
    return this.record;
  }

  private required() {
    if (!this.record) throw new Error("No application was prepared");
    return this.record;
  }
}

function context(
  repository: MemoryRepository,
  capability: ResolvedIntegrationCapability,
) {
  return {
    capability,
    repository,
    userId: "user-1",
    jobId: "job-1",
    decisionId: "decision-1",
    workflowRunId: "run-1",
    fitSnapshot: { overallFit: 91 },
    policyResultSnapshot: { result: "ELIGIBLE_FOR_SUBMISSION" },
    package: applicationPackage,
  } as const;
}

function authorizedAdapter(): AuthorizedApplicationAdapter {
  const receipt = { externalId: "ats-42", submittedAt: new Date() };
  return {
    source: "LEVER",
    mode: "AUTHORIZED_API",
    inspect: vi.fn(async () => ({ fields: [] })),
    submit: vi.fn(async () => receipt),
    verifySubmission: vi.fn(async () => true),
    getCapabilities: () =>
      new Set(["SUBMIT_APPLICATION"]) as SourceCapabilitySet,
  };
}

describe("honest application submission", () => {
  it("preserves the complete package and stops ready at a public ATS", async () => {
    const repository = new MemoryRepository();
    const result = await prepareAndMaybeSubmitApplication({
      ...context(
        repository,
        resolveIntegrationCapability({
          source: "GREENHOUSE",
          partnerSubmissionAuthorized: false,
        }),
      ),
      adapter: null,
    });
    expect(result).toMatchObject({
      state: "READY",
      mechanism: "EXTERNAL_APPLICATION",
    });
    expect(repository.preparedInput?.package).toEqual(applicationPackage);
  });

  it("submits and verifies only through a matching authorized adapter", async () => {
    const repository = new MemoryRepository();
    const adapter = authorizedAdapter();
    const analytics: AnalyticsProvider = { track: vi.fn() };
    const result = await prepareAndMaybeSubmitApplication({
      analytics,
      ...context(
        repository,
        resolveIntegrationCapability({
          source: "LEVER",
          partnerSubmissionAuthorized: true,
        }),
      ),
      package: {
        ...applicationPackage,
        reference: { source: "LEVER", externalId: "job-1" },
      },
      adapter,
    });
    expect(result.state).toBe("SUBMITTED");
    expect(adapter.submit).toHaveBeenCalledOnce();
    expect(adapter.verifySubmission).toHaveBeenCalledOnce();
    expect(analytics.track).toHaveBeenCalledTimes(2);
    expect(analytics.track).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ eventType: "APPLICATION_PREPARED" }),
    );
    expect(analytics.track).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ eventType: "APPLICATION_SUBMITTED" }),
    );
  });

  it("fails closed when authorization exists but its adapter does not", async () => {
    const repository = new MemoryRepository();
    await expect(
      prepareAndMaybeSubmitApplication({
        ...context(
          repository,
          resolveIntegrationCapability({
            source: "LEVER",
            partnerSubmissionAuthorized: true,
          }),
        ),
        adapter: null,
      }),
    ).rejects.toThrow("No authorized submission adapter");
  });

  it("never invokes an adapter for a prohibited source", async () => {
    const repository = new MemoryRepository();
    await expect(
      prepareAndMaybeSubmitApplication({
        ...context(
          repository,
          resolveIntegrationCapability({
            source: "LINKEDIN",
            partnerSubmissionAuthorized: true,
          }),
        ),
        adapter: authorizedAdapter(),
      }),
    ).rejects.toThrow("Automation is prohibited");
    expect(repository.preparedInput).toBeNull();
  });

  it("records external submission only after explicit confirmation", async () => {
    const repository = new MemoryRepository();
    const application = await prepareAndMaybeSubmitApplication({
      ...context(
        repository,
        resolveIntegrationCapability({
          source: "GREENHOUSE",
          partnerSubmissionAuthorized: false,
        }),
      ),
      adapter: null,
    });
    await expect(
      confirmExternalSubmission({
        application,
        repository,
        userId: "user-1",
        confirmed: false,
        confirmedAt: new Date(),
      }),
    ).rejects.toThrow("explicit user confirmation");
    expect(
      await confirmExternalSubmission({
        application,
        repository,
        userId: "user-1",
        confirmed: true,
        confirmedAt: new Date(),
      }),
    ).toMatchObject({ state: "SUBMITTED" });
    expect(repository.confirmation).toBe("USER_CONFIRMED_EXTERNAL");
  });

  it("rejects external confirmation before READY or for another candidate", async () => {
    const repository = new MemoryRepository();
    const base: ApplicationSubmissionRecord = {
      applicationId: "application-1",
      destinationUrl: applicationPackage.destinationUrl,
      mechanism: "EXTERNAL_APPLICATION",
      package: applicationPackage,
      state: "PREPARING",
      userId: "user-1",
    };
    await expect(
      confirmExternalSubmission({
        application: base,
        repository,
        userId: "user-1",
        confirmed: true,
        confirmedAt: new Date(),
      }),
    ).rejects.toThrow("Only a ready external application");
    await expect(
      confirmExternalSubmission({
        application: { ...base, state: "READY" },
        repository,
        userId: "user-2",
        confirmed: true,
        confirmedAt: new Date(),
      }),
    ).rejects.toThrow("does not belong to this user");
    expect(repository.confirmation).toBeNull();
  });

  it("rejects insecure or credential-bearing external destinations", async () => {
    const capability = resolveIntegrationCapability({
      source: "GREENHOUSE",
      partnerSubmissionAuthorized: false,
    });
    for (const destinationUrl of [
      "http://example.com/apply",
      "https://user:secret@example.com/apply",
    ]) {
      await expect(
        prepareAndMaybeSubmitApplication({
          ...context(new MemoryRepository(), capability),
          package: { ...applicationPackage, destinationUrl },
          adapter: null,
        }),
      ).rejects.toThrow();
    }
  });
});
