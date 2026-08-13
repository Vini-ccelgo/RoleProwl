import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type {
  AIProvider,
  StructuredAIRequest,
  StructuredAIResult,
} from "@/core/contracts/ai-provider";
import {
  AIInvalidOutputError,
  AIRefusalError,
  ConfigurationError,
  IntegrationError,
} from "@/core/errors/application-errors";
import type { Logger } from "@/lib/logging/logger";
import { logger } from "@/lib/logging/logger";
import { modelForTask, openAIRequestOptions } from "./openai-model-config";

function refusalText(response: { output?: readonly unknown[] }) {
  for (const output of response.output ?? []) {
    if (!output || typeof output !== "object" || !("content" in output))
      continue;
    const content = (output as { content?: readonly unknown[] }).content ?? [];
    for (const item of content) {
      if (
        item &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "refusal" &&
        typeof (item as { refusal?: unknown }).refusal === "string"
      )
        return (item as { refusal: string }).refusal;
    }
  }
  return null;
}

export class OpenAIProvider implements AIProvider {
  constructor(
    private readonly client: OpenAI,
    private readonly log: Logger = logger,
  ) {}

  async generateStructured<T>(
    request: StructuredAIRequest<T>,
  ): Promise<StructuredAIResult<T>> {
    const model = modelForTask(request.task);
    const startedAt = Date.now();
    try {
      const response = await this.client.responses.parse({
        model,
        input: [
          { role: "system", content: request.system },
          { role: "user", content: JSON.stringify(request.input) },
        ],
        text: { format: zodTextFormat(request.schema, request.schemaName) },
        metadata: {
          correlation_id: request.correlationId,
          task: request.task,
          prompt_version: request.promptVersion,
        },
      });
      const refusal = refusalText(response);
      if (refusal) throw new AIRefusalError(refusal);
      if (response.output_parsed == null) {
        throw new AIInvalidOutputError(
          "The AI provider returned no schema-valid output.",
        );
      }
      const data = request.schema.parse(response.output_parsed);
      const usage = {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
      };
      this.log.log("info", "ai_task_completed", {
        correlationId: request.correlationId,
        task: request.task,
        promptVersion: request.promptVersion,
        model,
        latencyMs: Date.now() - startedAt,
        totalTokens: usage.totalTokens,
      });
      return {
        data,
        metadata: {
          correlationId: request.correlationId,
          task: request.task,
          promptVersion: request.promptVersion,
          model,
          providerRequestId: response._request_id ?? null,
          usage,
        },
      };
    } catch (error) {
      this.log.log("warn", "ai_task_failed", {
        correlationId: request.correlationId,
        task: request.task,
        promptVersion: request.promptVersion,
        model,
        latencyMs: Date.now() - startedAt,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      if (
        error instanceof AIRefusalError ||
        error instanceof AIInvalidOutputError
      )
        throw error;
      throw new IntegrationError("The AI provider request failed.", error);
    }
  }
}

export function currentAIProvider() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigurationError(
      "OPENAI_API_KEY is required for live AI tasks.",
    );
  }
  return new OpenAIProvider(new OpenAI({ apiKey, ...openAIRequestOptions() }));
}
