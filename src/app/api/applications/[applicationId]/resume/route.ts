import { NextResponse } from "next/server";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { documentStorage } from "@/integrations/storage/document-storage";
import { databaseClient } from "@/lib/db/client";

export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]/gu, "_").slice(0, 180) || "resume";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const { applicationId } = await context.params;
  const application = await databaseClient().application.findFirst({
    where: { id: applicationId, userId: actor.id },
    select: { documentsSnapshot: true },
  });
  if (!application)
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const documents = Array.isArray(application.documentsSnapshot)
    ? application.documentsSnapshot
    : [];
  const resume = documents
    .map(record)
    .find((document) => document?.kind === "RESUME");
  const storageKey = resume?.storageKey;
  const fileName = resume?.fileName;
  const contentType = resume?.contentType;
  if (
    typeof storageKey !== "string" ||
    typeof fileName !== "string" ||
    typeof contentType !== "string"
  )
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const bytes = await documentStorage().get(storageKey);
  if (!bytes)
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${safeFileName(fileName)}"`,
      "content-length": String(bytes.byteLength),
      "content-type": contentType,
      "x-content-type-options": "nosniff",
    },
  });
}
