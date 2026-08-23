import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ApplicationWritingRepository } from "@/features/writing/application-writing";
import { databaseClient } from "@/lib/db/client";
import { invalidateReadyApplicationPackets } from "@/integrations/applications/invalidate-application-packets";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class PrismaApplicationWritingRepository implements ApplicationWritingRepository {
  async save(input: Parameters<ApplicationWritingRepository["save"]>[0]) {
    const database = databaseClient();
    const result = await database.applicationWritingArtifact.create({
      data: {
        userId: input.userId,
        targetJobId: input.targetJobId,
        type: input.type,
        question: input.question,
        content: input.content,
        generator: input.generator,
        promptVersion: input.promptVersion,
        claims: {
          create: input.claims.map((claim) => ({
            claim: {
              create: {
                userId: input.userId,
                text: claim.text,
                classification: claim.classification,
                generator: input.generator,
                promptVersion: input.promptVersion,
                assertions: json(claim.assertions),
                verifiedAt: new Date(),
                sourceEvidence: {
                  create: claim.evidence.map((evidence) => ({
                    userId: input.userId,
                    evidenceType: evidence.evidenceType,
                    evidenceId: evidence.evidenceId,
                    evidenceField: evidence.evidenceField,
                    evidenceSnapshot: json(evidence.snapshot),
                  })),
                },
              },
            },
          })),
        },
      },
      select: { id: true },
    });
    await invalidateReadyApplicationPackets(database, input.userId);
    return result;
  }
}
