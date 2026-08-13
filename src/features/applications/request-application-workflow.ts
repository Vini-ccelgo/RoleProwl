import type { WorkflowProvider } from "@/core/contracts/workflow-provider";
import { workflowIdempotencyKey } from "@/core/domain/applications/application-workflow";

export interface ApplicationWorkflowRepository {
  createOrGet(input: {
    readonly decisionId: string;
    readonly idempotencyKey: string;
    readonly jobId: string;
    readonly userId: string;
  }): Promise<{ readonly id: string; readonly status: string }>;
}

export async function requestApplicationWorkflow(input: {
  readonly decisionId: string;
  readonly jobId: string;
  readonly repository: ApplicationWorkflowRepository;
  readonly userId: string;
  readonly workflow: WorkflowProvider;
}) {
  const idempotencyKey = workflowIdempotencyKey(input);
  const run = await input.repository.createOrGet({
    decisionId: input.decisionId,
    idempotencyKey,
    jobId: input.jobId,
    userId: input.userId,
  });
  await input.workflow.publish({
    name: "application.requested",
    idempotencyKey,
    payload: { workflowRunId: run.id },
  });
  return run;
}
