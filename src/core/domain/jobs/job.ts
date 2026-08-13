import { createHash } from "node:crypto";
import { z } from "zod";

const optionalArray = <T extends z.ZodType>(item: T) =>
  z.array(item).nullable();

export const canonicalJobSchema = z
  .object({
    company: z.string().trim().min(1),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).nullable(),
    canonicalApplicationUrl: z.url().nullable(),
    locations: optionalArray(z.string().trim().min(1)),
    remoteType: z.enum(["ONSITE", "HYBRID", "REMOTE"]).nullable(),
    employmentType: z.string().nullable(),
    seniority: z.string().nullable(),
    salaryMin: z.number().nonnegative().nullable(),
    salaryMax: z.number().nonnegative().nullable(),
    salaryCurrency: z.string().length(3).nullable(),
    salaryInterval: z.string().nullable(),
    requirements: optionalArray(z.string()),
    preferredRequirements: optionalArray(z.string()),
    skills: optionalArray(z.string()),
    educationRequirements: optionalArray(z.string()),
    experienceRequirements: optionalArray(z.string()),
    workAuthorization: z.record(z.string(), z.unknown()).nullable(),
    sponsorship: z.record(z.string(), z.unknown()).nullable(),
    postedAt: z.date().nullable(),
    expiresAt: z.date().nullable(),
  })
  .superRefine((job, context) => {
    if (
      job.salaryMin != null &&
      job.salaryMax != null &&
      job.salaryMin > job.salaryMax
    ) {
      context.addIssue({
        code: "custom",
        path: ["salaryMax"],
        message: "Maximum salary cannot be below minimum",
      });
    }
  });

export type CanonicalJobInput = z.infer<typeof canonicalJobSchema>;

export function normalizeIdentityText(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

export function canonicalJobContentHash(job: CanonicalJobInput) {
  const stable = JSON.stringify({
    company: normalizeIdentityText(job.company),
    title: normalizeIdentityText(job.title),
    description: job.description,
    locations: job.locations,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    seniority: job.seniority,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    requirements: job.requirements,
    skills: job.skills,
  });
  return createHash("sha256").update(stable).digest("hex");
}
