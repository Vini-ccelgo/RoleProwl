import "server-only";
import { NonRetriableError } from "inngest";
import { workflowOutcomeForDecision } from "@/core/domain/applications/application-workflow";
import { databaseClient } from "@/lib/db/client";
import { inngest } from "./inngest-client";

export const applicationWorkflowFunction = inngest.createFunction(
  {
    id: "roleprowl-application-workflow-v1",
    triggers: { event: "application.requested" },
    idempotency: "event.data.workflowRunId",
    retries: 4,
    onFailure: async ({ event }) => {
      const workflowRunId = String(event.data.event.data.workflowRunId ?? "");
      if (!workflowRunId) return;
      const database = databaseClient();
      await database.$transaction(async (transaction) => {
        const run = await transaction.applicationWorkflowRun.findUnique({
          where: { id: workflowRunId },
          select: { userId: true, status: true },
        });
        if (!run || run.status === "SUBMITTED" || run.status === "FAILED_FINAL")
          return;
        await transaction.applicationWorkflowRun.update({
          where: { id: workflowRunId },
          data: {
            status: "FAILED_FINAL",
            lastErrorCode: "RETRIES_EXHAUSTED",
            lastErrorAt: new Date(),
          },
        });
        await transaction.notification.upsert({
          where: {
            userId_dedupeKey: {
              userId: run.userId,
              dedupeKey: `workflow-failed:${workflowRunId}`,
            },
          },
          create: {
            userId: run.userId,
            type: "WORKFLOW_FAILED",
            title: "Application workflow failed",
            body: "A workflow stopped after its safe retries were exhausted. Review the application before continuing.",
            entityType: "applicationWorkflowRun",
            entityId: workflowRunId,
            dedupeKey: `workflow-failed:${workflowRunId}`,
          },
          update: {},
        });
      });
    },
  },
  async ({ event, step }) => {
    const workflowRunId = String(event.data.workflowRunId ?? "");
    if (!workflowRunId) throw new NonRetriableError("Missing workflowRunId.");
    const run = await step.run("start-workflow", async () => {
      const record = await databaseClient().applicationWorkflowRun.findUnique({
        where: { id: workflowRunId },
        include: { decision: { select: { result: true } } },
      });
      if (!record) throw new NonRetriableError("Workflow run was not found.");
      if (record.status === "SUBMITTED" || record.status === "FAILED_FINAL")
        return {
          terminal: true,
          result: record.decision.result,
          decisionId: record.decisionId,
        };
      await databaseClient().applicationWorkflowRun.update({
        where: { id: record.id },
        data: {
          status: "PROCESSING",
          startedAt: record.startedAt ?? new Date(),
          attemptCount: { increment: 1 },
          lastErrorCode: null,
        },
      });
      return {
        terminal: false,
        result: record.decision.result,
        decisionId: record.decisionId,
      };
    });
    if (run.terminal) return run;

    await step.run("validate-decision", async () => {
      const decision = await databaseClient().applicationDecision.findUnique({
        where: { id: run.decisionId },
        select: { id: true, inputSnapshot: true },
      });
      if (!decision) throw new NonRetriableError("Decision was not found.");
      return { decisionId: decision.id, snapshotAvailable: true };
    });

    const next = workflowOutcomeForDecision(run.result);
    await step.run("persist-workflow-outcome", async () => {
      await databaseClient().applicationWorkflowRun.update({
        where: { id: workflowRunId },
        data: {
          status: next,
          completedAt:
            next === "WAITING_REVIEW" || next === "FAILED_FINAL"
              ? new Date()
              : null,
        },
      });
    });
    return { workflowRunId, status: next };
  },
);
