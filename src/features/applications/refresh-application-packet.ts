import type { ApplicationPacket } from "@/core/domain/applications/application-packet";
import type { ExplicitApplicationResumeSelection } from "@/core/domain/applications/application-resume";

export interface ApplicationPacketRepository {
  refresh(input: {
    readonly applicationId: string;
    readonly reviewed: boolean;
    readonly resumeSelection?: ExplicitApplicationResumeSelection;
    readonly userId: string;
  }): Promise<ApplicationPacket>;
}

export async function refreshApplicationPacket(input: {
  readonly applicationId: string;
  readonly reviewed?: boolean;
  readonly repository: ApplicationPacketRepository;
  readonly resumeSelection?: ExplicitApplicationResumeSelection;
  readonly userId: string;
}) {
  return input.repository.refresh({
    applicationId: input.applicationId,
    reviewed: input.reviewed ?? false,
    resumeSelection: input.resumeSelection,
    userId: input.userId,
  });
}
