import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, sanitizeLogContext } from "./logger";

afterEach(() => vi.restoreAllMocks());

describe("structured logging", () => {
  it("redacts sensitive fields and bounds ordinary strings", () => {
    expect(
      sanitizeLogContext({
        apiToken: "secret-value",
        candidateEmail: "person@example.test",
        operation: "x".repeat(300),
        status: "ok",
      }),
    ).toEqual({
      apiToken: "[REDACTED]",
      candidateEmail: "[REDACTED]",
      operation: `${"x".repeat(256)}…`,
      status: "ok",
    });
  });

  it("keeps untrusted context from overriding the log envelope", () => {
    const write = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logger.log("info", "safe_event", {
      level: "forged",
      message: "forged",
      password: "not-for-logs",
    });
    const output = JSON.parse(String(write.mock.calls[0]?.[0])) as {
      context: Record<string, string>;
      level: string;
      message: string;
    };
    expect(output).toMatchObject({ level: "info", message: "safe_event" });
    expect(output.context).toMatchObject({
      level: "forged",
      message: "forged",
      password: "[REDACTED]",
    });
    expect(String(write.mock.calls[0]?.[0])).not.toContain("not-for-logs");
  });
});
