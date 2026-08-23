import { describe, expect, it } from "vitest";
import {
  startApplication,
  type ApplicationStartRepository,
} from "./start-application";

class MemoryStartRepository implements ApplicationStartRepository {
  private readonly records = new Map<string, string>();

  async createOrGet(input: {
    readonly jobId: string;
    readonly userId: string;
  }) {
    const key = `${input.userId}:${input.jobId}`;
    const existing = this.records.get(key);
    if (existing)
      return {
        applicationId: existing,
        created: false,
        state: "PREPARING" as const,
      };
    const id = `application-${this.records.size + 1}`;
    this.records.set(key, id);
    return { applicationId: id, created: true, state: "PREPARING" as const };
  }
}

describe("durable application start", () => {
  it("returns the same owner-scoped application for a repeated request", async () => {
    const repository = new MemoryStartRepository();
    const input = { jobId: "job-1", repository, userId: "user-1" };
    const first = await startApplication(input);
    const repeated = await startApplication(input);
    expect(first).toEqual({
      applicationId: "application-1",
      created: true,
      state: "PREPARING",
    });
    expect(repeated).toEqual({ ...first, created: false });
  });

  it("does not share an application across candidates", async () => {
    const repository = new MemoryStartRepository();
    const first = await startApplication({
      jobId: "job-1",
      repository,
      userId: "user-1",
    });
    const other = await startApplication({
      jobId: "job-1",
      repository,
      userId: "user-2",
    });
    expect(other.applicationId).not.toBe(first.applicationId);
  });
});
