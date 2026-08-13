export type ApplicationErrorCode =
  | "VALIDATION"
  | "AUTHORIZATION"
  | "NOT_FOUND"
  | "INTEGRATION"
  | "CONFIGURATION";
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
