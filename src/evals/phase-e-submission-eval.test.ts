import type {
  AuthorizedApplicationAdapter,
  PreparedApplication,
  SubmissionReceipt,
} from "@/core/contracts/application-adapter";
import type {
  ApplicationSubmissionRecord,
  ApplicationSubmissionRepository,
} from "@/core/domain/applications/submission";
import { resolveIntegrationCapability } from "@/core/integrations/capability-registry";
import type { SourceCapabilitySet } from "@/core/types/capabilities";
import { prepareAndMaybeSubmitApplication } from "@/features/applications/prepare-and-submit-application";
import { describe, expect, it, vi } from "vitest";

const capability = resolveIntegrationCapability({
  source: "LEVER",
  partnerSubmissionAuthorized: true,
});
const applicationPackage: PreparedApplication = {
  idempotencyKey: "application:user-1:decision-1",
  reference: { source: "LEVER", externalId: "posting-1" },
  destinationUrl: "https://jobs.lever.co/example/posting-1/apply",
  resumeVersionId: "resume-1",
  answers: { name: "Candidate" },
  generatedText: { coverLetter: "Evidence-backed text" },
  documents: [],
};

class IdempotentMemoryRepository implements ApplicationSubmissionRepository {
  record: ApplicationSubmissionRecord | null = null;

  async prepare(
    input: Parameters<ApplicationSubmissionRepository["prepare"]>[0],
  ) {
    this.record ??= {
      applicationId: "application-1",
      userId: input.userId,
      state: "PREPARING",
      destinationUrl: input.package.destinationUrl,
      mechanism: input.capability.mode,
      package: input.package,
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
    if (!this.record) throw new Error("Application not prepared");
    return this.record;
  }
}

function adapter(
  submit: AuthorizedApplicationAdapter["submit"],
): AuthorizedApplicationAdapter {
  return {
    source: "LEVER",
    mode: "AUTHORIZED_API",
    inspect: vi.fn(async () => ({ fields: [] })),
    submit,
    verifySubmission: vi.fn(async () => true),
    getCapabilities: () =>
      new Set(["SUBMIT_APPLICATION"]) as SourceCapabilitySet,
  };
}

function request(
  repository: IdempotentMemoryRepository,
  applicationAdapter: AuthorizedApplicationAdapter,
) {
  return {
    capability,
    adapter: applicationAdapter,
    repository,
    userId: "user-1",
    jobId: "job-1",
    decisionId: "decision-1",
    workflowRunId: "workflow-1",
    fitSnapshot: { overallFit: 90 },
    policyResultSnapshot: { result: "ELIGIBLE_FOR_SUBMISSION" },
    package: applicationPackage,
  } as const;
}

const receipt: SubmissionReceipt = {
  externalId: "lever-candidate-1",
  submittedAt: new Date("2026-08-14T00:00:00.000Z"),
};

describe("Phase E fake-adapter submission gate", () => {
  it("completes a successful mock submission without external I/O", async () => {
    const repository = new IdempotentMemoryRepository();
    const submit = vi.fn(async () => receipt);
    const result = await prepareAndMaybeSubmitApplication(
      request(repository, adapter(submit)),
    );
    expect(result.state).toBe("SUBMITTED");
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: applicationPackage.idempotencyKey,
      }),
    );
  });

  it("classifies a timeout as retryable and succeeds on retry", async () => {
    const repository = new IdempotentMemoryRepository();
    const timeout = new Error("request timed out");
    timeout.name = "AbortError";
    const submit = vi
      .fn<AuthorizedApplicationAdapter["submit"]>()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(receipt);
    const input = request(repository, adapter(submit));
    await expect(prepareAndMaybeSubmitApplication(input)).rejects.toMatchObject(
      {
        failureCode: "TIMEOUT",
        retryable: true,
      },
    );
    await expect(
      prepareAndMaybeSubmitApplication(input),
    ).resolves.toMatchObject({
      state: "SUBMITTED",
    });
  });

  it("does not submit again for a duplicate event after success", async () => {
    const repository = new IdempotentMemoryRepository();
    const submit = vi.fn(async () => receipt);
    const input = request(repository, adapter(submit));
    await prepareAndMaybeSubmitApplication(input);
    await prepareAndMaybeSubmitApplication(input);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it.each([
    [429, "RATE_LIMITED"],
    [500, "UPSTREAM_RETRYABLE"],
  ] as const)(
    "classifies HTTP %s as retryable",
    async (status, failureCode) => {
      const repository = new IdempotentMemoryRepository();
      const submit = vi.fn(async () => {
        throw { status };
      });
      await expect(
        prepareAndMaybeSubmitApplication(request(repository, adapter(submit))),
      ).rejects.toMatchObject({ failureCode, retryable: true });
    },
  );

  it("stops when source capability is removed immediately before submit", async () => {
    const repository = new IdempotentMemoryRepository();
    const submit = vi.fn(async () => receipt);
    await expect(
      prepareAndMaybeSubmitApplication({
        ...request(repository, adapter(submit)),
        resolveCurrentCapability: async () =>
          resolveIntegrationCapability({
            source: "LEVER",
            partnerSubmissionAuthorized: false,
          }),
      }),
    ).rejects.toThrow("not authorized");
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    [false, "Submission authority was withdrawn"],
    [true, "Submission requires review"],
  ] as const)(
    "stops when current user policy changes (review=%s)",
    async (requiresReview, expected) => {
      const repository = new IdempotentMemoryRepository();
      const submit = vi.fn(async () => receipt);
      await expect(
        prepareAndMaybeSubmitApplication({
          ...request(repository, adapter(submit)),
          revalidateAuthority: async () => ({
            allowed: false,
            requiresReview,
            reason: "POLICY_CHANGED",
          }),
        }),
      ).rejects.toThrow(expected);
      expect(submit).not.toHaveBeenCalled();
    },
  );

  it("classifies an unrecognized adapter error as permanent", async () => {
    const repository = new IdempotentMemoryRepository();
    const submit = vi.fn(async () => {
      throw new Error("invalid application payload");
    });
    await expect(
      prepareAndMaybeSubmitApplication(request(repository, adapter(submit))),
    ).rejects.toMatchObject({
      failureCode: "PERMANENT_FAILURE",
      retryable: false,
    });
  });
});
