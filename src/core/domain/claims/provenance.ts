export type ClaimClassification =
  "DIRECT_FACT" | "SUPPORTED_REWRITE" | "SUPPORTED_INFERENCE" | "UNSUPPORTED";

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

export function classifyGeneratedClaim(input: {
  assertions: readonly ClaimAssertion[];
  evidence: readonly ClaimEvidenceInput[];
  intendedClassification: Exclude<ClaimClassification, "UNSUPPORTED">;
}): ClaimClassification {
  if (input.evidence.length === 0) return "UNSUPPORTED";
  if (
    !input.assertions.every((assertion) =>
      assertionSupported(assertion, input.evidence),
    )
  ) {
    return "UNSUPPORTED";
  }
  if (
    input.intendedClassification === "SUPPORTED_INFERENCE" &&
    input.evidence.length < 2
  ) {
    return "UNSUPPORTED";
  }
  return input.intendedClassification;
}

export function claimCanPassReadiness(
  classification: ClaimClassification,
  evidenceCount: number,
) {
  return classification !== "UNSUPPORTED" && evidenceCount > 0;
}
