import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthorizationError,
  ValidationError,
} from "@/core/errors/application-errors";

const mocks = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  documentStorage: vi.fn(() => ({ kind: "storage" })),
  requireAuthenticatedActor: vi.fn(async () => ({ id: "server-user" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/accounts/require-authenticated-actor", () => ({
  requireAuthenticatedActor: mocks.requireAuthenticatedActor,
}));
vi.mock("@/features/privacy/delete-account", () => ({
  deleteAccount: mocks.deleteAccount,
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({ kind: "auth" })),
}));
vi.mock("@/integrations/auth/clerk-identity-manager", () => ({
  ClerkIdentityManager: class {},
}));
vi.mock("@/integrations/privacy/prisma-account-deletion-repository", () => ({
  PrismaAccountDeletionRepository: class {},
}));
vi.mock("@/integrations/storage/document-storage", () => ({
  documentStorage: mocks.documentStorage,
}));

import { POST } from "./route";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://roleprowl.test/api/account/delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://roleprowl.test",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("account deletion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteAccount.mockResolvedValue({ status: "COMPLETE" });
  });

  it("uses only the authenticated server actor as deletion authority", async () => {
    const response = await POST(
      request({
        confirmation: "DELETE ROLEPROWL ACCOUNT",
        userId: "forged-client-user",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "COMPLETE" });
    expect(mocks.deleteAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "server-user",
        confirmation: "DELETE ROLEPROWL ACCOUNT",
      }),
    );
  });

  it("preserves cleanup-required status for the browser transport", async () => {
    mocks.deleteAccount.mockResolvedValueOnce({ status: "CLEANUP_REQUIRED" });
    const response = await POST(request({ confirmation: "confirmed" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "CLEANUP_REQUIRED",
    });
  });

  it("rejects unauthenticated callers before deletion", async () => {
    mocks.requireAuthenticatedActor.mockRejectedValueOnce(
      new AuthorizationError("Authentication is required"),
    );
    const response = await POST(request({ confirmation: "confirmed" }));

    expect(response.status).toBe(401);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests before deletion", async () => {
    const response = await POST(
      request(
        { confirmation: "confirmed" },
        { origin: "https://attacker.test" },
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("returns validation failures without exposing another error class", async () => {
    mocks.deleteAccount.mockRejectedValueOnce(
      new ValidationError("Type the exact confirmation."),
    );
    const response = await POST(request({ confirmation: "wrong" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Type the exact confirmation.",
    });
  });
});
