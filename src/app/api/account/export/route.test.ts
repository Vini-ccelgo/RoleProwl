import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateBetaAccessError } from "@/core/errors/application-errors";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  exportAccountData: vi.fn(),
  requireAuthenticatedActor: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/accounts/require-authenticated-actor", () => ({
  requireAuthenticatedActor: mocks.requireAuthenticatedActor,
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({})),
}));
vi.mock("@/integrations/privacy/prisma-account-export", () => ({
  exportAccountData: mocks.exportAccountData,
}));
vi.mock("@/integrations/security/prisma-rate-limiter", () => ({
  PrismaRateLimiter: class {
    consume = mocks.consume;
  },
}));

import { GET } from "./route";

describe("account export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consume.mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 0,
    });
    mocks.exportAccountData.mockResolvedValue({ schemaVersion: "fixture" });
  });

  it("exports only the authenticated actor account", async () => {
    const response = await GET();
    expect(mocks.consume).toHaveBeenCalledWith("account-export", "user-1", {
      limit: 5,
      windowMs: 3_600_000,
    });
    expect(mocks.exportAccountData).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("enforces the actor-scoped export limit before reading data", async () => {
    mocks.consume.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 120,
    });
    const response = await GET();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(mocks.exportAccountData).not.toHaveBeenCalled();
  });

  it("returns a structured denial before exporting a non-invited account", async () => {
    mocks.requireAuthenticatedActor.mockRejectedValueOnce(
      new PrivateBetaAccessError(),
    );
    const response = await GET();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication is required",
    });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.exportAccountData).not.toHaveBeenCalled();
  });
});
