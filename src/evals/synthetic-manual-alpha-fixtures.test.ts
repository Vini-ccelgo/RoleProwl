import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractResumeText } from "@/integrations/documents/extract-resume-text";

const fixtureRoot = join(process.cwd(), "fixtures", "synthetic");

const candidateSchema = z.object({
  fixtureId: z.literal("fictional-candidate-avery-quill-v1"),
  fictional: z.literal(true),
  profile: z.object({
    email: z.string().endsWith(".test"),
    phone: z.string().includes("555-01"),
    location: z.string().min(1),
  }),
  employment: z
    .array(z.object({ employer: z.string().includes("fictional") }))
    .min(2),
  education: z
    .array(z.object({ institution: z.string().includes("fictional") }))
    .min(1),
  skills: z.array(z.object({ name: z.string().min(1) })).min(5),
  projects: z
    .array(z.object({ name: z.string().includes("fictional") }))
    .min(1),
  credentials: z
    .array(z.object({ credentialId: z.string().startsWith("SYNTH-") }))
    .min(1),
  preferences: z.object({
    salaryMinimum: z.number().positive(),
    remotePreference: z.literal("REMOTE"),
  }),
  workAuthorization: z.object({
    requiresSponsorship: z.literal(true),
  }),
  applicationPolicy: z.object({
    autonomyLevel: z.literal("RECOMMEND_ONLY"),
  }),
});

const jobsSchema = z.object({
  fictional: z.literal(true),
  jobs: z
    .array(
      z.object({
        id: z.string().startsWith("synthetic-"),
        company: z.string().includes("fictional"),
        questions: z.array(
          z.object({
            text: z.string(),
            expectedClass: z.string(),
          }),
        ),
      }),
    )
    .min(7),
});

describe("synthetic manual-alpha fixtures", () => {
  it("contains only clearly fictional candidate data with full policy coverage", async () => {
    const candidate = candidateSchema.parse(
      JSON.parse(await readFile(join(fixtureRoot, "candidate.json"), "utf8")),
    );
    expect(candidate.profile.email).toBe("avery.quill@example.test");
  });

  it("covers fit, conflict, sponsorship, sensitive, and attestation cases", async () => {
    const fixture = jobsSchema.parse(
      JSON.parse(await readFile(join(fixtureRoot, "jobs.json"), "utf8")),
    );
    const ids = new Set(fixture.jobs.map((job) => job.id));
    for (const id of [
      "synthetic-strong-fit",
      "synthetic-weak-fit",
      "synthetic-ambiguous-skill",
      "synthetic-missing-mandatory-skill",
      "synthetic-salary-conflict",
      "synthetic-location-conflict",
      "synthetic-sponsorship-conflict",
    ])
      expect(ids).toContain(id);
    const classes = new Set(
      fixture.jobs.flatMap((job) =>
        job.questions.map((question) => question.expectedClass),
      ),
    );
    expect(classes).toEqual(
      new Set([
        "ATTESTATION",
        "JOB_SPECIFIC_FREE_TEXT",
        "LEGAL_OR_CONSEQUENTIAL",
        "SENSITIVE_PERSONAL_DATA",
      ]),
    );
  });

  it("ships an extractable fictional DOCX résumé", async () => {
    const bytes = await readFile(
      join(fixtureRoot, "avery-quill-synthetic-resume.docx"),
    );
    const extraction = await extractResumeText("DOCX", bytes);
    expect(extraction.text).toContain("FICTIONAL TEST DATA");
    expect(extraction.text).toContain("Avery Quill");
    expect(extraction.text).toContain("SYNTH-CLOUD-2048");
  });
});
