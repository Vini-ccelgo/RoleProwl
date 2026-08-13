import { normalizeSkillName } from "@/core/domain/candidate/truth-vault";
import { normalizeIdentityText, type CanonicalJobInput } from "./job";

const EMPLOYMENT_TYPES: Record<string, string> = {
  fulltime: "FULL_TIME",
  "full-time": "FULL_TIME",
  "full time": "FULL_TIME",
  parttime: "PART_TIME",
  "part-time": "PART_TIME",
  "part time": "PART_TIME",
  contract: "CONTRACT",
  contractor: "CONTRACT",
  internship: "INTERNSHIP",
  intern: "INTERNSHIP",
  temporary: "TEMPORARY",
};

export function normalizeJobTitle(value: string) {
  return normalizeIdentityText(
    value.replace(/[–—]/gu, "-").replace(/\s*\([^)]*\)\s*$/u, ""),
  );
}

export function normalizeCompany(value: string) {
  return normalizeIdentityText(value).replace(
    /[,\s]+(?:inc\.?|llc|ltd\.?)$/u,
    "",
  );
}

export function normalizeLocations(locations: readonly string[] | null) {
  if (locations === null) return null;
  return [
    ...new Set(
      locations
        .map((location) => normalizeIdentityText(location))
        .filter(Boolean),
    ),
  ].sort();
}

export function normalizeEmploymentType(value: string | null) {
  if (value === null) return null;
  return (
    EMPLOYMENT_TYPES[normalizeIdentityText(value).replace(/\s+/gu, " ")] ?? null
  );
}

export function normalizeJobSkills(skills: readonly string[] | null) {
  if (skills === null) return null;
  const distinct = new Map<string, string>();
  for (const skill of skills) {
    const normalized = normalizeSkillName(skill);
    if (normalized && !distinct.has(normalized))
      distinct.set(normalized, skill.trim());
  }
  return [...distinct.values()];
}

export function canonicalizeApplicationUrl(value: string | null) {
  if (!value) return null;
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|source|ref|referrer|gh_src)$/iu.test(key))
      url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLocaleLowerCase("en-US");
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url.toString();
}

export function normalizeCanonicalJob(
  job: CanonicalJobInput,
): CanonicalJobInput {
  return {
    ...job,
    company: job.company.trim().replace(/\s+/gu, " "),
    title: job.title.trim().replace(/\s+/gu, " "),
    canonicalApplicationUrl: canonicalizeApplicationUrl(
      job.canonicalApplicationUrl,
    ),
    description:
      job.description
        ?.replace(/\r\n?/gu, "\n")
        .replace(/[ \t]+/gu, " ")
        .trim() ?? null,
    locations: normalizeLocations(job.locations),
    employmentType: normalizeEmploymentType(job.employmentType),
    salaryCurrency: job.salaryCurrency?.toUpperCase() ?? null,
    skills: normalizeJobSkills(job.skills),
  };
}
