import { describe, expect, it } from "vitest";
import { buildPortableAccountExport } from "./account-export";

describe("portable account export", () => {
  it("labels scope, version, time, and external-data boundary", () => {
    const result = buildPortableAccountExport({
      exportedAt: new Date("2026-08-14T12:00:00.000Z"),
      sections: {
        account: { id: "user-1" },
        answers: [],
        applications: [],
        auditHistory: [],
        candidate: {},
        generatedMaterials: [],
        notifications: [],
        policy: null,
      },
    });
    expect(result.schemaVersion).toBe("roleprowl-account-export-v1");
    expect(result.scope).toBe("RoleProwl-held data");
    expect(result.externalDataNotice).toMatch(/employers or ATS/);
    expect(result.exportedAt).toBe("2026-08-14T12:00:00.000Z");
  });
});
