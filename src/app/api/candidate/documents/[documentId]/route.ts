import { NextResponse } from "next/server";
import {
  ApplicationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from "@/core/errors/application-errors";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { assertMutationRequestIsSameOrigin } from "@/lib/security/request-security";
import {
  AcceptedFactsDeleteConfirmationRequiredError,
  PrismaCandidateDocumentDeletion,
} from "@/integrations/candidate/prisma-candidate-document-deletion";
import {
  interpretDocumentDeletionFailure,
  type DocumentDeletionResult,
} from "@/features/candidate/document-deletion-protocol";

function applicationReferenceFailure(
  error: unknown,
): Extract<DocumentDeletionResult, { kind: "APPLICATION_BLOCKER" }> | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    applications?: unknown;
    message?: unknown;
    protocolKind?: unknown;
    referenceCode?: unknown;
  };
  if (
    candidate.protocolKind !== "CANDIDATE_DOCUMENT_APPLICATION_REFERENCE" ||
    typeof candidate.message !== "string"
  )
    return null;
  const parsed = interpretDocumentDeletionFailure({
    applications: candidate.applications,
    code: candidate.referenceCode,
    error: candidate.message,
  });
  return parsed.kind === "APPLICATION_BLOCKER" ? parsed : null;
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    assertMutationRequestIsSameOrigin(request);
    const { documentId } = await context.params;
    let confirmAcceptedFacts = false;
    try {
      const body = (await request.json()) as { confirmAcceptedFacts?: unknown };
      confirmAcceptedFacts = body.confirmAcceptedFacts === true;
    } catch {
      // The initial DELETE request intentionally has no body.
    }
    await new PrismaCandidateDocumentDeletion().delete({
      confirmAcceptedFacts,
      documentId,
      userId: actor.id,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const applicationReference = applicationReferenceFailure(error);
    if (applicationReference)
      return NextResponse.json(
        {
          error: applicationReference.message,
          code: applicationReference.code,
          applications: applicationReference.applications,
        },
        { status: 409 },
      );
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof NotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof AcceptedFactsDeleteConfirmationRequiredError)
      return NextResponse.json(
        {
          error: error.message,
          code: error.confirmationCode,
          factCount: error.factCount,
        },
        { status: 409 },
      );
    if (error instanceof ConflictError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 },
      );
    if (error instanceof ApplicationError) {
      return NextResponse.json(
        {
          error:
            error.code === "VALIDATION"
              ? error.message
              : "The document could not be deleted.",
          code: error.code,
        },
        { status: error.code === "VALIDATION" ? 400 : 500 },
      );
    }
    return NextResponse.json(
      { error: "The document could not be deleted." },
      { status: 500 },
    );
  }
}
