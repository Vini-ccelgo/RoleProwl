import { NextResponse } from "next/server";
import {
  ApplicationError,
  AuthorizationError,
  ValidationError,
} from "@/core/errors/application-errors";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { deleteAccount } from "@/features/privacy/delete-account";
import { ClerkIdentityManager } from "@/integrations/auth/clerk-identity-manager";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { PrismaAccountDeletionRepository } from "@/integrations/privacy/prisma-account-deletion-repository";
import { documentStorage } from "@/integrations/storage/document-storage";
import {
  assertContentType,
  assertMutationRequestIsSameOrigin,
} from "@/lib/security/request-security";

export async function POST(request: Request) {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    assertMutationRequestIsSameOrigin(request);
    assertContentType(request, "application/json");
    const body = (await request.json()) as { confirmation?: unknown };
    const result = await deleteAccount({
      userId: actor.id,
      confirmation:
        typeof body.confirmation === "string" ? body.confirmation : "",
      repository: new PrismaAccountDeletionRepository(),
      storage: documentStorage(),
      identity: new ClerkIdentityManager(),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ValidationError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: "A valid deletion request is required." },
        { status: 400 },
      );
    if (error instanceof ApplicationError)
      return NextResponse.json(
        { error: "The account could not be deleted." },
        { status: 500 },
      );
    return NextResponse.json(
      { error: "The account could not be deleted." },
      { status: 500 },
    );
  }
}
