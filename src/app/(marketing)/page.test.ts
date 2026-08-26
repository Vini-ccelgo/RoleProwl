import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveWorkspaceAdmission, databaseClient } = vi.hoisted(() => ({
  resolveWorkspaceAdmission: vi.fn(async () => ({
    status: "UNAUTHENTICATED" as const,
  })),
  databaseClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/accounts/require-authenticated-actor", () => ({
  resolveWorkspaceAdmission,
}));
vi.mock("@/integrations/auth/clerk-auth-provider", () => ({
  currentAuthProvider: vi.fn(() => ({})),
}));
vi.mock("@/lib/db/client", () => ({ databaseClient }));

import HomePage from "./page";

describe("public Home account deletion state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders deletion completion as unauthenticated without provisioning workspace data", async () => {
    const markup = renderToStaticMarkup(
      await HomePage({
        searchParams: Promise.resolve({ account_deleted: "1" }),
      }),
    );
    expect(markup).toContain(
      "Your RoleProwl account and stored candidate data were deleted.",
    );
    expect(markup).toContain("Start Your Search");
    expect(databaseClient).not.toHaveBeenCalled();
  });

  it("does not represent cleanup-required deletion as complete", async () => {
    const markup = renderToStaticMarkup(
      await HomePage({
        searchParams: Promise.resolve({ account_deletion_pending: "1" }),
      }),
    );
    expect(markup).toContain("Account deletion requires cleanup");
    expect(markup).toContain("has not reported the deletion as complete");
    expect(markup).not.toContain(
      "Your RoleProwl account and stored candidate data were deleted.",
    );
  });
});
