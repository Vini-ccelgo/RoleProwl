import "server-only";
import {
  APPLICATION_IDENTITY_KEYS,
  isApplicationPacket,
  parseApplicationPacketOverrides,
} from "@/core/domain/applications/application-packet";
import { ConflictError, NotFoundError } from "@/core/errors/application-errors";
import type { ApplicationOverrideRepository } from "@/features/applications/save-application-overrides";
import type { Prisma } from "@/generated/prisma/client";
import { databaseClient } from "@/lib/db/client";
import { PrismaApplicationPacketRepository } from "./prisma-application-packet-repository";

function object(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function applyChanges(
  current: Readonly<Record<string, string>>,
  changes: readonly { readonly key: string; readonly value: string | null }[],
) {
  const next = { ...current };
  for (const change of changes) {
    if (change.value) next[change.key] = change.value;
    else delete next[change.key];
  }
  return next;
}

export class PrismaApplicationOverrideRepository implements ApplicationOverrideRepository {
  constructor(
    private readonly packetRepository: Pick<
      PrismaApplicationPacketRepository,
      "refresh"
    > = new PrismaApplicationPacketRepository(),
  ) {}

  async save(input: Parameters<ApplicationOverrideRepository["save"]>[0]) {
    const database = databaseClient();
    const application = await database.application.findFirst({
      where: {
        id: input.applicationId,
        userId: input.userId,
        submittedAt: null,
      },
      select: {
        id: true,
        state: true,
        updatedAt: true,
        submissionPayloadSnapshot: true,
      },
    });
    if (!application) throw new NotFoundError("Application not found.");
    if (
      !["PREPARING", "NEEDS_REVIEW", "READY", "FAILED"].includes(
        application.state,
      )
    )
      throw new ConflictError("This application can no longer be edited.");
    const payload = object(application.submissionPayloadSnapshot);
    if (!isApplicationPacket(payload.packet))
      throw new ConflictError(
        "Refresh the application packet before adding application-specific answers.",
      );
    const allowedIdentity = new Set(APPLICATION_IDENTITY_KEYS);
    if (
      input.identity.some((change) => !allowedIdentity.has(change.key as never))
    )
      throw new ConflictError("The application identity field is unsupported.");
    const allowedAnswers = new Set(
      payload.packet.answers.map((answer) => answer.questionId),
    );
    if (input.answers.some((change) => !allowedAnswers.has(change.key)))
      throw new ConflictError(
        "The employer question changed. Refresh the packet and try again.",
      );
    const current = parseApplicationPacketOverrides(payload.overrides);
    const overrides = {
      identity: applyChanges(current.identity, input.identity),
      answers: applyChanges(current.answers, input.answers),
    };
    const updated = await database.application.updateMany({
      where: {
        id: application.id,
        userId: input.userId,
        state: application.state,
        updatedAt: application.updatedAt,
        submittedAt: null,
      },
      data: {
        submissionPayloadSnapshot: json({ ...payload, overrides }),
      },
    });
    if (updated.count !== 1)
      throw new ConflictError(
        "The application changed while its answers were being saved.",
      );
    return this.packetRepository.refresh({
      applicationId: application.id,
      userId: input.userId,
      reviewed: false,
    });
  }
}
