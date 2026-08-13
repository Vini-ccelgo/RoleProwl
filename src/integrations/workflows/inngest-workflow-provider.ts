import "server-only";
import type {
  WorkflowEvent,
  WorkflowProvider,
} from "@/core/contracts/workflow-provider";
import { inngest } from "./inngest-client";

export class InngestWorkflowProvider implements WorkflowProvider {
  async publish<TPayload extends object>(event: WorkflowEvent<TPayload>) {
    await inngest.send({
      id: event.idempotencyKey,
      name: event.name,
      data: event.payload,
    });
  }
}
