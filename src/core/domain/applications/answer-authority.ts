import type { AnswerMemoryStatus } from "./answer-memory";
import type { ApplicationQuestionClassification } from "./question-classifier";

export type AnswerHandling =
  "NO_INFERENCE" | "CANONICAL_ONLY" | "DRAFT_ALLOWED";
export type AnswerDisposition =
  "AUTO_ANSWER" | "PREPARE_DRAFT" | "NEEDS_REVIEW";

export interface AnswerAuthorityDecision {
  readonly disposition: AnswerDisposition;
  readonly handling: AnswerHandling;
  readonly reasonCode:
    | "ATTESTATION_REQUIRES_USER"
    | "CONSEQUENTIAL_ANSWER_MISSING"
    | "CONSEQUENTIAL_ANSWER_READY"
    | "DRAFT_REQUIRES_REVIEW"
    | "FRESH_CANONICAL_ANSWER"
    | "NO_FRESH_CANONICAL_ANSWER"
    | "SENSITIVE_NO_INFERENCE"
    | "SENSITIVE_REQUIRES_REVIEW"
    | "UNKNOWN_QUESTION";
}

export interface AvailableCanonicalAnswer {
  readonly memoryStatus: AnswerMemoryStatus;
  readonly source:
    "PROFILE_FACT" | "COMPUTED_FACT" | "USER_POLICY" | "EXPLICIT_CONSEQUENTIAL";
}

export function decideAnswerAuthority(input: {
  readonly answer?: AvailableCanonicalAnswer | null;
  readonly classification: ApplicationQuestionClassification;
}): AnswerAuthorityDecision {
  const answer = input.answer;
  if (input.classification === "ATTESTATION") {
    return {
      disposition: "NEEDS_REVIEW",
      handling: "NO_INFERENCE",
      reasonCode: "ATTESTATION_REQUIRES_USER",
    };
  }
  if (input.classification === "SENSITIVE_PERSONAL_DATA") {
    return {
      disposition: "NEEDS_REVIEW",
      handling: "NO_INFERENCE",
      reasonCode: answer
        ? "SENSITIVE_REQUIRES_REVIEW"
        : "SENSITIVE_NO_INFERENCE",
    };
  }
  if (input.classification === "LEGAL_OR_CONSEQUENTIAL") {
    const explicitAndFresh =
      answer?.source === "EXPLICIT_CONSEQUENTIAL" &&
      answer.memoryStatus === "FRESH";
    return explicitAndFresh
      ? {
          disposition: "AUTO_ANSWER",
          handling: "CANONICAL_ONLY",
          reasonCode: "CONSEQUENTIAL_ANSWER_READY",
        }
      : {
          disposition: "NEEDS_REVIEW",
          handling: "NO_INFERENCE",
          reasonCode: "CONSEQUENTIAL_ANSWER_MISSING",
        };
  }
  if (input.classification === "UNKNOWN") {
    return {
      disposition: "NEEDS_REVIEW",
      handling: "NO_INFERENCE",
      reasonCode: "UNKNOWN_QUESTION",
    };
  }
  if (input.classification === "JOB_SPECIFIC_FREE_TEXT") {
    return {
      disposition: "PREPARE_DRAFT",
      handling: "DRAFT_ALLOWED",
      reasonCode: "DRAFT_REQUIRES_REVIEW",
    };
  }
  return answer?.memoryStatus === "FRESH"
    ? {
        disposition: "AUTO_ANSWER",
        handling: "CANONICAL_ONLY",
        reasonCode: "FRESH_CANONICAL_ANSWER",
      }
    : {
        disposition: "NEEDS_REVIEW",
        handling: "CANONICAL_ONLY",
        reasonCode: "NO_FRESH_CANONICAL_ANSWER",
      };
}
