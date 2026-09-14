import type { AIProvider } from "@/core/contracts/ai-provider";
import {
  isCandidateKnowledgeConcept,
  jurisdictionConceptsExplicitlyNamed,
  normalizeLanguageKey,
  type CandidateKnowledgeConcept,
} from "@/core/domain/candidate/candidate-knowledge";
import { aiTaskDefinitions } from "@/features/ai/task-definitions";

export const MAX_CANDIDATE_NARRATIVE_CHARACTERS = 12_000;

export interface CandidateNarrativeProposalDraft {
  readonly concept: CandidateKnowledgeConcept;
  readonly confidence: number;
  readonly origin: "EXPLICIT" | "DERIVED";
  readonly proposedValue: Readonly<Record<string, unknown>>;
  readonly reusable: true;
  readonly supportingText: string;
}

const NARRATIVE_LANGUAGE_NAMES: Readonly<Record<string, readonly string[]>> = {
  english: ["english", "inglês", "ingles"],
  spanish: ["spanish", "espanhol"],
  portuguese: ["portuguese", "português", "portugues"],
  french: ["french", "francês", "frances"],
  german: ["german", "alemão", "alemao"],
};
const PROFICIENCY_LANGUAGE =
  /\b(?:beginner|basic|elementary|intermediate|advanced|professional|fluent|fluency|native|iniciante|b[aá]sico|intermedi[aá]ri[oa]|avan[cç]ad[oa]|profissional|fluente|flu[eê]ncia|nativ[oa])\b/iu;

function languageProficiencyConceptsExplicitlyNamed(narrative: string) {
  const concepts = new Set<CandidateKnowledgeConcept>();
  for (const segment of narrative
    .normalize("NFKC")
    .split(/[.!?;\n]+/u)
    .map((item) => item.trim())
    .filter(Boolean)) {
    if (!PROFICIENCY_LANGUAGE.test(segment)) continue;
    const normalized = segment.toLocaleLowerCase("en-US");
    for (const [language, names] of Object.entries(NARRATIVE_LANGUAGE_NAMES))
      if (names.some((name) => normalized.includes(name)))
        concepts.add(`LANGUAGE_PROFICIENCY:${normalizeLanguageKey(language)}`);
  }
  return [...concepts];
}

export function candidateNarrativeEligibleConcepts(input: {
  readonly allowedConcepts: readonly CandidateKnowledgeConcept[];
  readonly knownConcepts?: readonly CandidateKnowledgeConcept[];
  readonly narrative: string;
}) {
  const knownConcepts = new Set(input.knownConcepts ?? []);
  return [
    ...new Set([
      ...input.allowedConcepts,
      ...jurisdictionConceptsExplicitlyNamed(input.narrative),
      ...languageProficiencyConceptsExplicitlyNamed(input.narrative),
    ]),
  ].filter((concept) => !knownConcepts.has(concept));
}

export async function extractCandidateNarrativeProposals(input: {
  readonly ai: AIProvider;
  readonly allowedConcepts: readonly CandidateKnowledgeConcept[];
  readonly correlationId: string;
  readonly knownConcepts?: readonly CandidateKnowledgeConcept[];
  readonly narrative: string;
  readonly userId: string;
}) {
  const narrative = input.narrative.trim();
  if (!narrative || narrative.length > MAX_CANDIDATE_NARRATIVE_CHARACTERS)
    throw new Error("Candidate narrative must contain 1 to 12,000 characters.");
  const definition = aiTaskDefinitions.CANDIDATE_NARRATIVE_EXTRACTION;
  const allowedConcepts = new Set(
    candidateNarrativeEligibleConcepts({
      allowedConcepts: input.allowedConcepts,
      knownConcepts: input.knownConcepts,
      narrative,
    }),
  );
  const generated = await input.ai.generateStructured({
    task: "CANDIDATE_NARRATIVE_EXTRACTION",
    dataClassification: "REAL_CANDIDATE",
    correlationId: input.correlationId,
    rateLimitSubject: input.userId,
    promptVersion: definition.promptVersion,
    schemaName: definition.schemaName,
    schema: definition.schema,
    system: definition.system,
    modelPreference: "LITE",
    allowFlashEscalation: false,
    input: {
      candidateNarrative: narrative,
      allowedConcepts: [...allowedConcepts],
    },
  });
  const proposals = generated.data.proposals.flatMap((proposal) => {
    if (
      !isCandidateKnowledgeConcept(proposal.concept) ||
      !allowedConcepts.has(proposal.concept) ||
      !narrative.includes(proposal.supportingText)
    )
      return [];
    return [
      {
        concept: proposal.concept,
        confidence: proposal.confidence,
        origin: proposal.origin,
        proposedValue: { text: proposal.value },
        reusable: true,
        supportingText: proposal.supportingText,
      } satisfies CandidateNarrativeProposalDraft,
    ];
  });
  return {
    generatedCount: generated.data.proposals.length,
    metadata: generated.metadata,
    proposals,
  };
}
