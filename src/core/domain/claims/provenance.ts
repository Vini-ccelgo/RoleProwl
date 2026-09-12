export type ClaimClassification =
  "DIRECT_FACT" | "SUPPORTED_REWRITE" | "SUPPORTED_INFERENCE" | "UNSUPPORTED";

export const PROVENANCE_FAILURE_REASONS = [
  "NO_LINKED_EVIDENCE",
  "ASSERTION_NOT_SUPPORTED",
  "INFERENCE_INSUFFICIENT_EVIDENCE",
] as const;
export type ProvenanceFailureReason =
  (typeof PROVENANCE_FAILURE_REASONS)[number];

export type GeneratedClaimClassificationResult =
  | {
      readonly classification: Exclude<ClaimClassification, "UNSUPPORTED">;
      readonly failureReason: null;
    }
  | {
      readonly classification: "UNSUPPORTED";
      readonly failureReason: ProvenanceFailureReason;
    };

export type ClaimAssertionKind =
  | "EMPLOYER_NAME"
  | "CREDENTIAL_NAME"
  | "DURATION_MONTHS"
  | "MANAGEMENT_SCOPE"
  | "NUMERIC_ACHIEVEMENT";

export interface ClaimAssertion {
  readonly kind: ClaimAssertionKind;
  readonly value: string;
}

export interface ClaimEvidenceInput {
  readonly evidenceField: string;
  readonly evidenceId: string;
  readonly evidenceType: string;
  readonly snapshot: Readonly<Record<string, unknown>>;
}

function normalized(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().toLocaleLowerCase("en-US")
    : String(value).toLocaleLowerCase("en-US");
}

function flattenedEvidence(evidence: readonly ClaimEvidenceInput[]) {
  return evidence.flatMap(({ snapshot }) =>
    Object.values(snapshot).flatMap((value) =>
      Array.isArray(value) ? value.map(normalized) : [normalized(value)],
    ),
  );
}

function assertionSupported(
  assertion: ClaimAssertion,
  evidence: readonly ClaimEvidenceInput[],
) {
  const values = flattenedEvidence(evidence);
  const target = normalized(assertion.value);
  if (assertion.kind === "MANAGEMENT_SCOPE") {
    return values.some((value) =>
      /\b(manag(?:e|ed|ing|er)|lead|led|supervis(?:e|ed|ing|or)|direct report|team lead)\b/u.test(
        value,
      ),
    );
  }
  if (assertion.kind === "NUMERIC_ACHIEVEMENT") {
    return values.some((value) => value.includes(target));
  }
  if (assertion.kind === "DURATION_MONTHS") {
    return evidence.some(({ snapshot }) => {
      const start =
        typeof snapshot.startDate === "string"
          ? new Date(snapshot.startDate)
          : null;
      const end =
        typeof snapshot.endDate === "string"
          ? new Date(snapshot.endDate)
          : null;
      if (
        !start ||
        !end ||
        Number.isNaN(start.valueOf()) ||
        Number.isNaN(end.valueOf())
      )
        return false;
      const months =
        (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        end.getUTCMonth() -
        start.getUTCMonth();
      return String(months) === target;
    });
  }
  return values.some((value) => value === target);
}

export function classifyGeneratedClaimDetailed(input: {
  assertions: readonly ClaimAssertion[];
  evidence: readonly ClaimEvidenceInput[];
  intendedClassification: Exclude<ClaimClassification, "UNSUPPORTED">;
}): GeneratedClaimClassificationResult {
  if (input.evidence.length === 0)
    return {
      classification: "UNSUPPORTED",
      failureReason: "NO_LINKED_EVIDENCE",
    };
  if (
    !input.assertions.every((assertion) =>
      assertionSupported(assertion, input.evidence),
    )
  ) {
    return {
      classification: "UNSUPPORTED",
      failureReason: "ASSERTION_NOT_SUPPORTED",
    };
  }
  if (
    input.intendedClassification === "SUPPORTED_INFERENCE" &&
    input.evidence.length < 2
  ) {
    return {
      classification: "UNSUPPORTED",
      failureReason: "INFERENCE_INSUFFICIENT_EVIDENCE",
    };
  }
  return {
    classification: input.intendedClassification,
    failureReason: null,
  };
}

export function classifyGeneratedClaim(
  input: Parameters<typeof classifyGeneratedClaimDetailed>[0],
): ClaimClassification {
  return classifyGeneratedClaimDetailed(input).classification;
}

export function claimCanPassReadiness(
  classification: ClaimClassification,
  evidenceCount: number,
) {
  return classification !== "UNSUPPORTED" && evidenceCount > 0;
}
