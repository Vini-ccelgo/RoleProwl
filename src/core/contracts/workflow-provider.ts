export interface WorkflowEvent<TPayload extends object> {
  readonly name: string;
  readonly idempotencyKey: string;
  readonly payload: TPayload;
}
export interface WorkflowProvider {
  publish<TPayload extends object>(
    event: WorkflowEvent<TPayload>,
  ): Promise<void>;
}
