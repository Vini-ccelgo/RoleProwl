import { z } from "zod";

const requiredText = z.string().trim().min(1, "This field is required");
const optionalText = z
  .string()
  .trim()
  .transform((value) => value || undefined);
const optionalUrl = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .pipe(z.url().optional());
const dateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));
const optionalDateText = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .pipe(dateText.optional());

export function splitList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function normalizeSkillName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

export function normalizeSkillAliases(
  aliases: readonly string[],
  canonicalName: string,
): string[] {
  const canonical = normalizeSkillName(canonicalName);
  const byNormalizedName = new Map<string, string>();
  for (const alias of aliases) {
    const trimmed = alias.trim();
    const normalized = normalizeSkillName(trimmed);
    if (
      trimmed &&
      normalized !== canonical &&
      !byNormalizedName.has(normalized)
    ) {
      byNormalizedName.set(normalized, trimmed);
    }
  }
  return [...byNormalizedName.values()];
}

export const candidateProfileSchema = z.object({
  firstName: requiredText.max(100),
  lastName: requiredText.max(100),
  applicationEmail: z.preprocess(
    (value) => (typeof value === "string" && !value.trim() ? undefined : value),
    z.email().optional(),
  ),
  professionalTitle: optionalText,
  summary: optionalText,
  phone: optionalText,
  location: optionalText,
  countryCode: z.preprocess(
    (value) => (typeof value === "string" && !value.trim() ? undefined : value),
    z
      .string()
      .trim()
      .length(2, "Use a two-letter country code")
      .transform((value) => value.toUpperCase())
      .optional(),
  ),
  websiteUrl: optionalUrl,
  linkedInUrl: optionalUrl,
});

export const workExperienceSchema = z
  .object({
    id: optionalText,
    employer: requiredText.max(200),
    title: requiredText.max(200),
    employmentType: optionalText,
    startDate: dateText,
    endDate: optionalDateText,
    isCurrent: z.boolean(),
    location: optionalText,
    description: optionalText,
    responsibilities: z.array(z.string()),
    achievements: z.array(z.string()),
  })
  .superRefine((value, context) => {
    if (value.isCurrent && value.endDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Current employment cannot have an end date",
      });
    }
    if (!value.isCurrent && !value.endDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date is required unless this is current employment",
      });
    }
    if (value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date cannot be before start date",
      });
    }
  });

export const educationSchema = z
  .object({
    id: optionalText,
    institution: requiredText.max(200),
    program: optionalText,
    credential: optionalText,
    startDate: optionalDateText,
    endDate: optionalDateText,
    status: optionalText,
    coursework: z.array(z.string()),
  })
  .refine(
    (value) =>
      !value.startDate || !value.endDate || value.endDate >= value.startDate,
    { path: ["endDate"], message: "End date cannot be before start date" },
  );

export const skillSchema = z.object({
  id: optionalText,
  canonicalName: requiredText.max(120),
  category: optionalText,
  aliases: z.array(z.string()),
  proficiency: optionalText,
  experienceMonths: z.number().int().min(0).max(1200).optional(),
});

export const projectSchema = z
  .object({
    id: optionalText,
    name: requiredText.max(200),
    role: optionalText,
    description: optionalText,
    startDate: optionalDateText,
    endDate: optionalDateText,
    url: optionalUrl,
    skills: z.array(z.string()),
    outcomes: z.array(z.string()),
  })
  .refine(
    (value) =>
      !value.startDate || !value.endDate || value.endDate >= value.startDate,
    { path: ["endDate"], message: "End date cannot be before start date" },
  );

export const credentialSchema = z
  .object({
    id: optionalText,
    name: requiredText.max(200),
    issuer: optionalText,
    issuedAt: optionalDateText,
    expiresAt: optionalDateText,
    credentialId: optionalText,
    credentialUrl: optionalUrl,
  })
  .refine(
    (value) =>
      !value.issuedAt || !value.expiresAt || value.expiresAt >= value.issuedAt,
    { path: ["expiresAt"], message: "Expiry cannot precede issue date" },
  );

export const candidatePreferencesSchema = z.object({
  roleFamilies: z.array(z.string()),
  industries: z.array(z.string()),
  remotePreference: optionalText,
  locationPreferences: z.array(z.string()),
  salaryMinimum: z.number().int().positive().optional(),
  salaryCurrency: optionalText,
  employmentTypes: z.array(z.string()),
  seniorities: z.array(z.string()),
  maximumTravelPercent: z.number().int().min(0).max(100).optional(),
  willingToRelocate: z.boolean().optional(),
  exclusions: z.array(z.string()),
});

export const workAuthorizationSchema = z.object({
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
  authorizationStatus: requiredText.max(120),
  requiresSponsorship: z.boolean(),
  notes: optionalText,
});

export type VerificationState =
  "UNVERIFIED" | "VERIFIED" | "STALE" | "DISPUTED";
export type FactSource =
  "USER_ENTERED" | "RESUME_EXTRACTED" | "IMPORT" | "SYSTEM_COMPUTED";
