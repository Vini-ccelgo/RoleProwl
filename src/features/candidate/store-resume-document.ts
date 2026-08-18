import { createHash } from "node:crypto";
import type { ObjectStorageProvider } from "@/core/contracts/object-storage-provider";
import type { ValidatedResume } from "@/core/domain/candidate/resume-import";
import { IntegrationError } from "@/core/errors/application-errors";

export async function storeAndRetrieveResume(
  storage: ObjectStorageProvider,
  resume: ValidatedResume,
  onStage?: (stage: "storage_write" | "storage_retrieval") => void,
) {
  onStage?.("storage_write");
  await storage.put(resume.storageKey, resume.bytes, resume.mimeType);
  onStage?.("storage_retrieval");
  const storedBytes = await storage.get(resume.storageKey);
  if (!storedBytes)
    throw new IntegrationError(
      "The stored document could not be retrieved for extraction.",
    );
  const storedHash = createHash("sha256").update(storedBytes).digest("hex");
  if (storedHash !== resume.contentHash)
    throw new IntegrationError(
      "The stored document failed the extraction integrity check.",
    );
  return storedBytes;
}
