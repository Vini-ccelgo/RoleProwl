export type LogLevel = "debug" | "info" | "warn" | "error";
export type SafeLogContext = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;
export interface Logger {
  log(level: LogLevel, message: string, context?: SafeLogContext): void;
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
        level,
        message,
        ...context,
        timestamp: new Date().toISOString(),
      }),
    );
  },
};
