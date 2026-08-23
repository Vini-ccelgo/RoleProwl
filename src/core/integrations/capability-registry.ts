import type {
  SourceCapability,
  SourceCapabilitySet,
} from "@/core/types/capabilities";

export const INTEGRATION_SOURCES = [
  "GREENHOUSE",
  "LEVER",
  "LINKEDIN",
  "INDEED",
  "EXTERNAL",
] as const;
export type IntegrationSource = (typeof INTEGRATION_SOURCES)[number];
export type SubmissionMode =
  "AUTHORIZED_API" | "EXTERNAL_APPLICATION" | "MANUAL_EXTERNAL" | "UNSUPPORTED";

export interface IntegrationCapabilityDefinition {
  readonly baseCapabilities: readonly SourceCapability[];
  readonly prohibitedAutomation: boolean;
  readonly requiresPartnerAuthForSubmission: boolean;
  readonly submissionModeWithoutAuthorization: SubmissionMode;
}

export const INTEGRATION_CAPABILITY_REGISTRY: Readonly<
  Record<IntegrationSource, IntegrationCapabilityDefinition>
> = {
  GREENHOUSE: {
    baseCapabilities: [
      "READ_JOBS",
      "READ_APPLICATION_SCHEMA",
      "REQUIRES_USER_INTERACTION",
    ],
    prohibitedAutomation: false,
    requiresPartnerAuthForSubmission: true,
    submissionModeWithoutAuthorization: "EXTERNAL_APPLICATION",
  },
  LEVER: {
    baseCapabilities: ["READ_JOBS", "REQUIRES_USER_INTERACTION"],
    prohibitedAutomation: false,
    requiresPartnerAuthForSubmission: true,
    submissionModeWithoutAuthorization: "EXTERNAL_APPLICATION",
  },
  LINKEDIN: {
    baseCapabilities: ["REQUIRES_USER_INTERACTION"],
    prohibitedAutomation: true,
    requiresPartnerAuthForSubmission: true,
    submissionModeWithoutAuthorization: "MANUAL_EXTERNAL",
  },
  INDEED: {
    baseCapabilities: ["REQUIRES_USER_INTERACTION"],
    prohibitedAutomation: true,
    requiresPartnerAuthForSubmission: true,
    submissionModeWithoutAuthorization: "MANUAL_EXTERNAL",
  },
  EXTERNAL: {
    baseCapabilities: ["REQUIRES_USER_INTERACTION"],
    prohibitedAutomation: false,
    requiresPartnerAuthForSubmission: false,
    submissionModeWithoutAuthorization: "EXTERNAL_APPLICATION",
  },
};

export interface ResolvedIntegrationCapability {
  readonly capabilities: SourceCapabilitySet;
  readonly canSubmit: boolean;
  readonly mode: SubmissionMode;
  readonly prohibitedAutomation: boolean;
  readonly source: IntegrationSource;
}

export function resolveIntegrationCapability(input: {
  readonly partnerSubmissionAuthorized: boolean;
  readonly source: IntegrationSource;
}): ResolvedIntegrationCapability {
  const definition = INTEGRATION_CAPABILITY_REGISTRY[input.source];
  const authorized =
    input.partnerSubmissionAuthorized &&
    definition.requiresPartnerAuthForSubmission &&
    !definition.prohibitedAutomation;
  return {
    source: input.source,
    prohibitedAutomation: definition.prohibitedAutomation,
    canSubmit: authorized,
    mode: authorized
      ? "AUTHORIZED_API"
      : definition.submissionModeWithoutAuthorization,
    capabilities: new Set<SourceCapability>([
      ...definition.baseCapabilities,
      ...(definition.requiresPartnerAuthForSubmission
        ? (["REQUIRES_PARTNER_AUTH"] as const)
        : []),
      ...(authorized ? (["SUBMIT_APPLICATION"] as const) : []),
    ]),
  };
}

export function sourceCapabilities(
  source: IntegrationSource,
): SourceCapabilitySet {
  return resolveIntegrationCapability({
    source,
    partnerSubmissionAuthorized: false,
  }).capabilities;
}
