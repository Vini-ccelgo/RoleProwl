export const DOCUMENT_DELETION_CONFIRMATION_REQUIRED =
  "DOCUMENT_DELETION_CONFIRMATION_REQUIRED";
export const SUBMITTED_APPLICATION_REFERENCES =
  "SUBMITTED_APPLICATION_REFERENCES";

export interface DocumentDeletionBlockingApplication {
  readonly applicationId: string;
  readonly company: string;
  readonly jobTitle: string;
}

export interface DocumentDeletionConsequences {
  readonly acceptedFactCount: number;
  readonly applicationCount: number;
  readonly documentId: string;
  readonly fileName: string;
}

export type DocumentDeletionResult =
  | { readonly kind: "DELETED" }
  | {
      readonly consequences: DocumentDeletionConsequences;
      readonly kind: "CONFIRMATION_REQUIRED";
      readonly message: string;
    }
  | {
      readonly applications: readonly DocumentDeletionBlockingApplication[];
      readonly kind: "SUBMITTED_BLOCKER";
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

function blockingApplications(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const application = record(candidate);
    return application &&
      typeof application.applicationId === "string" &&
      application.applicationId.trim() &&
      typeof application.company === "string" &&
      application.company.trim() &&
      typeof application.jobTitle === "string" &&
      application.jobTitle.trim()
      ? [
          {
            applicationId: application.applicationId,
            company: application.company,
            jobTitle: application.jobTitle,
          },
        ]
      : [];
  });
}

function consequences(value: Record<string, unknown>) {
  return typeof value.documentId === "string" &&
    value.documentId.trim() &&
    typeof value.fileName === "string" &&
    value.fileName.trim() &&
    nonnegativeInteger(value.applicationCount) &&
    nonnegativeInteger(value.acceptedFactCount)
    ? {
        acceptedFactCount: value.acceptedFactCount,
        applicationCount: value.applicationCount,
        documentId: value.documentId,
        fileName: value.fileName,
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
  if (payload.code === SUBMITTED_APPLICATION_REFERENCES) {
    const applications = blockingApplications(payload.applications);
    return applications.length
      ? {
          applications,
          kind: "SUBMITTED_BLOCKER",
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
