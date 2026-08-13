import {
  DEFAULT_REVERIFY_DAYS,
  mapQuestionToAnswerConcept,
  type AnswerConcept,
} from "@/core/domain/applications/answer-memory";
import { ValidationError } from "@/core/errors/application-errors";

export type AnswerMemorySource =
  "PROFILE_FACT" | "COMPUTED_FACT" | "USER_POLICY" | "EXPLICIT_CONSEQUENTIAL";

export interface AnswerMemoryRepository {
  upsert(input: {
    readonly answer: Readonly<Record<string, unknown>>;
    readonly autoAnswerAllowed: boolean;
    readonly concept: AnswerConcept;
    readonly normalizedQuestionExample: string | null;
    readonly reverifyAfterDays: number;
    readonly source: AnswerMemorySource;
    readonly userId: string;
    readonly verifiedAt: Date;
  }): Promise<{ readonly id: string }>;
}

export async function rememberApplicationAnswer(input: {
  readonly answer: Readonly<Record<string, unknown>>;
  readonly autoAnswerAllowed: boolean;
  readonly concept?: AnswerConcept;
  readonly question?: string;
  readonly repository: AnswerMemoryRepository;
  readonly source: AnswerMemorySource;
  readonly userId: string;
  readonly verifiedAt?: Date;
}) {
  const concept =
    input.concept ??
    (input.question ? mapQuestionToAnswerConcept(input.question) : null);
  if (!concept)
    throw new ValidationError(
      "The application question has no canonical answer concept.",
    );
  if (Object.keys(input.answer).length === 0)
    throw new ValidationError("A canonical answer cannot be empty.");
  return input.repository.upsert({
    answer: input.answer,
    autoAnswerAllowed: input.autoAnswerAllowed,
    concept,
    normalizedQuestionExample: input.question?.trim() || null,
    reverifyAfterDays: DEFAULT_REVERIFY_DAYS[concept],
    source: input.source,
    userId: input.userId,
    verifiedAt: input.verifiedAt ?? new Date(),
  });
}
