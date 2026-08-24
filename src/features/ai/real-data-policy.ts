import type {
  AIProvider,
  AIProviderName,
  StructuredAIRequest,
} from "@/core/contracts/ai-provider";
import { ConfigurationError } from "@/core/errors/application-errors";
import { resolveDeploymentEnvironment } from "@/lib/env/deployment";

export type AIDataClassification = "REAL_CANDIDATE" | "SYNTHETIC";

export function assertAIDataPolicy(input: {
  readonly classification: AIDataClassification;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly provider: AIProviderName;
}) {
  if (
    input.provider === "deterministic" ||
    input.classification === "SYNTHETIC"
  )
    return;
  const deployment = resolveDeploymentEnvironment(input.environment);
  if (deployment === "production")
    throw new ConfigurationError(
      "Real candidate AI processing is disabled in Production.",
    );
  if (
    deployment !== "preview" ||
    input.environment.ROLEPROWL_PRIVATE_BETA_REAL_DATA_AI_ENABLED !== "true"
  )
    throw new ConfigurationError(
      "Real candidate AI processing requires an explicit private-beta Preview policy.",
    );
  if (
    input.provider === "gemini" &&
    input.environment.ROLEPROWL_GEMINI_SYNTHETIC_ONLY !== "false"
  )
    throw new ConfigurationError(
      "Gemini remains synthetic-only until its provider policy explicitly permits real candidate data.",
    );
}

export class PolicyEnforcedAIProvider implements AIProvider {
  constructor(
    private readonly provider: AIProvider,
    private readonly providerName: AIProviderName,
    private readonly environment: Readonly<Record<string, string | undefined>>,
  ) {}

  generateStructured<T>(request: StructuredAIRequest<T>) {
    assertAIDataPolicy({
      classification: request.dataClassification ?? "REAL_CANDIDATE",
      environment: this.environment,
      provider: this.providerName,
    });
    return this.provider.generateStructured(request);
  }
}
