export interface CanonicalApplicationResumeSnapshot {
  readonly kind: "RESUME";
  readonly fileName: string;
  readonly contentType: string;
  readonly storageKey: string;
}

type TailoredResume = {
  readonly id: string;
  readonly renderedFileName: string;
  readonly renderedContentType: string;
  readonly renderedStorageKey: string;
};

type CandidateDocument = {
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly storageKey: string;
};

export interface ApplicationResumeSelection {
  readonly document: CanonicalApplicationResumeSnapshot;
  readonly resumeVersionId: string | null;
  readonly packetSource: {
    readonly fileName: string;
    readonly contentType: string;
    readonly storageKey: string;
    readonly tailored: boolean;
  };
}

export type ExplicitApplicationResumeSelection =
  | { readonly kind: "CANDIDATE_DOCUMENT"; readonly id: string }
  | { readonly kind: "RESUME_VERSION"; readonly id: string };

export function selectApplicationResume(input: {
  readonly tailoredResume: TailoredResume | null;
  readonly candidateDocument: CandidateDocument | null;
}): ApplicationResumeSelection | null {
  const source = input.tailoredResume
    ? {
        contentType: input.tailoredResume.renderedContentType,
        fileName: input.tailoredResume.renderedFileName,
        resumeVersionId: input.tailoredResume.id,
        storageKey: input.tailoredResume.renderedStorageKey,
        tailored: true,
      }
    : input.candidateDocument
      ? {
          contentType: input.candidateDocument.mimeType,
          fileName: input.candidateDocument.originalFileName,
          resumeVersionId: null,
          storageKey: input.candidateDocument.storageKey,
          tailored: false,
        }
      : null;
  if (!source) return null;
  return {
    document: {
      kind: "RESUME",
      fileName: source.fileName,
      contentType: source.contentType,
      storageKey: source.storageKey,
    },
    resumeVersionId: source.resumeVersionId,
    packetSource: {
      fileName: source.fileName,
      contentType: source.contentType,
      storageKey: source.storageKey,
      tailored: source.tailored,
    },
  };
}

export function selectedApplicationResume(input: {
  readonly documentsSnapshot: unknown;
  readonly resumeVersionId: string | null;
}): ApplicationResumeSelection | null {
  const document = applicationResumeSnapshot(input.documentsSnapshot);
  if (!document) return null;
  return {
    document,
    resumeVersionId: input.resumeVersionId,
    packetSource: {
      fileName: document.fileName,
      contentType: document.contentType,
      storageKey: document.storageKey,
      tailored: input.resumeVersionId !== null,
    },
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function applicationResumeSnapshot(
  documents: unknown,
): CanonicalApplicationResumeSnapshot | null {
  if (!Array.isArray(documents)) return null;
  for (const value of documents) {
    const document = record(value);
    if (document?.kind !== "RESUME") continue;
    const fileName = document.fileName;
    const contentType = document.contentType;
    const storageKey = document.storageKey;
    if (
      typeof fileName === "string" &&
      fileName.trim() &&
      typeof contentType === "string" &&
      contentType.trim() &&
      typeof storageKey === "string" &&
      storageKey.trim()
    )
      return { kind: "RESUME", fileName, contentType, storageKey };
  }
  return null;
}

export function applicationResumeDownloadAvailable(
  documentsSnapshot: unknown,
  packetDocuments: unknown,
): boolean {
  const snapshot = applicationResumeSnapshot(documentsSnapshot);
  if (!snapshot || !Array.isArray(packetDocuments)) return false;
  return packetDocuments.some((value) => {
    const document = record(value);
    return (
      document?.kind === "RESUME" &&
      document.fileName === snapshot.fileName &&
      document.contentType === snapshot.contentType &&
      document.storageKey === snapshot.storageKey
    );
  });
}
