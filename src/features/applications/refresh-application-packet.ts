import type { ApplicationPacket } from "@/core/domain/applications/application-packet";

export interface ApplicationPacketRepository {
  refresh(input: {
    readonly applicationId: string;
    readonly reviewed: boolean;
    readonly userId: string;
  }): Promise<ApplicationPacket>;
}

export async function refreshApplicationPacket(input: {
  readonly applicationId: string;
  readonly reviewed?: boolean;
  readonly repository: ApplicationPacketRepository;
  readonly userId: string;
}) {
  return input.repository.refresh({
    applicationId: input.applicationId,
    reviewed: input.reviewed ?? false,
    userId: input.userId,
  });
}
