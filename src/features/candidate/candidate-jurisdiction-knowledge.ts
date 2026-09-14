import {
  jurisdictionCandidateKnowledgeConcept,
  type CandidateKnowledgeConcept,
} from "@/core/domain/candidate/candidate-knowledge";

export function candidateJurisdictionKnowledgeAnswers(input: {
  readonly authorized: boolean;
  readonly countryCode: string;
  readonly sponsorshipRequired: boolean;
}): readonly {
  readonly concept: CandidateKnowledgeConcept;
  readonly answer: Readonly<Record<string, unknown>>;
}[] {
  const authorizationConcept = jurisdictionCandidateKnowledgeConcept(
    "WORK_AUTHORIZATION",
    input.countryCode,
  );
  const sponsorshipConcept = jurisdictionCandidateKnowledgeConcept(
    "SPONSORSHIP_REQUIREMENT",
    input.countryCode,
  );
  if (!authorizationConcept || !sponsorshipConcept)
    throw new Error("Invalid jurisdiction.");
  return [
    {
      concept: authorizationConcept,
      answer: {
        status: input.authorized ? "Authorized" : "Not authorized",
      },
    },
    {
      concept: sponsorshipConcept,
      answer: { required: input.sponsorshipRequired },
    },
  ];
}
