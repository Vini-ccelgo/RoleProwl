import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/core/errors/application-errors";

export type ProposalDecision = "ACCEPT" | "EDIT_AND_ACCEPT" | "REJECT";
export type JsonObject = Readonly<Record<string, unknown>>;

export interface ReviewableProposal {
  readonly factType: string;
  readonly id: string;
  readonly proposedValue: JsonObject;
  readonly status: "PENDING" | "ACCEPTED" | "EDITED_AND_ACCEPTED" | "REJECTED";
  readonly userId: string;
}

export interface ProposalDecisionResult {
  readonly acceptedValue: JsonObject | null;
  readonly createCanonicalFact: boolean;
  readonly status: Exclude<ReviewableProposal["status"], "PENDING">;
}

function meaningfulObject(value: JsonObject) {
  return Object.values(value).some((item) =>
    typeof item === "string" ? item.trim().length > 0 : item != null,
  );
}

export function decideFactProposal(
  proposal: ReviewableProposal | null,
  userId: string,
  decision: ProposalDecision,
  editedValue?: JsonObject,
): ProposalDecisionResult {
  if (!proposal || proposal.userId !== userId) throw new NotFoundError();
  if (proposal.status !== "PENDING") {
    throw new ConflictError("This proposal has already been reviewed.");
  }
  if (decision === "REJECT") {
    return {
      status: "REJECTED",
      acceptedValue: null,
      createCanonicalFact: false,
    };
  }
  const acceptedValue =
    decision === "ACCEPT" ? proposal.proposedValue : editedValue;
  if (!acceptedValue || !meaningfulObject(acceptedValue)) {
    throw new ValidationError("Edited facts must contain a non-empty value.");
  }
  return {
    status: decision === "ACCEPT" ? "ACCEPTED" : "EDITED_AND_ACCEPTED",
    acceptedValue,
    createCanonicalFact: true,
  };
}
