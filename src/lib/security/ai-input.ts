import { ValidationError } from "@/core/errors/application-errors";

export const MAX_AI_INPUT_BYTES = 100 * 1024;
export const MAX_AI_SYSTEM_CHARACTERS = 4_000;

export function serializeBoundedAIInput(input: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new ValidationError("AI task input must be JSON serializable.");
  }
  if (serialized === undefined)
    throw new ValidationError("AI task input is required.");
  if (new TextEncoder().encode(serialized).byteLength > MAX_AI_INPUT_BYTES) {
    throw new ValidationError(
      "AI task input exceeds the supported size limit.",
    );
  }
  return serialized;
}

export function validateAIRequestMetadata(input: {
  readonly correlationId: string;
  readonly rateLimitSubject: string;
  readonly schemaName: string;
  readonly system: string;
}) {
  if (!/^[a-zA-Z0-9:_-]{1,128}$/u.test(input.correlationId))
    throw new ValidationError("The AI correlation identifier is invalid.");
  if (!input.rateLimitSubject.trim() || input.rateLimitSubject.length > 128)
    throw new ValidationError("The AI rate-limit subject is invalid.");
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(input.schemaName))
    throw new ValidationError("The AI response schema name is invalid.");
  if (!input.system.trim() || input.system.length > MAX_AI_SYSTEM_CHARACTERS)
    throw new ValidationError("The AI system instruction is invalid.");
}
