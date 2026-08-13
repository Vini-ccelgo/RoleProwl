import { describe, expect, it, vi } from "vitest";
import { requestApplicationWorkflow } from "./request-application-workflow";

describe("requestApplicationWorkflow", () => {
  it("uses one stable key for durable persistence and event delivery", async () => {
    const createOrGet = vi
      .fn()
      .mockResolvedValue({ id: "run-1", status: "PENDING" });
    const publish = vi.fn().mockResolvedValue(undefined);
    await requestApplicationWorkflow({
      decisionId: "decision-1",
      jobId: "job-1",
      repository: { createOrGet },
      userId: "user-1",
      workflow: { publish },
    });
    expect(createOrGet).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "application:user-1:decision-1",
      }),
    );
    expect(publish).toHaveBeenCalledWith({
      name: "application.requested",
      idempotencyKey: "application:user-1:decision-1",
      payload: { workflowRunId: "run-1" },
    });
  });

  it("reuses the same key on a duplicate request", async () => {
    const createOrGet = vi
      .fn()
      .mockResolvedValue({ id: "run-1", status: "PROCESSING" });
    const publish = vi.fn().mockResolvedValue(undefined);
    const request = {
      decisionId: "decision-1",
      jobId: "job-1",
      repository: { createOrGet },
      userId: "user-1",
      workflow: { publish },
    };
    await requestApplicationWorkflow(request);
    await requestApplicationWorkflow(request);
    expect(
      new Set(publish.mock.calls.map(([event]) => event.idempotencyKey)).size,
    ).toBe(1);
  });
});
