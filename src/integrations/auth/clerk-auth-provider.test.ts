import { describe, expect, it, vi } from "vitest";
import type { AuthProvider, AuthenticatedActor } from "@/core/contracts";
import {
  type RequestActorMemoizer,
  withRequestScopedActor,
} from "./clerk-auth-provider";

const memoizeWithinRequest: RequestActorMemoizer = <Result>(
  loader: () => Promise<Result>,
) => {
  let pending: Promise<Result> | undefined;
  return () => (pending ??= loader());
};

function provider(actor: AuthenticatedActor): AuthProvider {
  return { currentActor: vi.fn(async () => actor) };
}

describe("request-scoped Clerk actor resolution", () => {
  it("deduplicates equivalent actor resolution in one request", async () => {
    const underlying = provider({
      id: "roleprowl-user-a",
      externalId: "clerk-user-a",
      email: "synthetic-a@example.test",
    });
    const scoped = withRequestScopedActor(underlying, memoizeWithinRequest);

    const [layoutActor, pageActor] = await Promise.all([
      scoped.currentActor(),
      scoped.currentActor(),
    ]);

    expect(layoutActor).toEqual(pageActor);
    expect(underlying.currentActor).toHaveBeenCalledOnce();
  });

  it("does not share actor state between request-scoped providers", async () => {
    const requestA = withRequestScopedActor(
      provider({
        id: "roleprowl-user-a",
        externalId: "clerk-user-a",
        email: null,
      }),
      memoizeWithinRequest,
    );
    const requestB = withRequestScopedActor(
      provider({
        id: "roleprowl-user-b",
        externalId: "clerk-user-b",
        email: null,
      }),
      memoizeWithinRequest,
    );

    await expect(requestA.currentActor()).resolves.toMatchObject({
      id: "roleprowl-user-a",
    });
    await expect(requestB.currentActor()).resolves.toMatchObject({
      id: "roleprowl-user-b",
    });
  });
});
