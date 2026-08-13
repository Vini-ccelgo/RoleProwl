import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ResumeArtifactRepository } from "@/features/resumes/tailored-resume";
import { databaseClient } from "@/lib/db/client";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class PrismaResumeArtifactRepository implements ResumeArtifactRepository {
  async save(input: Parameters<ResumeArtifactRepository["save"]>[0]) {
    return databaseClient().resumeVersion.create({
      data: {
        userId: input.userId,
        targetJobId: input.targetJobId,
        content: json(input.content),
        templateVersion: input.templateVersion,
        generator: input.generator,
        promptVersion: input.promptVersion,
        renderedStorageKey: input.renderedStorageKey,
        renderedFileName: input.renderedFileName,
        renderedContentType: input.renderedContentType,
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
  }
}
