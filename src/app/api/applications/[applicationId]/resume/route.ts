import { NextResponse } from "next/server";
import { AuthorizationError } from "@/core/errors/application-errors";
import { applicationResumeSnapshot } from "@/core/domain/applications/application-resume";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { documentStorage } from "@/integrations/storage/document-storage";
import { databaseClient } from "@/lib/db/client";

export const runtime = "nodejs";

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]/gu, "_").slice(0, 180) || "resume";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  try {
    const actor = await requireAuthenticatedActor(currentAuthProvider());
    const { applicationId } = await context.params;
    const application = await databaseClient().application.findFirst({
      where: { id: applicationId, userId: actor.id },
      select: { documentsSnapshot: true },
    });
    if (!application)
      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 },
      );
    const resume = applicationResumeSnapshot(application.documentsSnapshot);
    if (!resume)
      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 },
      );
    const bytes = await documentStorage().get(resume.storageKey);
    if (!bytes)
      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 },
      );
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${safeFileName(resume.fileName)}"`,
        "content-length": String(bytes.byteLength),
        "content-type": resume.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
}
