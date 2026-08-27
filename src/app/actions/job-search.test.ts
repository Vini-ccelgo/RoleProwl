import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
  findPreferences: vi.fn(),
  runDiscovery: vi.fn(),
  transaction: vi.fn(),
  updateSearchState: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/accounts/require-authenticated-actor", () => ({
  requireAuthenticatedActor: vi.fn(async () => ({ id: "candidate-1" })),
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({})),
}));
vi.mock("@/features/jobs/job-search-rate-limit", () => ({
  checkManualJobSearchRateLimit: mocks.consumeRateLimit,
}));
vi.mock("@/features/jobs/manual-discovery", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/jobs/manual-discovery")>();
  return { ...original, runManualDiscovery: mocks.runDiscovery };
});
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({
    candidatePreferences: { findUnique: mocks.findPreferences },
    jobSearchState: { update: mocks.updateSearchState },
    $transaction: mocks.transaction,
  })),
}));

import { runJobSearchAction } from "./job-search";

describe("candidate-directed job-search action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GREENHOUSE_BOARDS_JSON = JSON.stringify([
      { boardToken: "synthetic_board", company: "Synthetic Co" },
    ]);
  });

  it("rejects missing role criteria before consuming quota or claiming a run", async () => {
    mocks.findPreferences.mockResolvedValue({
      roleFamilies: [],
      locationPreferences: [],
    });

    await expect(runJobSearchAction()).resolves.toEqual({
      status: "error",
      message:
        "Add at least one role family in Job preferences before starting candidate-directed discovery.",
    });
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.runDiscovery).not.toHaveBeenCalled();
  });

  it("passes trimmed role and optional location criteria into discovery", async () => {
    mocks.findPreferences.mockResolvedValue({
      roleFamilies: [" Platform Engineering "],
      locationPreferences: [" Remote "],
    });
    mocks.consumeRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 5,
      retryAfterSeconds: 3600,
    });
    mocks.transaction.mockImplementation(
      async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({
          $executeRaw: vi.fn(),
          jobSearchState: {
            findUnique: vi.fn(async () => null),
            upsert: vi.fn(),
          },
        }),
    );
    mocks.runDiscovery.mockResolvedValue({
      discoveredCount: 2,
      newCount: 1,
      sourceFailureCount: 0,
      discoveryDurationMs: 1,
      ingestionDurationMs: 1,
    });

    await expect(runJobSearchAction()).resolves.toMatchObject({
      status: "success",
      discoveredCount: 2,
      newCount: 1,
    });
    expect(mocks.runDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { query: "Platform Engineering", location: "Remote" },
      }),
    );
    expect(mocks.updateSearchState).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "candidate-1" },
      }),
    );
  });
});
