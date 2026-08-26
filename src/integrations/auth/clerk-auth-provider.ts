import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { cache } from "react";
import type { AuthProvider, AuthenticatedActor } from "@/core/contracts";
import { resolveUserAccount } from "@/features/accounts/resolve-user-account";
import { isClerkConfigured } from "@/lib/auth/config";
import { PrismaUserAccountRepository } from "./prisma-user-account-repository";

export class ClerkAuthProvider implements AuthProvider {
  constructor(
    private readonly repository = new PrismaUserAccountRepository(),
  ) {}

  async currentActor(): Promise<AuthenticatedActor | null> {
    if (!isClerkConfigured()) return null;

    let clerkUser: Awaited<ReturnType<typeof currentUser>>;
    try {
      clerkUser = await currentUser();
    } catch (error) {
      if (
        isClerkAPIResponseError(error) &&
        error.status === 404 &&
        error.errors.some((item) => item.code === "resource_not_found")
      )
        return null;
      throw error;
    }
    if (!clerkUser) return null;

    const email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      null;

    return resolveUserAccount(
      { provider: "CLERK", externalId: clerkUser.id, email },
      this.repository,
    );
  }
}

export type RequestActorMemoizer = <Result>(
  loader: () => Promise<Result>,
) => () => Promise<Result>;

export function withRequestScopedActor(
  provider: AuthProvider,
  memoize: RequestActorMemoizer = (loader) => cache(loader),
): AuthProvider {
  return { currentActor: memoize(() => provider.currentActor()) };
}

const requestScopedClerkAuthProvider = withRequestScopedActor(
  new ClerkAuthProvider(),
);

export function currentAuthProvider(): AuthProvider {
  return requestScopedClerkAuthProvider;
}
