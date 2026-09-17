import type {
  CandidateKnowledgeConcept,
  CandidateKnowledgeQueryResult,
} from "@/core/domain/candidate/candidate-knowledge";
import type {
  ApplicationQuestionResolution,
  ResolvableApplicationQuestion,
} from "@/core/domain/applications/application-question-resolution";
import {
  applicationAnswerValues,
  encodedApplicationAnswer,
} from "@/core/domain/applications/application-packet";
import {
  exactChoiceMatches,
  normalizedChoiceText,
} from "@/core/domain/applications/choice-taxonomy";

type EducationItem = Readonly<Record<string, unknown>>;

function options(question: ResolvableApplicationQuestion) {
  return question.optionIdentities?.length
    ? question.optionIdentities
    : question.options.map((option) => ({ label: option, value: option }));
}

function encodedChoice(
  question: ResolvableApplicationQuestion,
  values: readonly string[],
) {
  return question.fieldTypes.includes("multi_value_multi_select")
    ? JSON.stringify([...new Set(values)])
    : encodedApplicationAnswer(values);
}

function referenceId(result: CandidateKnowledgeQueryResult) {
  return `${result.concept}:${result.provenance?.source ?? "UNKNOWN"}:${result.provenance?.sourceId ?? "NONE"}`;
}

function canAutoResolve(result: CandidateKnowledgeQueryResult) {
  return (
    result.candidateApproved &&
    result.autoAnswerAllowed &&
    result.reusable &&
    result.applicationUse === "REUSABLE_ANSWER" &&
    result.freshness !== "STALE"
  );
}

function educationItems(result: CandidateKnowledgeQueryResult | undefined) {
  return Array.isArray(result?.value?.items)
    ? result.value.items.filter((item): item is EducationItem =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
    : [];
}

function text(item: EducationItem, key: string) {
  const value = item[key];
  return typeof value === "string" ? value.trim() : "";
}

export function educationCompletionEstablished(
  item: EducationItem,
  now = new Date(),
) {
  const status = normalizedChoiceText(text(item, "status"));
  if (
    /\b(?:complete|completed|graduated|concluded|concluido|concluida|formado|formada)\b/u.test(
      status,
    )
  )
    return true;
  const endDate = text(item, "endDate");
  if (endDate) {
    const parsed = Date.parse(endDate);
    if (Number.isFinite(parsed) && parsed <= now.getTime()) return true;
  }
  return /\b(?:completed|graduated|degree awarded|concluido|concluida|formado|formada)\b/u.test(
    normalizedChoiceText(text(item, "text")),
  );
}

export function isEducationCourseTaxonomy(
  question: ResolvableApplicationQuestion,
) {
  const value = normalizedChoiceText(question.label);
  return (
    question.options.length > 0 &&
    /\b(?:course|degree field|field of study|program|curso|formou|graduacao)\b/u.test(
      value,
    ) &&
    !isEducationCompletionQuestion(question)
  );
}

export function isEducationCompletionQuestion(
  question: ResolvableApplicationQuestion,
) {
  const value = normalizedChoiceText(question.label);
  const labels = options(question).map((option) =>
    normalizedChoiceText(option.label),
  );
  const yesNo =
    labels.some((label) => /^(?:yes|sim)\b/u.test(label)) &&
    labels.some((label) => /^(?:no|nao)\b/u.test(label)) &&
    labels.every((label) => /^(?:yes|no|sim|nao)\b/u.test(label));
  return (
    yesNo &&
    /\b(?:completed|complete|graduated|completo|completa|concluido|concluida).{0,30}(?:education|degree|college|university|curso|graduacao)|(?:education|degree|college|university|curso|graduacao).{0,30}(?:completed|complete|graduated|completo|completa|concluido|concluida)\b/u.test(
      value,
    )
  );
}

export function isEmployerRelationshipTaxonomy(
  question: ResolvableApplicationQuestion,
) {
  const value = normalizedChoiceText(question.label);
  return /\b(?:know|conhece).{0,40}(?:employee|works at|funcionario|trabalha)|(?:spouse|family member|friend|former work colleague|conjuge|familiar|amigo|ex colega)\b/u.test(
    value,
  );
}

function explicitPreviousNegative(input: {
  readonly applicationAnswers?: Readonly<Record<string, string>>;
  readonly question: ResolvableApplicationQuestion;
  readonly questions: readonly ResolvableApplicationQuestion[];
}) {
  const index = input.questions.findIndex(
    (question) => question.id === input.question.id,
  );
  const previous = index > 0 ? input.questions[index - 1] : null;
  const stored = previous ? input.applicationAnswers?.[previous.id] : undefined;
  if (!previous || !stored) return false;
  const identities = options(previous);
  const labels = applicationAnswerValues(stored).flatMap((value) => {
    const match = identities.find(
      (option) => option.value === value || option.label === value,
    );
    return match ? [normalizedChoiceText(match.label)] : [];
  });
  return (
    labels.length > 0 && labels.every((label) => /^(?:no|nao)\b/u.test(label))
  );
}

export interface DeterministicChoiceTaxonomyResult {
  readonly resolution: ApplicationQuestionResolution | null;
  readonly semanticEvidence: readonly {
    readonly referenceId: string;
    readonly concept: CandidateKnowledgeConcept;
    readonly value: string;
    readonly autoResolve: boolean;
  }[];
}

export function resolveChoiceTaxonomyDeterministically(input: {
  readonly applicationAnswers?: Readonly<Record<string, string>>;
  readonly knowledge: ReadonlyMap<
    CandidateKnowledgeConcept,
    CandidateKnowledgeQueryResult
  >;
  readonly now?: Date;
  readonly question: ResolvableApplicationQuestion;
  readonly questions: readonly ResolvableApplicationQuestion[];
}): DeterministicChoiceTaxonomyResult | null {
  const question = input.question;
  if (isEmployerRelationshipTaxonomy(question))
    return {
      resolution: {
        questionId: question.id,
        canonicalConcept: null,
        disposition: "CANDIDATE_REQUIRED",
        value: null,
        candidateKnowledgeReferences: [],
        reasonCode: "EMPLOYER_SPECIFIC_RELATIONSHIP_REQUIRED",
      },
      semanticEvidence: [],
    };

  const course = isEducationCourseTaxonomy(question);
  const completion = isEducationCompletionQuestion(question);
  if (!course && !completion) return null;
  const candidate = input.knowledge.get("EDUCATION_HISTORY");
  const references = candidate ? [referenceId(candidate)] : [];
  const items = educationItems(candidate);
  const completed = items.filter((item) =>
    educationCompletionEstablished(item, input.now),
  );
  if (course) {
    const normalizedLabel = normalizedChoiceText(question.label);
    if (
      /\b(?:if no|if not|caso.{0,20}nao|se.{0,20}nao).{0,60}\b(?:n a|na|not applicable)\b/u.test(
        normalizedLabel,
      ) &&
      explicitPreviousNegative(input)
    ) {
      const sentinel = options(question).filter((option) =>
        /^(?:n ?a|not applicable)$/u.test(normalizedChoiceText(option.label)),
      );
      if (sentinel.length === 1)
        return {
          resolution: {
            questionId: question.id,
            canonicalConcept: "EDUCATION_HISTORY",
            disposition: "AUTO_RESOLVED",
            value: encodedChoice(question, [sentinel[0]!.value]),
            candidateKnowledgeReferences: [],
            reasonCode: "EXPLICIT_CONTROLLING_ANSWER_SELECTED_SENTINEL",
          },
          semanticEvidence: [],
        };
    }
    if (!candidate || candidate.status === "MISSING" || !items.length)
      return {
        resolution: {
          questionId: question.id,
          canonicalConcept: "EDUCATION_HISTORY",
          disposition: "CANDIDATE_REQUIRED",
          value: null,
          candidateKnowledgeReferences: [],
          reasonCode: "CANDIDATE_KNOWLEDGE_MISSING",
        },
        semanticEvidence: [],
      };
    if (
      candidate.conflict ||
      candidate.status === "STALE_CONFIRMATION_REQUIRED" ||
      candidate.freshness === "STALE"
    )
      return {
        resolution: {
          questionId: question.id,
          canonicalConcept: "EDUCATION_HISTORY",
          disposition: "CANDIDATE_REQUIRED",
          value: null,
          candidateKnowledgeReferences: references,
          reasonCode: candidate.conflict
            ? "CANDIDATE_KNOWLEDGE_CONFLICT"
            : "CANDIDATE_KNOWLEDGE_STALE",
        },
        semanticEvidence: [],
      };
    if (!completed.length)
      return {
        resolution: {
          questionId: question.id,
          canonicalConcept: "EDUCATION_HISTORY",
          disposition: "CANDIDATE_REQUIRED",
          value: null,
          candidateKnowledgeReferences: references,
          reasonCode: "EDUCATION_COMPLETION_NOT_ESTABLISHED",
        },
        semanticEvidence: [],
      };
    const disciplines = completed.flatMap((item) =>
      [text(item, "program"), text(item, "credential")].filter(Boolean),
    );
    const matches = exactChoiceMatches(disciplines, options(question));
    if (matches.length)
      return {
        resolution: {
          questionId: question.id,
          canonicalConcept: "EDUCATION_HISTORY",
          disposition: canAutoResolve(candidate)
            ? "AUTO_RESOLVED"
            : "PROPOSED_FOR_CANDIDATE",
          value: encodedChoice(question, matches),
          candidateKnowledgeReferences: references,
          reasonCode: canAutoResolve(candidate)
            ? "EXACT_TAXONOMY_MATCH"
            : "EXACT_TAXONOMY_APPROVAL_REQUIRED",
        },
        semanticEvidence: [],
      };
    return {
      resolution: null,
      semanticEvidence: candidate.candidateApproved
        ? completed.flatMap((item, index) => {
            const value = [text(item, "program"), text(item, "credential")]
              .filter(Boolean)
              .join(" — ");
            return value
              ? [
                  {
                    referenceId: `${references[0]}:item-${index + 1}`,
                    concept: "EDUCATION_HISTORY" as const,
                    value,
                    autoResolve: canAutoResolve(candidate),
                  },
                ]
              : [];
          })
        : [],
    };
  }

  if (!candidate || candidate.status === "MISSING" || !completed.length)
    return {
      resolution: {
        questionId: question.id,
        canonicalConcept: "EDUCATION_HISTORY",
        disposition: "CANDIDATE_REQUIRED",
        value: null,
        candidateKnowledgeReferences: references,
        reasonCode: "EDUCATION_COMPLETION_NOT_ESTABLISHED",
      },
      semanticEvidence: [],
    };
  if (
    candidate.conflict ||
    candidate.status === "STALE_CONFIRMATION_REQUIRED" ||
    candidate.freshness === "STALE"
  )
    return {
      resolution: {
        questionId: question.id,
        canonicalConcept: "EDUCATION_HISTORY",
        disposition: "CANDIDATE_REQUIRED",
        value: null,
        candidateKnowledgeReferences: references,
        reasonCode: candidate.conflict
          ? "CANDIDATE_KNOWLEDGE_CONFLICT"
          : "CANDIDATE_KNOWLEDGE_STALE",
      },
      semanticEvidence: [],
    };
  const adapted = options(question).filter((option) =>
    /^(?:yes|sim)\b/u.test(normalizedChoiceText(option.label)),
  );
  return {
    resolution:
      adapted.length === 1
        ? {
            questionId: question.id,
            canonicalConcept: "EDUCATION_HISTORY",
            disposition: canAutoResolve(candidate)
              ? "AUTO_RESOLVED"
              : "PROPOSED_FOR_CANDIDATE",
            value: encodedChoice(question, [adapted[0]!.value]),
            candidateKnowledgeReferences: references,
            reasonCode: canAutoResolve(candidate)
              ? "EDUCATION_COMPLETION_ESTABLISHED"
              : "EDUCATION_COMPLETION_APPROVAL_REQUIRED",
          }
        : null,
    semanticEvidence: [],
  };
}
