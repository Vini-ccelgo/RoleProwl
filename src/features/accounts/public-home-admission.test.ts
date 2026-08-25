import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("authenticated public Home admission", () => {
  it("does not load candidate workspace data from raw Clerk authentication", () => {
    const home = readFileSync("src/app/(marketing)/page.tsx", "utf8");
    expect(home).toContain("resolveWorkspaceAdmission(currentAuthProvider())");
    expect(home).toContain('admission.status === "ALLOWED"');
    expect(home).not.toContain("currentAuthProvider().currentActor()");
  });

  it("shows workspace CTAs only after server-resolved admission", () => {
    const header = readFileSync(
      "src/components/layout/marketing-header.tsx",
      "utf8",
    );
    const navigation = readFileSync(
      "src/components/navigation/auth-navigation.tsx",
      "utf8",
    );
    expect(header).toContain(
      'const workspaceAvailable = admission.status === "ALLOWED"',
    );
    expect(header).toContain('admission.status === "PRIVATE_BETA_DENIED"');
    expect(navigation).toContain("workspaceAvailable &&");
    expect(navigation).toContain("Private beta access unavailable");
  });
});
