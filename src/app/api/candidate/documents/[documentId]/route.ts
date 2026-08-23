import { NextResponse } from "next/server";
import {
  ApplicationError,
  AuthorizationError,
} from "@/core/errors/application-errors";
import { requireOwnedCandidateDocument } from "@/core/domain/candidate/resume-import";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { documentStorage } from "@/integrations/storage/document-storage";
import { databaseClient } from "@/lib/db/client";
import { assertMutationRequestIsSameOrigin } from "@/lib/security/request-security";
import { invalidateReadyApplicationPackets } from "@/integrations/applications/invalidate-application-packets";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    assertMutationRequestIsSameOrigin(request);
    const { documentId } = await context.params;
    const db = databaseClient();
    const document = await db.candidateDocument.findFirst({
      where: { id: documentId, userId: actor.id },
      select: { id: true, storageKey: true, userId: true },
    });
    let ownedDocument;
    try {
      ownedDocument = requireOwnedCandidateDocument(document, actor.id);
    } catch {
      return NextResponse.json(
        { error: "The requested document was not found." },
        { status: 404 },
      );
    }
    await documentStorage().delete(ownedDocument.storageKey);
    await db.candidateDocument.delete({ where: { id: ownedDocument.id } });
    await invalidateReadyApplicationPackets(db, actor.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ApplicationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "The document could not be deleted." },
      { status: 500 },
    );
  }
}
