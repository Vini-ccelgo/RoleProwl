import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateBetaAccessError } from "@/core/errors/application-errors";

const { findFirst, get, requireAuthenticatedActor } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  get: vi.fn(),
  requireAuthenticatedActor: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/accounts/require-authenticated-actor", () => ({
  requireAuthenticatedActor,
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({})),
}));
vi.mock("@/lib/db/client", () => ({
  databaseClient: vi.fn(() => ({ application: { findFirst } })),
}));
vi.mock("@/integrations/storage/document-storage", () => ({
  documentStorage: vi.fn(() => ({ get })),
}));

import { GET } from "./route";

describe("application résumé download", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retrieves only an owner-scoped snapshot key without exposing it", async () => {
    findFirst.mockResolvedValue({
      documentsSnapshot: [
        {
          kind: "RESUME",
          fileName: "Avery résumé.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/private-key",
        },
      ],
    });
    get.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    const response = await GET(new Request("https://roleprowl.test"), {
      params: Promise.resolve({ applicationId: "application-1" }),
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "application-1", userId: "user-1" },
      }),
    );
    expect(get).toHaveBeenCalledWith("candidate-documents/private-key");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).not.toContain(
      "private-key",
    );
  });

  it("downloads a canonical tailored résumé snapshot", async () => {
    findFirst.mockResolvedValue({
      documentsSnapshot: [
        {
          kind: "RESUME",
          fileName: "tailored.docx",
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          storageKey: "resume-versions/tailored-key",
        },
      ],
    });
    get.mockResolvedValue(new Uint8Array([80, 75, 3, 4]));
    const response = await GET(new Request("https://roleprowl.test"), {
      params: Promise.resolve({ applicationId: "application-tailored" }),
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "application-tailored", userId: "user-1" },
      }),
    );
    expect(get).toHaveBeenCalledWith("resume-versions/tailored-key");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("conceals a missing or foreign application", async () => {
    findFirst.mockResolvedValue(null);
    const response = await GET(new Request("https://roleprowl.test"), {
      params: Promise.resolve({ applicationId: "foreign" }),
    });
    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("returns a safe 404 for a malformed legacy snapshot without touching storage", async () => {
    findFirst.mockResolvedValue({
      documentsSnapshot: [
        {
          fileName: "legacy.pdf",
          contentType: "application/pdf",
          storageKey: "candidate-documents/legacy",
        },
      ],
    });
    const response = await GET(new Request("https://roleprowl.test"), {
      params: Promise.resolve({ applicationId: "legacy" }),
    });
    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("denies a non-invited authenticated candidate before ownership or storage lookup", async () => {
    requireAuthenticatedActor.mockRejectedValueOnce(
      new PrivateBetaAccessError(),
    );
    const response = await GET(new Request("https://roleprowl.test"), {
      params: Promise.resolve({ applicationId: "application-1" }),
    });
    expect(response.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
});
