import { IntegrationError } from "./application-errors";

export class SourceAdapterError extends IntegrationError {
  constructor(
    readonly source: string,
    readonly sourceCode: string,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause);
  }
}
