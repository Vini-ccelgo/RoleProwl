import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/core/errors/application-errors";
import { isSupportedProposalDestination } from "./proposal-destinations";

export type ProposalDecision = "ACCEPT" | "EDIT_AND_ACCEPT" | "REJECT";
export type JsonObject = Readonly<Record<string, unknown>>;

export interface ReviewableProposal {
  readonly factType: string;
  readonly id: string;
  readonly proposedValue: JsonObject;
  readonly status: "PENDING" | "ACCEPTED" | "EDITED_AND_ACCEPTED" | "REJECTED";
  readonly targetPath: string;
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

function normalizeJson(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\r\n?/gu, "\n").trim();
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeJson(item)]),
    );
  }
  return value;
}

function equivalentJson(left: JsonObject, right: JsonObject) {
  return (
    JSON.stringify(normalizeJson(left)) === JSON.stringify(normalizeJson(right))
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
    if (editedValue) {
      throw new ValidationError(
        "Rejected proposals cannot include an edited value.",
      );
    }
    return {
      status: "REJECTED",
      acceptedValue: null,
      createCanonicalFact: false,
    };
  }
  if (!isSupportedProposalDestination(proposal.factType, proposal.targetPath)) {
    throw new ValidationError(
      "This proposal type does not have a supported Truth Vault destination.",
    );
  }
  if (decision === "ACCEPT" && editedValue) {
    throw new ValidationError(
      "Accept original cannot include a modified proposal value.",
    );
  }
  const acceptedValue =
    decision === "ACCEPT" ? proposal.proposedValue : editedValue;
  if (!acceptedValue || !meaningfulObject(acceptedValue)) {
    throw new ValidationError("Edited facts must contain a non-empty value.");
  }
  if (
    decision === "EDIT_AND_ACCEPT" &&
    equivalentJson(proposal.proposedValue, acceptedValue)
  ) {
    throw new ValidationError(
      "Accept edited requires a value that differs from the original proposal.",
    );
  }
  return {
    status: decision === "ACCEPT" ? "ACCEPTED" : "EDITED_AND_ACCEPTED",
    acceptedValue,
    createCanonicalFact: true,
  };
}
