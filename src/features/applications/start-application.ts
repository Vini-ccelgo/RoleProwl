import { ValidationError } from "@/core/errors/application-errors";
import type { ApplicationState } from "@/core/domain/applications/application-tracker";

export interface StartedApplication {
  readonly applicationId: string;
  readonly created: boolean;
  readonly state: ApplicationState;
}

export interface ApplicationStartRepository {
  createOrGet(input: {
    readonly jobId: string;
    readonly userId: string;
  }): Promise<StartedApplication>;
}

export async function startApplication(input: {
  readonly jobId: string;
  readonly repository: ApplicationStartRepository;
  readonly userId: string;
}) {
  if (!input.jobId.trim() || !input.userId.trim())
    throw new ValidationError("A candidate and job are required.");
  return input.repository.createOrGet({
    jobId: input.jobId,
    userId: input.userId,
  });
}
