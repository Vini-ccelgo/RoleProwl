export type ApplicationErrorCode =
  | "VALIDATION"
  | "AUTHORIZATION"
  | "NOT_FOUND"
  | "INTEGRATION"
  | "CONFIGURATION"
  | "CONFLICT"
  | "EXTRACTION_UNSUPPORTED"
  | "AI_REFUSAL"
  | "AI_INVALID_OUTPUT"
  | "AI_CAPACITY"
  | "RATE_LIMITED";
export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly code: ApplicationErrorCode,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
export class ValidationError extends ApplicationError {
  constructor(message: string) {
    super(message, "VALIDATION");
  }
}
export class AuthorizationError extends ApplicationError {
  constructor(message = "This action is not authorized") {
    super(message, "AUTHORIZATION");
  }
}
export class NotFoundError extends ApplicationError {
  constructor(message = "The requested resource was not found") {
    super(message, "NOT_FOUND");
  }
}
export class IntegrationError extends ApplicationError {
  constructor(message: string, cause?: unknown) {
    super(message, "INTEGRATION", cause);
  }
}
export class ConfigurationError extends ApplicationError {
  constructor(message: string) {
    super(message, "CONFIGURATION");
  }
}
export class ExtractionUnsupportedError extends ApplicationError {
  constructor(message: string, cause?: unknown) {
    super(message, "EXTRACTION_UNSUPPORTED", cause);
  }
}
export class ConflictError extends ApplicationError {
  constructor(message: string) {
    super(message, "CONFLICT");
  }
}
export class AIRefusalError extends ApplicationError {
  constructor(message = "The AI provider declined this request.") {
    super(message, "AI_REFUSAL");
  }
}
export class AIInvalidOutputError extends ApplicationError {
  constructor(message: string, cause?: unknown) {
    super(message, "AI_INVALID_OUTPUT", cause);
  }
}
export class AIProviderCapacityError extends ApplicationError {
  constructor(
    readonly state: "LIMIT_REACHED" | "RATE_LIMITED" | "PROVIDER_UNAVAILABLE",
    readonly retryAfterSeconds: number | null,
    readonly model: string,
  ) {
    super(
      "AI capacity is temporarily unavailable. The task can be retried later.",
      "AI_CAPACITY",
    );
  }
}
export class RateLimitExceededError extends ApplicationError {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests. Try again later.", "RATE_LIMITED");
  }
}
