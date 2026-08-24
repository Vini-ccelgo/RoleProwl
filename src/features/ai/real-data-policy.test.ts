import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AIProvider } from "@/core/contracts/ai-provider";
import { ConfigurationError } from "@/core/errors/application-errors";
import { PolicyEnforcedAIProvider } from "./real-data-policy";

const request = {
  correlationId: "policy-test",
  input: { resume: "PRIVATE CANDIDATE PAYLOAD" },
  promptVersion: "test-v1",
  rateLimitSubject: "user-1",
  schema: z.object({ answer: z.string() }),
  schemaName: "answer",
  system: "Return structured data.",
  task: "RESUME_FACT_EXTRACTION" as const,
};

function wrapped(environment: Record<string, string | undefined>) {
  const generateStructured = vi.fn(async () => undefined);
  return {
    generateStructured,
    provider: new PolicyEnforcedAIProvider(
      { generateStructured } as unknown as AIProvider,
      "gemini",
      environment,
    ),
  };
}

describe("real candidate AI policy", () => {
  it("denies real candidate data by default", async () => {
    const { provider, generateStructured } = wrapped({
      ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "preview",
      ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "false",
    });
    expect(() => provider.generateStructured(request)).toThrow(
      ConfigurationError,
    );
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("preserves explicitly synthetic Preview processing", async () => {
    const { provider, generateStructured } = wrapped({
      ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "preview",
      ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "true",
    });
    await provider.generateStructured({
      ...request,
      dataClassification: "SYNTHETIC",
    });
    expect(generateStructured).toHaveBeenCalledOnce();
  });

  it("allows real data only through both explicit Preview gates", async () => {
    const { provider, generateStructured } = wrapped({
      ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "preview",
      ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "false",
      ROLEPROWL_PRIVATE_BETA_REAL_DATA_AI_ENABLED: "true",
    });
    await provider.generateStructured(request);
    expect(generateStructured).toHaveBeenCalledOnce();
  });

  it("keeps Production fail-closed even if flags are set", async () => {
    const { provider, generateStructured } = wrapped({
      ROLEPROWL_DEPLOYMENT_ENVIRONMENT: "production",
      ROLEPROWL_GEMINI_SYNTHETIC_ONLY: "false",
      ROLEPROWL_PRIVATE_BETA_REAL_DATA_AI_ENABLED: "true",
    });
    expect(() => provider.generateStructured(request)).toThrow(
      "disabled in Production",
    );
    expect(generateStructured).not.toHaveBeenCalled();
  });
});
