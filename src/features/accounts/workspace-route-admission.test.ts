import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isProtectedApplicationPath,
  protectedApplicationPaths,
} from "@/lib/auth/config";

const representativeWorkspacePages = [
  "src/app/(app)/dashboard/page.tsx",
  "src/app/(app)/onboarding/page.tsx",
  "src/app/(app)/profile/page.tsx",
  "src/app/(app)/jobs/page.tsx",
  "src/app/(app)/jobs/[jobId]/page.tsx",
  "src/app/(app)/queue/page.tsx",
  "src/app/(app)/applications/page.tsx",
  "src/app/(app)/applications/[applicationId]/page.tsx",
  "src/app/(app)/notifications/page.tsx",
  "src/app/(app)/settings/page.tsx",
] as const;

describe("candidate workspace route admission", () => {
  it("keeps every candidate workspace root behind the protected route list", () => {
    expect(protectedApplicationPaths).toEqual([
      "/dashboard",
      "/onboarding",
      "/profile",
      "/jobs",
      "/queue",
      "/applications",
      "/notifications",
      "/settings",
    ]);
    for (const pathname of protectedApplicationPaths) {
      expect(isProtectedApplicationPath(pathname)).toBe(true);
      expect(isProtectedApplicationPath(`${pathname}/fixture`)).toBe(true);
    }
  });

  it("requires redirect-safe server-side beta admission in the layout and each data page", () => {
    const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");
    expect(layout).toContain("resolveWorkspaceAdmission");
    expect(layout).toContain('admission.status === "PRIVATE_BETA_DENIED"');

    for (const pagePath of representativeWorkspacePages) {
      const page = readFileSync(pagePath, "utf8");
      expect(page, pagePath).toContain("requireWorkspacePageActor");
      expect(page, pagePath).toContain(
        "await requireWorkspacePageActor(currentAuthProvider())",
      );
    }
  });
});
