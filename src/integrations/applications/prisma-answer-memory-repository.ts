import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AnswerMemoryRepository } from "@/features/applications/answer-memory-service";
import { databaseClient } from "@/lib/db/client";

export class PrismaAnswerMemoryRepository implements AnswerMemoryRepository {
  async upsert(input: Parameters<AnswerMemoryRepository["upsert"]>[0]) {
    const questionExamples = input.normalizedQuestionExample
      ? [input.normalizedQuestionExample]
      : [];
    return databaseClient().answerMemory.upsert({
      where: {
        userId_concept: { userId: input.userId, concept: input.concept },
      },
      create: {
        userId: input.userId,
        concept: input.concept,
        answer: input.answer as Prisma.InputJsonObject,
        source: input.source,
        verifiedAt: input.verifiedAt,
        reverifyAfterDays: input.reverifyAfterDays,
        autoAnswerAllowed: input.autoAnswerAllowed,
        normalizedQuestionExamples: questionExamples,
      },
      update: {
        answer: input.answer as Prisma.InputJsonObject,
        source: input.source,
        verifiedAt: input.verifiedAt,
        reverifyAfterDays: input.reverifyAfterDays,
        autoAnswerAllowed: input.autoAnswerAllowed,
        normalizedQuestionExamples: { push: questionExamples },
      },
      select: { id: true },
    });
  }
}
