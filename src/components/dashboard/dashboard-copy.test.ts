import { describe, expect, it } from "vitest";
import { DASHBOARD_RECORDS_DESCRIPTION } from "./dashboard-copy";

describe("dashboard records copy", () => {
  it("describes database-derived figures without claiming a live stream", () => {
    expect(DASHBOARD_RECORDS_DESCRIPTION).toBe(
      "Current figures from your RoleProwl records.",
    );
    expect(DASHBOARD_RECORDS_DESCRIPTION).not.toContain("Live totals");
    expect(DASHBOARD_RECORDS_DESCRIPTION).not.toContain("sample activity");
  });
});
