import { createHash } from "node:crypto";
import type { ApplicationQuestionClassification } from "./question-classifier";
import {
  evaluateApplicationPolicy,
  type ApplicationPolicyContext,
  type ApplicationPolicyResult,
  type CandidateApplicationPolicy,
} from "./application-policy";

export const APPLICATION_DECISION_VERSION = "application-decision-v1";

export interface ResolvedApplicationQuestion {
  readonly classification: ApplicationQuestionClassification;
  readonly disposition: "AUTO_ANSWER" | "PREPARE_DRAFT" | "NEEDS_REVIEW";
  readonly reasonCode: string;
}

export interface ApplicationDecisionInput {
  readonly claims: { readonly total: number; readonly unsupported: number };
  readonly fit: Readonly<Record<string, unknown>>;
  readonly job: {
    readonly company: string;
    readonly id: string;
    readonly title: string;
  };
  readonly materials: Readonly<Record<string, unknown>>;
  readonly policy: CandidateApplicationPolicy;
  readonly policyContext: Omit<
    ApplicationPolicyContext,
    | "sourceCanSubmit"
    | "submissionAuthorized"
    | "unsupportedClaims"
    | "unresolvedSensitiveQuestions"
  >;
  readonly questions: readonly ResolvedApplicationQuestion[];
  readonly sourceCapability: {
    readonly canSubmit: boolean;
    readonly mode: string;
  };
  readonly submissionAuthorized: boolean;
  readonly userId: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  return value;
}

export function applicationDecisionInputHash(input: ApplicationDecisionInput) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)))
    .digest("hex");
}

function questionReason(question: ResolvedApplicationQuestion) {
  if (question.classification === "ATTESTATION") return "ATTESTATION_REQUIRED";
  if (question.classification === "SENSITIVE_PERSONAL_DATA")
    return "SENSITIVE_ANSWER_REQUIRES_REVIEW";
  if (question.classification === "UNKNOWN") return "UNKNOWN_QUESTION";
  return question.reasonCode;
}

export function decideApplication(input: ApplicationDecisionInput): {
  readonly decisionVersion: typeof APPLICATION_DECISION_VERSION;
  readonly inputHash: string;
  readonly reasons: readonly string[];
  readonly result: ApplicationPolicyResult;
} {
  const unresolved = input.questions.filter(
    ({ disposition }) => disposition !== "AUTO_ANSWER",
  );
  const policyDecision = evaluateApplicationPolicy(input.policy, {
    ...input.policyContext,
    sourceCanSubmit: input.sourceCapability.canSubmit,
    submissionAuthorized: input.submissionAuthorized,
    unsupportedClaims: input.claims.unsupported,
    unresolvedSensitiveQuestions: unresolved.filter(
      ({ classification }) => classification === "SENSITIVE_PERSONAL_DATA",
    ).length,
  });
  const reasons = [
    ...policyDecision.reasons,
    ...unresolved.map(questionReason),
  ].filter((reason, index, all) => all.indexOf(reason) === index);
  const result =
    policyDecision.result !== "REJECT" && unresolved.length > 0
      ? "NEEDS_REVIEW"
      : policyDecision.result;
  return {
    decisionVersion: APPLICATION_DECISION_VERSION,
    inputHash: applicationDecisionInputHash(input),
    reasons,
    result,
  };
}
