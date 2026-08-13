import type { AIProvider } from "@/core/contracts/ai-provider";
import {
  classifyQuestionDeterministically,
  isSafetyCriticalClassification,
  type QuestionClassificationResult,
} from "@/core/domain/applications/question-classifier";
import { aiTaskDefinitions } from "@/features/ai/task-definitions";

export async function classifyApplicationQuestion(input: {
  readonly ai?: AIProvider;
  readonly correlationId: string;
  readonly question: string;
}): Promise<QuestionClassificationResult> {
  const deterministic = classifyQuestionDeterministically(input.question);
  if (
    deterministic.classification !== "UNKNOWN" ||
    !input.ai ||
    isSafetyCriticalClassification(deterministic.classification)
  ) {
    return deterministic;
  }

  const definition = aiTaskDefinitions.APPLICATION_QUESTION_CLASSIFICATION;
  const generated = await input.ai.generateStructured({
    correlationId: input.correlationId,
    input: { question: input.question },
    ...definition,
    task: "APPLICATION_QUESTION_CLASSIFICATION",
  });
  return {
    classification: generated.data.classification,
    confidence: generated.data.confidence,
    rationaleCode: "AI_ASSISTED_CLASSIFICATION",
    source: "AI_ASSISTED",
  };
}
