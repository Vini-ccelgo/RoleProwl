import { describe, expect, it } from "vitest";
import {
  isClerkConfigured,
  isProtectedApplicationPath,
  safeInternalRedirect,
} from "./config";

describe("authentication configuration", () => {
  it("requires both Clerk keys before enabling the provider", () => {
    expect(isClerkConfigured({})).toBe(false);
    expect(
      isClerkConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x" }),
    ).toBe(false);
    expect(
      isClerkConfigured({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
        CLERK_SECRET_KEY: "sk_test_x",
      }),
    ).toBe(true);
  });

  it("recognizes protected routes and their nested resources", () => {
    expect(isProtectedApplicationPath("/jobs")).toBe(true);
    expect(isProtectedApplicationPath("/jobs/job-1")).toBe(true);
    expect(isProtectedApplicationPath("/notifications")).toBe(true);
    expect(isProtectedApplicationPath("/privacy")).toBe(false);
  });

  it("accepts only same-origin relative redirect targets", () => {
    expect(safeInternalRedirect("/jobs?sort=fit", "/dashboard")).toBe(
      "/jobs?sort=fit",
    );
    expect(safeInternalRedirect("//attacker.test", "/dashboard")).toBe(
      "/dashboard",
    );
    expect(safeInternalRedirect("https://attacker.test", "/dashboard")).toBe(
      "/dashboard",
    );
  });
});
