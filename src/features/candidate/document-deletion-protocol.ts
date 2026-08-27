export const ACCEPTED_FACTS_DELETE_CONFIRMATION_REQUIRED =
  "ACCEPTED_FACTS_DELETE_CONFIRMATION_REQUIRED";
export const PENDING_APPLICATION_REFERENCES = "PENDING_APPLICATION_REFERENCES";
export const SUBMITTED_APPLICATION_REFERENCES =
  "SUBMITTED_APPLICATION_REFERENCES";

export interface DocumentDeletionBlockingApplication {
  readonly applicationId: string;
  readonly company: string;
  readonly jobTitle: string;
}

export type DocumentDeletionBlockerCode =
  | typeof PENDING_APPLICATION_REFERENCES
  | typeof SUBMITTED_APPLICATION_REFERENCES;

export type DocumentDeletionResult =
  | { readonly kind: "DELETED" }
  | {
      readonly applications: readonly DocumentDeletionBlockingApplication[];
      readonly code: DocumentDeletionBlockerCode;
      readonly kind: "APPLICATION_BLOCKER";
      readonly message: string;
    }
  | {
      readonly factCount: number;
      readonly kind: "ACCEPTED_FACTS_CONFIRMATION";
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

export function interpretDocumentDeletionFailure(
  value: unknown,
): Exclude<DocumentDeletionResult, { kind: "DELETED" }> {
  const payload = record(value);
  if (!payload)
    return { kind: "FAILED", message: "The document could not be deleted." };

  const failureMessage = message(payload);
  if (
    payload.code === PENDING_APPLICATION_REFERENCES ||
    payload.code === SUBMITTED_APPLICATION_REFERENCES
  ) {
    const applications = blockingApplications(payload.applications);
    return applications.length
      ? {
          applications,
          code: payload.code,
          kind: "APPLICATION_BLOCKER",
          message: failureMessage,
        }
      : { kind: "FAILED", message: failureMessage };
  }
  if (payload.code === ACCEPTED_FACTS_DELETE_CONFIRMATION_REQUIRED)
    return {
      factCount:
        typeof payload.factCount === "number" &&
        Number.isInteger(payload.factCount) &&
        payload.factCount >= 0
          ? payload.factCount
          : 0,
      kind: "ACCEPTED_FACTS_CONFIRMATION",
      message: failureMessage,
    };
  return { kind: "FAILED", message: failureMessage };
}

export async function requestCandidateDocumentDeletion(
  input: {
    readonly confirmAcceptedFacts: boolean;
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
      ...(input.confirmAcceptedFacts
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmAcceptedFacts: true }),
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
