export const DOCUMENT_DELETION_CONFIRMATION_REQUIRED =
  "DOCUMENT_DELETION_CONFIRMATION_REQUIRED";

export interface DocumentDeletionConsequences {
  readonly acceptedFactCount: number;
  readonly fileName: string;
  readonly preSubmissionApplicationCount: number;
  readonly retainedHistoricalApplicationCount: number;
}

export type DocumentDeletionResult =
  | { readonly kind: "DELETED" }
  | {
      readonly consequences: DocumentDeletionConsequences;
      readonly kind: "CONFIRMATION_REQUIRED";
      readonly message: string;
    }
  | { readonly kind: "FAILED"; readonly message: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function message(value: Record<string, unknown>) {
  return typeof value.error === "string" && value.error.trim()
    ? value.error
    : "The document could not be deleted.";
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function consequences(value: Record<string, unknown>) {
  return typeof value.fileName === "string" &&
    value.fileName.trim() &&
    nonnegativeInteger(value.acceptedFactCount) &&
    nonnegativeInteger(value.preSubmissionApplicationCount) &&
    nonnegativeInteger(value.retainedHistoricalApplicationCount)
    ? {
        acceptedFactCount: value.acceptedFactCount,
        fileName: value.fileName,
        preSubmissionApplicationCount: value.preSubmissionApplicationCount,
        retainedHistoricalApplicationCount:
          value.retainedHistoricalApplicationCount,
      }
    : null;
}

export function interpretDocumentDeletionFailure(
  value: unknown,
): Exclude<DocumentDeletionResult, { kind: "DELETED" }> {
  const payload = record(value);
  if (!payload)
    return { kind: "FAILED", message: "The document could not be deleted." };

  const failureMessage = message(payload);
  if (payload.code === DOCUMENT_DELETION_CONFIRMATION_REQUIRED) {
    const parsedConsequences = consequences(payload);
    return parsedConsequences
      ? {
          consequences: parsedConsequences,
          kind: "CONFIRMATION_REQUIRED",
          message: failureMessage,
        }
      : { kind: "FAILED", message: failureMessage };
  }
  return { kind: "FAILED", message: failureMessage };
}

export async function requestCandidateDocumentDeletion(
  input: {
    readonly confirmDeletion: boolean;
    readonly documentId: string;
  },
  request: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response> = fetch,
): Promise<DocumentDeletionResult> {
  const response = await request(
    `/api/candidate/documents/${input.documentId}`,
    {
      method: "DELETE",
      ...(input.confirmDeletion
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmDeletion: true }),
          }
        : {}),
    },
  );
  if (response.ok) return { kind: "DELETED" };

  try {
    return interpretDocumentDeletionFailure(await response.json());
  } catch {
    return { kind: "FAILED", message: "The document could not be deleted." };
  }
}
