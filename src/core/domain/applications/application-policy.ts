export type ApplicationPolicyResult =
  | "REJECT"
  | "RECOMMEND"
  | "AUTO_PREPARE"
  | "NEEDS_REVIEW"
  | "ELIGIBLE_FOR_SUBMISSION";

export type ApplicationPolicyReasonCode =
  | "AUTHORIZATION_CONFLICT"
  | "AUTOMATION_NOT_AUTHORIZED"
  | "COMPANY_BLACKLISTED"
  | "DAILY_LIMIT_REACHED"
  | "EMPLOYMENT_TYPE_EXCLUDED"
  | "EMPLOYMENT_TYPE_UNKNOWN"
  | "FIT_BELOW_MINIMUM"
  | "LOCATION_EXCLUDED"
  | "LOCATION_UNKNOWN"
  | "REMOTE_REQUIRED"
  | "REMOTE_TYPE_UNKNOWN"
  | "ROLE_FAMILY_EXCLUDED"
  | "ROLE_FAMILY_UNKNOWN"
  | "SALARY_BELOW_MINIMUM"
  | "SALARY_UNKNOWN"
  | "SENIORITY_EXCLUDED"
  | "SOURCE_CANNOT_SUBMIT"
  | "UNRESOLVED_SENSITIVE_QUESTION"
  | "UNSUPPORTED_CLAIM";

export interface CandidateApplicationPolicy {
  readonly allowedEmploymentTypes: readonly string[];
  readonly allowedLocations: readonly string[];
  readonly allowedRoleFamilies: readonly string[];
  readonly autonomyLevel:
    "RECOMMEND_ONLY" | "AUTO_PREPARE" | "AUTO_SUBMIT_AUTHORIZED";
  readonly companyBlacklist: readonly string[];
  readonly dailyApplicationLimit: number;
  readonly excludedSeniorities: readonly string[];
  readonly minimumOverallFit: number;
  readonly rejectAuthorizationConflict: boolean;
  readonly requireRemote: boolean;
  readonly salaryMinimum: number | null;
}

export interface ApplicationPolicyContext {
  readonly applicationsToday: number;
  readonly authorizationConflict: boolean;
  readonly company: string;
  readonly employmentType: string | null;
  readonly location: string | null;
  readonly overallFit: number;
  readonly remoteType: "ONSITE" | "HYBRID" | "REMOTE" | null;
  readonly roleFamily: string | null;
  readonly salaryMaximum: number | null;
  readonly seniority: string | null;
  readonly sourceCanSubmit: boolean;
  readonly submissionAuthorized: boolean;
  readonly unresolvedSensitiveQuestions: number;
  readonly unsupportedClaims: number;
}

export interface ApplicationPolicyDecision {
  readonly result: ApplicationPolicyResult;
  readonly reasons: readonly ApplicationPolicyReasonCode[];
  readonly version: "application-policy-v1";
}

function normalized(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function includesNormalized(values: readonly string[], value: string | null) {
  return value != null && values.map(normalized).includes(normalized(value));
}

export function evaluateApplicationPolicy(
  policy: CandidateApplicationPolicy,
  context: ApplicationPolicyContext,
): ApplicationPolicyDecision {
  const rejectReasons: ApplicationPolicyReasonCode[] = [];
  const reviewReasons: ApplicationPolicyReasonCode[] = [];

  if (includesNormalized(policy.companyBlacklist, context.company))
    rejectReasons.push("COMPANY_BLACKLISTED");
  if (policy.allowedRoleFamilies.length > 0) {
    if (context.roleFamily == null) reviewReasons.push("ROLE_FAMILY_UNKNOWN");
    else if (
      !includesNormalized(policy.allowedRoleFamilies, context.roleFamily)
    )
      rejectReasons.push("ROLE_FAMILY_EXCLUDED");
  }
  if (includesNormalized(policy.excludedSeniorities, context.seniority))
    rejectReasons.push("SENIORITY_EXCLUDED");
  if (context.overallFit < policy.minimumOverallFit)
    rejectReasons.push("FIT_BELOW_MINIMUM");
  if (policy.allowedEmploymentTypes.length > 0) {
    if (context.employmentType == null)
      reviewReasons.push("EMPLOYMENT_TYPE_UNKNOWN");
    else if (
      !includesNormalized(policy.allowedEmploymentTypes, context.employmentType)
    )
      rejectReasons.push("EMPLOYMENT_TYPE_EXCLUDED");
  }
  if (policy.requireRemote) {
    if (context.remoteType == null) reviewReasons.push("REMOTE_TYPE_UNKNOWN");
    else if (context.remoteType !== "REMOTE")
      rejectReasons.push("REMOTE_REQUIRED");
  }
  if (policy.allowedLocations.length > 0) {
    if (context.location == null) reviewReasons.push("LOCATION_UNKNOWN");
    else if (!includesNormalized(policy.allowedLocations, context.location))
      rejectReasons.push("LOCATION_EXCLUDED");
  }
  if (policy.salaryMinimum != null) {
    if (context.salaryMaximum == null) reviewReasons.push("SALARY_UNKNOWN");
    else if (context.salaryMaximum < policy.salaryMinimum)
      rejectReasons.push("SALARY_BELOW_MINIMUM");
  }
  if (policy.rejectAuthorizationConflict && context.authorizationConflict)
    rejectReasons.push("AUTHORIZATION_CONFLICT");

  if (rejectReasons.length)
    return {
      result: "REJECT",
      reasons: rejectReasons,
      version: "application-policy-v1",
    };
  if (context.applicationsToday >= policy.dailyApplicationLimit)
    reviewReasons.push("DAILY_LIMIT_REACHED");
  if (context.unresolvedSensitiveQuestions > 0)
    reviewReasons.push("UNRESOLVED_SENSITIVE_QUESTION");
  if (context.unsupportedClaims > 0) reviewReasons.push("UNSUPPORTED_CLAIM");
  if (reviewReasons.length)
    return {
      result: "NEEDS_REVIEW",
      reasons: reviewReasons,
      version: "application-policy-v1",
    };

  if (policy.autonomyLevel === "RECOMMEND_ONLY")
    return {
      result: "RECOMMEND",
      reasons: [],
      version: "application-policy-v1",
    };
  if (policy.autonomyLevel === "AUTO_PREPARE")
    return {
      result: "AUTO_PREPARE",
      reasons: [],
      version: "application-policy-v1",
    };
  if (!context.sourceCanSubmit)
    return {
      result: "AUTO_PREPARE",
      reasons: ["SOURCE_CANNOT_SUBMIT"],
      version: "application-policy-v1",
    };
  if (!context.submissionAuthorized)
    return {
      result: "NEEDS_REVIEW",
      reasons: ["AUTOMATION_NOT_AUTHORIZED"],
      version: "application-policy-v1",
    };
  return {
    result: "ELIGIBLE_FOR_SUBMISSION",
    reasons: [],
    version: "application-policy-v1",
  };
}
