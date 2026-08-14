export type LogLevel = "debug" | "info" | "warn" | "error";
export type SafeLogContext = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;
export interface Logger {
  log(level: LogLevel, message: string, context?: SafeLogContext): void;
}
const SENSITIVE_KEY =
  /(?:answer|authorization|content|cookie|credential|document|email|evidence|input|name|password|payload|phone|prompt|resume|secret|session|token)/iu;
const MAX_LOG_STRING_LENGTH = 256;

export function sanitizeLogContext(context: SafeLogContext): SafeLogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key)
        ? "[REDACTED]"
        : typeof value === "string" && value.length > MAX_LOG_STRING_LENGTH
          ? `${value.slice(0, MAX_LOG_STRING_LENGTH)}…`
          : value,
    ]),
  );
}
const consoleMethod: Record<LogLevel, "debug" | "info" | "warn" | "error"> = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
};
export const logger: Logger = {
  log(level, message, context = {}) {
    console[consoleMethod[level]](
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        context: sanitizeLogContext(context),
      }),
    );
  },
};
