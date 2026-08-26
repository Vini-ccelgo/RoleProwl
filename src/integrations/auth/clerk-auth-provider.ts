import "server-only";
import { currentUser } from "@clerk/nextjs/server";
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
      if (isDeletedClerkUserError(error)) return null;
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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isDeletedClerkUserError(error: unknown) {
  const candidate = record(error);
  return Boolean(
    candidate?.clerkError === true &&
    candidate.code === "api_response_error" &&
    candidate.status === 404 &&
    Array.isArray(candidate.errors) &&
    candidate.errors.some(
      (item) => record(item)?.code === "resource_not_found",
    ),
  );
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
