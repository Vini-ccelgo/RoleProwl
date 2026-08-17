import type { AnswerDisposition, AnswerHandling } from "./answer-authority";
import type {
  ApplicationQuestionClassification,
  QuestionClassificationResult,
} from "./question-classifier";

export interface PublicApplicationQuestionReference {
  readonly source: "GREENHOUSE";
  readonly boardToken: string;
  readonly jobId: string;
}

export type PublicApplicationQuestionGroup =
  "STANDARD" | "LOCATION" | "COMPLIANCE" | "DEMOGRAPHIC";

export interface PublicApplicationQuestion {
  readonly id: string;
  readonly source: "GREENHOUSE";
  readonly group: PublicApplicationQuestionGroup;
  readonly label: string;
  readonly required: boolean;
  readonly fieldTypes: readonly string[];
  readonly options: readonly string[];
}

export interface CandidateQuestionEvidence {
  readonly label: string;
  readonly quote: string;
}

export interface PreparedApplicationQuestion extends PublicApplicationQuestion {
  readonly classification: ApplicationQuestionClassification;
  readonly classificationResult: QuestionClassificationResult;
  readonly disposition: AnswerDisposition;
  readonly handling: AnswerHandling;
  readonly authorityReasonCode: string;
  readonly candidateEvidence: readonly CandidateQuestionEvidence[];
  readonly suggestedAction: string;
}
