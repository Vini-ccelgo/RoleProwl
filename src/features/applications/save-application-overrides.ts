import type {
  ApplicationIdentityKey,
  ApplicationPacket,
} from "@/core/domain/applications/application-packet";
import { ValidationError } from "@/core/errors/application-errors";

export interface ApplicationOverrideChange {
  readonly key: string;
  readonly value: string | null;
}

export interface ApplicationOverrideRepository {
  save(input: {
    readonly applicationId: string;
    readonly userId: string;
    readonly identity: readonly ApplicationOverrideChange[];
    readonly answers: readonly ApplicationOverrideChange[];
  }): Promise<ApplicationPacket>;
}

function normalizedChanges(changes: readonly ApplicationOverrideChange[]) {
  const unique = new Map<string, string | null>();
  for (const change of changes) {
    const key = change.key.trim();
    if (!key || key.length > 500)
      throw new ValidationError("An application field identifier is invalid.");
    const value = change.value?.normalize("NFKC").trim() || null;
    if (value && value.length > 4_000)
      throw new ValidationError(
        "Application-specific answers must be 4,000 characters or fewer.",
      );
    unique.set(key, value);
  }
  return [...unique].map(([key, value]) => ({ key, value }));
}

export async function saveApplicationOverrides(input: {
  readonly applicationId: string;
  readonly userId: string;
  readonly identity: readonly {
    readonly key: ApplicationIdentityKey;
    readonly value: string | null;
  }[];
  readonly answers: readonly ApplicationOverrideChange[];
  readonly repository: ApplicationOverrideRepository;
}) {
  if (!input.applicationId.trim())
    throw new ValidationError("Application identifier is required.");
  return input.repository.save({
    applicationId: input.applicationId,
    userId: input.userId,
    identity: normalizedChanges(input.identity),
    answers: normalizedChanges(input.answers),
  });
}
