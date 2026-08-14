import { describe, expect, it } from "vitest";
import { ValidationError } from "@/core/errors/application-errors";
import {
  assertContentLength,
  assertContentType,
  assertMutationRequestIsSameOrigin,
} from "./request-security";

describe("HTTP mutation request security", () => {
  it("accepts same-origin browser requests and rejects cross-origin requests", () => {
    const same = new Request("https://roleprowl.test/api/value", {
      headers: {
        origin: "https://roleprowl.test",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(() => assertMutationRequestIsSameOrigin(same)).not.toThrow();

    const crossOriginHeaders: Array<Record<string, string>> = [
      { origin: "https://attacker.test" },
      { "sec-fetch-site": "cross-site" },
    ];
    for (const headers of crossOriginHeaders) {
      expect(() =>
        assertMutationRequestIsSameOrigin(
          new Request("https://roleprowl.test/api/value", { headers }),
        ),
      ).toThrow(ValidationError);
    }
  });

  it("validates media type and declared request length", () => {
    const request = new Request("https://roleprowl.test/api/value", {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-length": "2048",
      },
    });
    expect(() => assertContentType(request, "application/json")).not.toThrow();
    expect(() => assertContentLength(request, 4096)).not.toThrow();
    expect(() => assertContentLength(request, 1024)).toThrow(ValidationError);
    expect(() => assertContentType(request, "multipart/form-data")).toThrow(
      ValidationError,
    );
  });
});
