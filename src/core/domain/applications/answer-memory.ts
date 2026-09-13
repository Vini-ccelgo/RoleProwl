export const ANSWER_CONCEPTS = [
  "US_WORK_AUTHORIZATION",
  "US_FUTURE_SPONSORSHIP",
  "DESIRED_SALARY",
  "WILLING_TO_RELOCATE",
  "REMOTE_PREFERENCE",
  "START_AVAILABILITY",
  "CURRENT_LOCATION",
  "TRAVEL_AVAILABILITY",
  "CURRENT_EMPLOYMENT_STATUS",
  "NOTICE_PERIOD",
  "CURRENT_COMPENSATION",
  "TARGET_ROLE",
  "WORK_ENVIRONMENT_PREFERENCE",
  "PROFESSIONAL_STRENGTHS",
  "REUSABLE_SELF_DESCRIPTION",
  "AI_HIRING_PROCESS_PREFERENCE",
  "GENERAL_DATA_USE_PREFERENCE",
] as const;
export type AnswerConcept = (typeof ANSWER_CONCEPTS)[number];

const CONCEPT_PATTERNS: Readonly<Record<AnswerConcept, readonly RegExp[]>> = {
  US_WORK_AUTHORIZATION: [
    /\b(?:authorized|eligible|permitted) to work (?:in|within) (?:the )?(?:u\.?s\.?|united states)\b/iu,
    /\b(?:u\.?s\.?|united states) work authorization\b/iu,
  ],
  US_FUTURE_SPONSORSHIP: [
    /\b(?:now or in the future ).{0,30}(?:u\.?s\.?|united states).{0,30}(?:sponsorship|sponsor)\b/iu,
    /\b(?:require|need).{0,30}(?:u\.?s\.?|united states).{0,30}(?:visa|immigration|employment)?\s*sponsor/iu,
    /\b(?:u\.?s\.?|united states).{0,20}(?:visa|employment) sponsorship\b/iu,
  ],
  DESIRED_SALARY: [
    /\b(?:desired|expected|target).{0,15}(?:salary|compensation|pay)\b/iu,
    /\b(?:salary|compensation) expectations?\b/iu,
  ],
  WILLING_TO_RELOCATE: [
    /\b(?:willing|open|able) to relocate\b/iu,
    /\brelocation (?:preference|availability)\b/iu,
  ],
  REMOTE_PREFERENCE: [
    /\b(?:remote|hybrid|on[- ]?site).{0,20}(?:preference|arrangement|work)\b/iu,
    /\bpreferred work (?:location|setting)\b/iu,
  ],
  START_AVAILABILITY: [
    /\b(?:available|availability) to (?:begin|start)\b/iu,
    /\b(?:earliest|preferred) start date\b/iu,
    /\bnotice period\b/iu,
  ],
  CURRENT_LOCATION: [
    /\b(?:current|present) (?:city|location|residence)\b/iu,
    /\bwhere (?:are you|do you) (?:currently )?(?:located|live|reside)\b/iu,
  ],
  TRAVEL_AVAILABILITY: [
    /\b(?:willing|able|available) to travel\b/iu,
    /\btravel.{0,15}(?:percent|percentage|%)\b/iu,
  ],
  CURRENT_EMPLOYMENT_STATUS: [
    /\b(?:currently|presently).{0,20}(?:employed|working|unemployed)\b/iu,
    /\bcurrent employment status\b/iu,
  ],
  NOTICE_PERIOD: [/\bnotice period\b/iu],
  CURRENT_COMPENSATION: [/\bcurrent.{0,15}(?:salary|compensation|pay)\b/iu],
  TARGET_ROLE: [
    /\b(?:target|desired|preferred).{0,15}(?:role|position|job)\b/iu,
  ],
  WORK_ENVIRONMENT_PREFERENCE: [
    /\b(?:work|team|company) environment.{0,15}(?:preference|preferred)\b/iu,
  ],
  PROFESSIONAL_STRENGTHS: [/\bprofessional strengths?\b/iu],
  REUSABLE_SELF_DESCRIPTION: [
    /\b(?:describe yourself|professional (?:bio|description|summary))\b/iu,
  ],
  AI_HIRING_PROCESS_PREFERENCE: [
    /\bAI.{0,20}(?:hiring|interview).{0,20}preference\b/iu,
  ],
  GENERAL_DATA_USE_PREFERENCE: [/\b(?:data use|privacy).{0,20}preference\b/iu],
};

export const DEFAULT_REVERIFY_DAYS: Readonly<
  Record<AnswerConcept, number | null>
> = {
  US_WORK_AUTHORIZATION: 90,
  US_FUTURE_SPONSORSHIP: 90,
  DESIRED_SALARY: 30,
  WILLING_TO_RELOCATE: 90,
  REMOTE_PREFERENCE: 90,
  START_AVAILABILITY: 30,
  CURRENT_LOCATION: 30,
  TRAVEL_AVAILABILITY: 90,
  CURRENT_EMPLOYMENT_STATUS: 30,
  NOTICE_PERIOD: 30,
  CURRENT_COMPENSATION: 30,
  TARGET_ROLE: null,
  WORK_ENVIRONMENT_PREFERENCE: null,
  PROFESSIONAL_STRENGTHS: null,
  REUSABLE_SELF_DESCRIPTION: null,
  AI_HIRING_PROCESS_PREFERENCE: 180,
  GENERAL_DATA_USE_PREFERENCE: 180,
};

export function mapQuestionToAnswerConcept(
  question: string,
): AnswerConcept | null {
  const normalized = question.normalize("NFKC").replace(/\s+/gu, " ").trim();
  for (const concept of ANSWER_CONCEPTS) {
    if (CONCEPT_PATTERNS[concept].some((pattern) => pattern.test(normalized)))
      return concept;
  }
  return null;
}

export interface AnswerMemorySnapshot {
  readonly autoAnswerAllowed: boolean;
  readonly concept: string;
  readonly reverifyAfterDays: number | null;
  readonly verifiedAt: Date;
}

export type AnswerMemoryStatus = "FRESH" | "STALE" | "NOT_AUTO_ANSWERABLE";

export function answerMemoryStatus(
  memory: AnswerMemorySnapshot,
  now = new Date(),
): AnswerMemoryStatus {
  if (!memory.autoAnswerAllowed) return "NOT_AUTO_ANSWERABLE";
  if (memory.reverifyAfterDays == null) return "FRESH";
  const expiresAt = new Date(memory.verifiedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + memory.reverifyAfterDays);
  return expiresAt > now ? "FRESH" : "STALE";
}

export function answerMemoryCanAutoAnswer(
  memory: AnswerMemorySnapshot,
  now = new Date(),
) {
  return answerMemoryStatus(memory, now) === "FRESH";
}
