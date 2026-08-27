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
import { PrismaCandidateDocumentDeletion } from "@/integrations/candidate/prisma-candidate-document-deletion";
import {
  interpretDocumentDeletionFailure,
  type DocumentDeletionResult,
} from "@/features/candidate/document-deletion-protocol";

function structuredDeletionFailure(
  error: unknown,
): Exclude<DocumentDeletionResult, { kind: "DELETED" | "FAILED" }> | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    applications?: unknown;
    confirmationCode?: unknown;
    consequences?: unknown;
    message?: unknown;
    protocolKind?: unknown;
    referenceCode?: unknown;
  };
  if (typeof candidate.message !== "string") return null;
  const consequenceRecord =
    candidate.consequences &&
    typeof candidate.consequences === "object" &&
    !Array.isArray(candidate.consequences)
      ? (candidate.consequences as Record<string, unknown>)
      : {};
  const parsed = interpretDocumentDeletionFailure(
    candidate.protocolKind === "CANDIDATE_DOCUMENT_DELETION_CONFIRMATION"
      ? {
          ...consequenceRecord,
          code: candidate.confirmationCode,
          error: candidate.message,
        }
      : candidate.protocolKind === "CANDIDATE_DOCUMENT_APPLICATION_REFERENCE"
        ? {
            applications: candidate.applications,
            code: candidate.referenceCode,
            error: candidate.message,
          }
        : null,
  );
  return parsed.kind === "FAILED" ? null : parsed;
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    assertMutationRequestIsSameOrigin(request);
    const { documentId } = await context.params;
    let confirmDeletion = false;
    try {
      const body = (await request.json()) as { confirmDeletion?: unknown };
      confirmDeletion = body.confirmDeletion === true;
    } catch {
      // The initial DELETE request intentionally has no body.
    }
    await new PrismaCandidateDocumentDeletion().delete({
      confirmDeletion,
      documentId,
      userId: actor.id,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const structuredFailure = structuredDeletionFailure(error);
    if (structuredFailure) {
      if (structuredFailure.kind === "CONFIRMATION_REQUIRED")
        return NextResponse.json(
          {
            error: structuredFailure.message,
            code: "DOCUMENT_DELETION_CONFIRMATION_REQUIRED",
            ...structuredFailure.consequences,
          },
          { status: 409 },
        );
      return NextResponse.json(
        {
          error: structuredFailure.message,
          code: "SUBMITTED_APPLICATION_REFERENCES",
          applications: structuredFailure.applications,
        },
        { status: 409 },
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof NotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
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
