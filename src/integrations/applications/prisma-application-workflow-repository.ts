import "server-only";
import type { ApplicationWorkflowRepository } from "@/features/applications/request-application-workflow";
import { databaseClient } from "@/lib/db/client";

export class PrismaApplicationWorkflowRepository implements ApplicationWorkflowRepository {
  async createOrGet(
    input: Parameters<ApplicationWorkflowRepository["createOrGet"]>[0],
  ) {
    return databaseClient().applicationWorkflowRun.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: input,
      update: {},
      select: { id: true, status: true },
    });
  }
}
