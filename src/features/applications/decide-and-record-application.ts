import {
  decideApplication,
  type ApplicationDecisionInput,
} from "@/core/domain/applications/application-decision";

export interface ApplicationDecisionRepository {
  save(input: {
    readonly decision: ReturnType<typeof decideApplication>;
    readonly input: ApplicationDecisionInput;
    readonly queueSnapshot: null | {
      readonly applicationMaterials: unknown;
      readonly fitSnapshot: unknown;
      readonly policyResult: string;
      readonly reasonCodes: readonly string[];
      readonly sourceCapability: unknown;
      readonly unresolvedQuestions: unknown;
    };
  }): Promise<{
    readonly id: string;
    readonly reviewQueueItemId: string | null;
  }>;
}

export async function decideAndRecordApplication(input: {
  readonly decisionInput: ApplicationDecisionInput;
  readonly repository: ApplicationDecisionRepository;
}) {
  const decision = decideApplication(input.decisionInput);
  const saved = await input.repository.save({
    decision,
    input: input.decisionInput,
    queueSnapshot:
      decision.result === "NEEDS_REVIEW"
        ? {
            applicationMaterials: input.decisionInput.materials,
            fitSnapshot: input.decisionInput.fit,
            policyResult: decision.result,
            reasonCodes: decision.reasons,
            sourceCapability: input.decisionInput.sourceCapability,
            unresolvedQuestions: input.decisionInput.questions.filter(
              ({ disposition }) => disposition !== "AUTO_ANSWER",
            ),
          }
        : null,
  });
  return { ...decision, ...saved };
}
