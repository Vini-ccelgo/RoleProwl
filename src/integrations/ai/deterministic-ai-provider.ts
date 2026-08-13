import type {
  AIProvider,
  StructuredAIRequest,
  StructuredAIResult,
} from "@/core/contracts/ai-provider";
import { AIInvalidOutputError } from "@/core/errors/application-errors";

export class DeterministicAIProvider implements AIProvider {
  constructor(
    private readonly resolve: (
      request: StructuredAIRequest<unknown>,
    ) => unknown,
  ) {}

  async generateStructured<T>(
    request: StructuredAIRequest<T>,
  ): Promise<StructuredAIResult<T>> {
    const parsed = request.schema.safeParse(this.resolve(request));
    if (!parsed.success) {
      throw new AIInvalidOutputError(
        "The deterministic AI fixture violated the requested schema.",
        parsed.error,
      );
    }
    return {
      data: parsed.data,
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
