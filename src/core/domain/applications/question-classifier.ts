export const APPLICATION_QUESTION_CLASSIFICATIONS = [
  "PROFILE_FACT",
  "COMPUTABLE_FACT",
  "USER_POLICY",
  "JOB_SPECIFIC_FREE_TEXT",
  "SENSITIVE_PERSONAL_DATA",
  "LEGAL_OR_CONSEQUENTIAL",
  "ATTESTATION",
  "UNKNOWN",
] as const;
export type ApplicationQuestionClassification =
  (typeof APPLICATION_QUESTION_CLASSIFICATIONS)[number];

export interface QuestionClassificationResult {
  readonly classification: ApplicationQuestionClassification;
  readonly confidence: number;
  readonly rationaleCode: string;
  readonly source: "DETERMINISTIC" | "AI_ASSISTED";
}

type Rule = Readonly<{
  classification: ApplicationQuestionClassification;
  code: string;
  pattern: RegExp;
}>;

// Ordering is policy: explicit legal acceptance wins over incidental profile words,
// and sensitive/consequential questions are resolved before lower-risk categories.
const RULES: readonly Rule[] = [
  {
    classification: "ATTESTATION",
    code: "ATTESTATION_LANGUAGE",
    pattern:
      /\b(i certify|i attest|under penalty|electronic signature|statements? (?:is|are) (?:true|accurate)|agree to (?:the )?terms|acknowledge (?:that|receipt)|authorize .{0,30}(?:background|check))\b/iu,
  },
  {
    classification: "SENSITIVE_PERSONAL_DATA",
    code: "SENSITIVE_IDENTITY_OR_HEALTH",
    pattern:
      /\b(disability|disabilities|disabled|medical condition|health condition|race|racial|ethnic|ethnicity|gender|sex assigned|sexual orientation|religion|veteran status|date of birth|birth date|age|marital status|pregnan(?:t|cy)|genetic information)\b/iu,
  },
  {
    classification: "LEGAL_OR_CONSEQUENTIAL",
    code: "WORK_AUTHORIZATION_OR_LEGAL_STATUS",
    pattern:
      /\b(authorized to work|work authorization|require.{0,20}sponsorship|visa sponsorship|immigration status|security clearance|non[- ]?compete|criminal (?:record|history)|convicted|export control|legally eligible)\b/iu,
  },
  {
    classification: "USER_POLICY",
    code: "CANDIDATE_PREFERENCE_OR_POLICY",
    pattern:
      /\b(desired salary|salary expectations?|compensation expectations?|willing to relocate|relocation|travel.{0,20}(?:percent|%)|available to start|start date|notice period|remote work|onsite|hybrid schedule|shift preference)\b/iu,
  },
  {
    classification: "COMPUTABLE_FACT",
    code: "DERIVABLE_CANDIDATE_FACT",
    pattern:
      /\b(how many years|years? of experience|months? of experience|total experience|graduation year)\b/iu,
  },
  {
    classification: "PROFILE_FACT",
    code: "DIRECT_PROFILE_FIELD",
    pattern:
      /\b(full name|first name|last name|email address|phone number|home address|current location|linkedin|portfolio|website|current employer|current title|highest degree)\b/iu,
  },
  {
    classification: "JOB_SPECIFIC_FREE_TEXT",
    code: "ROLE_SPECIFIC_NARRATIVE",
    pattern:
      /\b(why (?:are you|do you)|interested in (?:this|the) (?:role|position|company)|tell us about|describe (?:a|your)|what (?:makes|interests|excites)|cover letter|motivation)\b/iu,
  },
];

export function classifyQuestionDeterministically(
  question: string,
): QuestionClassificationResult {
  const normalized = question.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!normalized)
    return {
      classification: "UNKNOWN",
      confidence: 1,
      rationaleCode: "EMPTY_QUESTION",
      source: "DETERMINISTIC",
    };
  const rule = RULES.find(({ pattern }) => pattern.test(normalized));
  return rule
    ? {
        classification: rule.classification,
        confidence: 1,
        rationaleCode: rule.code,
        source: "DETERMINISTIC",
      }
    : {
        classification: "UNKNOWN",
        confidence: 0,
        rationaleCode: "NO_DETERMINISTIC_MATCH",
        source: "DETERMINISTIC",
      };
}

export function isSafetyCriticalClassification(
  classification: ApplicationQuestionClassification,
) {
  return (
    classification === "SENSITIVE_PERSONAL_DATA" ||
    classification === "LEGAL_OR_CONSEQUENTIAL" ||
    classification === "ATTESTATION"
  );
}
