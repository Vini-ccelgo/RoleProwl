import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  resolveWorkspaceAdmission: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./require-authenticated-actor", () => ({
  resolveWorkspaceAdmission: mocks.resolveWorkspaceAdmission,
}));

import { requireWorkspacePageActor } from "./require-workspace-page-actor";

describe("workspace page actor resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects an unauthenticated page render instead of throwing authorization", async () => {
    mocks.resolveWorkspaceAdmission.mockResolvedValueOnce({
      status: "UNAUTHENTICATED",
    });

    await expect(requireWorkspacePageActor({} as never)).rejects.toThrow(
      "REDIRECT:/sign-in?redirect_url=/dashboard",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/sign-in?redirect_url=/dashboard",
    );
  });

  it("preserves the distinct private-beta redirect", async () => {
    mocks.resolveWorkspaceAdmission.mockResolvedValueOnce({
      status: "PRIVATE_BETA_DENIED",
    });

    await expect(requireWorkspacePageActor({} as never)).rejects.toThrow(
      "REDIRECT:/?private_beta=restricted",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/?private_beta=restricted");
  });

  it("returns an admitted actor", async () => {
    const actor = { id: "user-1", externalId: "clerk-1", email: null };
    mocks.resolveWorkspaceAdmission.mockResolvedValueOnce({
      status: "ALLOWED",
      actor,
    });

    await expect(requireWorkspacePageActor({} as never)).resolves.toBe(actor);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
