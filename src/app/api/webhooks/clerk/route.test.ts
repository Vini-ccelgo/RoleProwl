import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deactivateIdentity: vi.fn(),
  logger: { log: vi.fn() },
  resolveUserAccount: vi.fn(),
  verifyWebhook: vi.fn(),
}));

vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: mocks.verifyWebhook,
}));
vi.mock("@/features/accounts/resolve-user-account", () => ({
  resolveUserAccount: mocks.resolveUserAccount,
}));
vi.mock("@/integrations/auth/clerk-webhook", () => ({
  identityFromClerkUser: vi.fn(() => ({
    email: "synthetic@example.test",
    provider: "CLERK",
    subject: "user_synthetic",
  })),
}));
vi.mock("@/integrations/auth/prisma-user-account-repository", () => ({
  PrismaUserAccountRepository: class {
    deactivateIdentity = mocks.deactivateIdentity;
  },
}));
vi.mock("@/lib/logging/logger", () => ({ logger: mocks.logger }));

import { POST } from "./route";

function webhookRequest() {
  return new Request("https://roleprowl.example.test/api/webhooks/clerk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "fixture" }),
  });
}

describe("Clerk webhook route", () => {
  beforeEach(() => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = "whsec_fixture";
  });

  afterEach(() => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    vi.clearAllMocks();
  });

  it("fails closed when the signing secret is absent", async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;

    const response = await POST(webhookRequest() as never);

    expect(response.status).toBe(503);
    expect(mocks.verifyWebhook).not.toHaveBeenCalled();
  });

  it("verifies and processes an expected identity event", async () => {
    mocks.verifyWebhook.mockResolvedValue({
      type: "user.created",
      data: { id: "user_synthetic" },
    });

    const response = await POST(webhookRequest() as never);

    expect(response.status).toBe(200);
    expect(mocks.verifyWebhook).toHaveBeenCalledOnce();
    expect(mocks.resolveUserAccount).toHaveBeenCalledOnce();
  });

  it("returns a non-2xx response when verification fails", async () => {
    mocks.verifyWebhook.mockRejectedValue(new Error("invalid signature"));

    const response = await POST(webhookRequest() as never);

    expect(response.status).toBe(400);
    expect(mocks.resolveUserAccount).not.toHaveBeenCalled();
  });
});
