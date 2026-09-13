import type { CandidateKnowledgeConcept } from "@/core/domain/candidate/candidate-knowledge";
import type { PublicApplicationQuestion } from "./public-application-question";

export type ApplicationQuestionControlDisposition =
  "ROLEPROWL_RESOLVED" | "CANDIDATE_REQUIRED_EXTERNAL" | "UNSUPPORTED";

export type ApplicationAnswerResolutionDisposition =
  | "AUTO_RESOLVED"
  | "PROPOSED_FOR_CANDIDATE"
  | "CANDIDATE_REQUIRED"
  | "HUMAN_REQUIRED"
  | "UNSUPPORTED";

export interface ApplicationQuestionResolution {
  readonly questionId: string;
  readonly canonicalConcept: CandidateKnowledgeConcept | null;
  readonly disposition: ApplicationAnswerResolutionDisposition;
  readonly value: string | null;
  readonly candidateKnowledgeReferences: readonly string[];
  readonly reasonCode: string;
  readonly alternatives?: readonly string[];
}

export interface ResolvableApplicationQuestion extends PublicApplicationQuestion {
  readonly controlDisposition: ApplicationQuestionControlDisposition;
}
