import { describe, expect, it } from "vitest";
import {
  buildPortableAccountExport,
  sanitizePortableExportValue,
} from "./account-export";

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
        productEvents: [],
        policy: null,
      },
    });
    expect(result.schemaVersion).toBe("roleprowl-account-export-v1");
    expect(result.scope).toBe("RoleProwl-held data");
    expect(result.externalDataNotice).toMatch(/employers or ATS/);
    expect(result.exportedAt).toBe("2026-08-14T12:00:00.000Z");
  });

  it("removes internal object/provider locators without deleting candidate data", () => {
    const result = sanitizePortableExportValue({
      answer: "Candidate-authorized answer",
      documents: [
        {
          fileName: "resume.pdf",
          storageKey: "candidate-documents/private-key",
        },
      ],
      providerRequestId: "provider-private-request",
    });
    expect(result).toEqual({
      answer: "Candidate-authorized answer",
      documents: [{ fileName: "resume.pdf" }],
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });
});
