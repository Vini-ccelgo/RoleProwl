import type {
  AIProvider,
  StructuredAIRequest,
  StructuredAIResult,
} from "@/core/contracts/ai-provider";

export class DeterministicAIProvider implements AIProvider {
  constructor(
    private readonly resolve: (
      request: StructuredAIRequest<unknown>,
    ) => unknown,
  ) {}

  async generateStructured<T>(
    request: StructuredAIRequest<T>,
  ): Promise<StructuredAIResult<T>> {
    return {
      data: request.schema.parse(this.resolve(request)),
      metadata: {
        correlationId: request.correlationId,
        task: request.task,
        promptVersion: request.promptVersion,
        model: "deterministic-test-provider",
        providerRequestId: null,
        usage: { inputTokens: null, outputTokens: null, totalTokens: null },
      },
    };
  }
}
