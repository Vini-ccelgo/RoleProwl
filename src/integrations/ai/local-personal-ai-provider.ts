import { z } from "zod";
import type {
  AIProvider,
  StructuredAIRequest,
  StructuredAIResult,
} from "@/core/contracts/ai-provider";

export interface LocalPersonalAIConfiguration {
  readonly baseUrl: string;
  readonly model: string;
}

export class LocalPersonalAIProvider implements AIProvider {
  private readonly endpoint: URL;

  constructor(
    private readonly configuration: LocalPersonalAIConfiguration,
    private readonly request: typeof fetch = fetch,
  ) {
    const base = new URL(configuration.baseUrl);
    if (
      base.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(base.hostname)
    )
      throw new Error(
        "PERSONAL_AI_BASE_URL must be an HTTP loopback URL (localhost, 127.0.0.1, or ::1).",
      );
    if (!configuration.model.trim())
      throw new Error(
        "PERSONAL_AI_MODEL is required when local AI is enabled.",
      );
    this.endpoint = new URL(
      "v1/chat/completions",
      `${base.toString().replace(/\/$/u, "")}/`,
    );
  }

  async generateStructured<T>(
    input: StructuredAIRequest<T>,
  ): Promise<StructuredAIResult<T>> {
    const started = Date.now();
    const response = await this.request(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.configuration.model,
        stream: false,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: JSON.stringify(input.input) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: input.schemaName,
            strict: true,
            schema: z.toJSONSchema(input.schema),
          },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new Error(`Local AI returned HTTP ${response.status}.`);
    const payload = (await response.json()) as {
      id?: string;
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Local AI returned no structured content.");
    const data = input.schema.parse(JSON.parse(content));
    return {
      data,
      metadata: {
        capacityState: "AVAILABLE",
        correlationId: input.correlationId,
        latencyMs: Date.now() - started,
        model: this.configuration.model,
        provider: "local",
        promptVersion: input.promptVersion,
        providerRequestId: payload.id ?? null,
        retryCount: 0,
        schemaVersion: "1",
        status: "SUCCEEDED",
        task: input.task,
        usage: {
          inputTokens: payload.usage?.prompt_tokens ?? null,
          outputTokens: payload.usage?.completion_tokens ?? null,
          totalTokens: payload.usage?.total_tokens ?? null,
        },
      },
    };
  }
}
