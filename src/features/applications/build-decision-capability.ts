import {
  resolveIntegrationCapability,
  type IntegrationSource,
} from "@/core/integrations/capability-registry";

export function buildDecisionCapability(input: {
  readonly partnerSubmissionAuthorized: boolean;
  readonly source: IntegrationSource;
}) {
  const capability = resolveIntegrationCapability(input);
  return {
    canSubmit: capability.canSubmit,
    mode: capability.mode,
  } as const;
}
