import { createHash } from "node:crypto";
import { z } from "zod";
import {
  canonicalJobContentHash,
  type CanonicalJobInput,
} from "@/core/domain/jobs/job";
import {
  decideJobDeduplication,
  type DeduplicationCandidate,
} from "@/core/domain/jobs/deduplication";
import {
  matchCandidateToJob,
  type CandidateMatchSnapshot,
  type JobMatchResult,
  type JobMatchSnapshot,
  type MatchEvidence,
  type SkillRequirement,
} from "@/core/domain/matching/match-job";
import {
  discoverPersonalJobs,
  type PersonalDiscoveryEnvironment,
  type PersonalDiscoveryFetch,
} from "./personal-discovery";
import type {
  PersonalSourceName,
  PersonalSourceStatus,
  PersonalTargetedSource,
} from "./personal-source-types";
import { buildPersonalSearchPlan } from "./search-planner";

const stringList = z.array(z.string().trim().min(1)).default([]);

export const personalPreferencesSchema = z
  .object({
    targetRoles: stringList,
    searchTerms: stringList,
    locations: stringList,
    remotePreferred: z.boolean().default(false),
    minimumSalary: z.number().nonnegative().nullable().default(null),
    excludedSeniorities: stringList,
    excludedCompanies: stringList,
    employmentTypes: stringList,
    maximumJobAgeDays: z.number().int().min(1).max(365).default(30),
    adzunaCountry: z
      .string()
      .trim()
      .regex(/^[a-z]{2}$/iu)
      .transform((value) => value.toLocaleLowerCase("en-US"))
      .nullable()
      .default(null),
    semanticLimit: z.number().int().min(0).max(50).default(25),
  })
  .strict();

export type PersonalPreferences = z.infer<typeof personalPreferencesSchema>;

export const defaultPersonalPreferences: PersonalPreferences = {
  targetRoles: [],
  searchTerms: [],
  locations: [],
  remotePreferred: false,
  minimumSalary: null,
  excludedSeniorities: [],
  excludedCompanies: [],
  employmentTypes: [],
  maximumJobAgeDays: 30,
  adzunaCountry: null,
  semanticLimit: 25,
};

/** Source-compatible alias retained for the original personal-mode API. */
export type PersonalSource = PersonalTargetedSource;

export interface PersonalProwlStats {
  readonly sources: number;
  readonly jobsDiscovered: number;
  readonly jobsNormalized: number;
  readonly jobsDeduplicated: number;
  readonly jobsPassedHardFilters: number;
  readonly jobsFiltered: number;
  readonly jobsEvaluated: number;
  readonly jobsReturned: number;
}

export interface PersonalJobProvenance {
  readonly source: PersonalSourceName;
  readonly label: string;
  readonly sourceJobId: string;
  readonly sourceUrl: string;
}

export interface PersonalJobResult {
  readonly id: string;
  readonly rank: number;
  readonly stateStatus?: string;
  readonly isNew?: boolean;
  readonly fitScore: number;
  readonly deterministicFitScore: number;
  readonly confidence: number;
  readonly title: string;
  readonly company: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly remoteStatus: "ONSITE" | "HYBRID" | "REMOTE" | null;
  readonly employmentType: string | null;
  readonly postedAt: string | null;
  readonly freshness: "CURRENT" | "STALE" | "UNKNOWN";
  readonly salaryMin: number | null;
  readonly salaryMax: number | null;
  readonly salaryCurrency: string | null;
  readonly salaryInterval: string | null;
  readonly applicationUrl: string | null;
  readonly sources: readonly PersonalJobProvenance[];
  readonly strongMatches: readonly MatchEvidence[];
  readonly partialMatches: readonly MatchEvidence[];
  readonly importantGaps: readonly MatchEvidence[];
  readonly hardConflicts: readonly MatchEvidence[];
  readonly unknowns: readonly MatchEvidence[];
  readonly explanation: string;
  readonly semanticSummary?: string | null;
}

export interface PersonalFilteredJob {
  readonly id: string;
  readonly title: string;
  readonly company: string;
  readonly reasons: readonly string[];
}

export interface PersonalProwlResult {
  readonly generatedAt: string;
  readonly mode: "DETERMINISTIC_LOCAL" | "LOCAL_AI_ENHANCED";
  readonly searchQueries: readonly string[];
  readonly stats: PersonalProwlStats;
  readonly sources: readonly PersonalSourceStatus[];
  readonly sourceErrors: readonly string[];
  readonly filteredJobs: readonly PersonalFilteredJob[];
  readonly jobs: readonly PersonalJobResult[];
}

const SKILL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "Active Directory": ["active directory"],
  Agile: ["agile"],
  Ansible: ["ansible"],
  AWS: ["aws", "amazon web services"],
  Azure: ["azure"],
  Bash: ["bash"],
  "Burp Suite": ["burp suite"],
  "C#": ["c#", "c sharp"],
  "C++": ["c++"],
  "CIS Controls": ["cis controls"],
  "Cloud Security": ["cloud security"],
  Compliance: ["compliance"],
  "Customer Success": ["customer success"],
  "Data Analysis": ["data analysis", "data analytics"],
  DNS: ["dns"],
  Docker: ["docker"],
  EDR: ["edr", "endpoint detection and response"],
  Excel: ["excel"],
  Firewalls: ["firewall", "firewalls"],
  Forensics: ["digital forensics", "forensics"],
  GCP: ["gcp", "google cloud platform"],
  Git: ["git"],
  GDPR: ["gdpr"],
  GraphQL: ["graphql"],
  HIPAA: ["hipaa"],
  IAM: ["iam", "identity and access management"],
  "Incident Response": ["incident response"],
  "ISO 27001": ["iso 27001", "iso27001"],
  Java: ["java"],
  JavaScript: ["javascript"],
  Jira: ["jira"],
  Kubernetes: ["kubernetes", "k8s"],
  Linux: ["linux"],
  "Machine Learning": ["machine learning"],
  "Malware Analysis": ["malware analysis"],
  Marketing: ["marketing"],
  "MITRE ATT&CK": ["mitre att&ck", "mitre attack"],
  MySQL: ["mysql"],
  Nessus: ["nessus"],
  "Network Security": ["network security"],
  "Next.js": ["next.js", "nextjs"],
  "NIST CSF": ["nist csf", "nist cybersecurity framework"],
  "Node.js": ["node.js", "nodejs"],
  OAuth: ["oauth", "oauth2"],
  Okta: ["okta"],
  "PCI DSS": ["pci dss", "pci-dss"],
  "Penetration Testing": ["penetration testing", "pentesting"],
  PostgreSQL: ["postgresql", "postgres"],
  PowerShell: ["powershell"],
  "Power BI": ["power bi", "powerbi"],
  "Product Management": ["product management"],
  "Project Management": ["project management"],
  Python: ["python"],
  React: ["react"],
  "REST APIs": ["rest api", "rest apis", "restful api", "restful apis"],
  "Risk Assessment": ["risk assessment", "risk analysis"],
  SAML: ["saml"],
  Sales: ["sales"],
  Scrum: ["scrum"],
  SIEM: ["siem", "security information and event management"],
  SOC: ["security operations center", "soc analyst", "soc operations"],
  "SOC 2": ["soc 2", "soc2"],
  Splunk: ["splunk"],
  SQL: ["sql"],
  Tableau: ["tableau"],
  "TCP/IP": ["tcp/ip", "tcp ip"],
  Terraform: ["terraform"],
  "Threat Intelligence": ["threat intelligence", "cyber threat intelligence"],
  TypeScript: ["typescript"],
  "Vulnerability Management": [
    "vulnerability management",
    "vulnerability assessment",
  ],
  Windows: ["windows"],
  Wireshark: ["wireshark"],
  XDR: ["xdr", "extended detection and response"],
};

function normalizedSearchText(value: string) {
  return ` ${value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
    .trim()} `;
}

function aliasesInText(text: string) {
  const found = new Set<string>();
  const normalized = normalizedSearchText(text);
  for (const [skill, aliases] of Object.entries(SKILL_ALIASES)) {
    if (
      aliases.some((alias) =>
        normalized.includes(` ${normalizedSearchText(alias).trim()} `),
      )
    )
      found.add(skill);
  }
  return found;
}

export interface ParsedPersonalResume {
  readonly sections: Readonly<Record<string, readonly string[]>>;
  readonly skills: readonly string[];
  readonly languages: readonly string[];
  readonly location: string | null;
  readonly authorizationCountries: readonly string[] | null;
  readonly requiresSponsorship: boolean | null;
}

export function parsePersonalResume(resume: string): ParsedPersonalResume {
  const sections: Record<string, string[]> = { general: [] };
  let current = "general";
  const headings =
    /^(summary|profile|skills?|experience|employment|education|projects?|certifications?|credentials?|languages?|location|work authorization)\s*:?\s*(.*)$/iu;
  for (const rawLine of resume.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(headings);
    if (heading) {
      current = heading[1].toLocaleLowerCase("en-US");
      sections[current] ??= [];
      if (heading[2]) sections[current].push(heading[2]);
    } else sections[current].push(line);
  }
  const skills = aliasesInText(resume);
  for (const [heading, lines] of Object.entries(sections)) {
    if (!/^skills?$/u.test(heading)) continue;
    for (const token of lines.join(" ").split(/[,;|•·]/u)) {
      const skill = token.trim().replace(/^[-–—]\s*/u, "");
      if (skill.length >= 2 && skill.length <= 50 && !/[.!?]{2,}/u.test(skill))
        skills.add(skill);
    }
  }
  const languages = Object.entries(sections)
    .filter(([heading]) => /^languages?$/u.test(heading))
    .flatMap(([, lines]) => lines)
    .flatMap((line) => line.split(/[,;|]/u))
    .map((value) => value.trim())
    .filter(Boolean);
  const location = sections.location?.join(" ").trim() || null;
  const requiresSponsorship = /\brequires? (?:visa )?sponsorship\b/iu.test(
    resume,
  )
    ? true
    : /\b(?:no sponsorship required|does not require sponsorship)\b/iu.test(
          resume,
        )
      ? false
      : null;
  const authorizationCountries =
    /\bauthorized to work (?:in )?(?:the )?(?:united states|u\.?s\.?|usa)\b/iu.test(
      resume,
    )
      ? ["US"]
      : /\bauthorized to work (?:in )?brazil\b/iu.test(resume)
        ? ["BR"]
        : null;
  return {
    sections,
    skills: [...skills].sort((left, right) => left.localeCompare(right)),
    languages,
    location,
    authorizationCountries,
    requiresSponsorship,
  };
}

function parseTarget(value: string, kind: PersonalTargetedSource["kind"]) {
  const trimmed = value.trim();
  if (!/^https?:\/\//iu.test(trimmed))
    return { value: trimmed, region: "GLOBAL" as const };
  const url = new URL(trimmed);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("source URLs must use HTTPS without credentials");
  const host = url.hostname.toLocaleLowerCase("en-US");
  const segments = url.pathname.split("/").filter(Boolean);
  if (kind === "GREENHOUSE") {
    if (
      ![
        "boards.greenhouse.io",
        "job-boards.greenhouse.io",
        "boards-api.greenhouse.io",
      ].includes(host)
    )
      throw new Error(`unsupported Greenhouse host: ${host}`);
    const boards = segments.indexOf("boards");
    return {
      value:
        host === "boards-api.greenhouse.io" && boards >= 0
          ? segments[boards + 1]
          : segments[0],
      region: "GLOBAL" as const,
    };
  }
  if (kind === "LEVER") {
    if (
      ![
        "jobs.lever.co",
        "jobs.eu.lever.co",
        "api.lever.co",
        "api.eu.lever.co",
      ].includes(host)
    )
      throw new Error(`unsupported Lever host: ${host}`);
    return {
      value: segments[0],
      region: host.includes(".eu.") ? ("EU" as const) : ("GLOBAL" as const),
    };
  }
  if (!["jobs.ashbyhq.com", "api.ashbyhq.com"].includes(host))
    throw new Error(`unsupported Ashby host: ${host}`);
  const boardIndex = segments.indexOf("job-board");
  return {
    value: boardIndex >= 0 ? segments[boardIndex + 1] : segments[0],
    region: "GLOBAL" as const,
  };
}

function inferredCompany(value: string) {
  return value
    .replace(/[-_]+/gu, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-US"));
}

export function parsePersonalSources(
  contents: string,
): PersonalTargetedSource[] {
  const sources: PersonalTargetedSource[] = [];
  const seen = new Set<string>();
  for (const [index, rawLine] of contents.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|").map((part) => part.trim());
    try {
      let kind: PersonalTargetedSource["kind"] = "GREENHOUSE";
      let company: string;
      let target: string;
      if (parts.length === 3) {
        const declared = parts[0].toLocaleLowerCase("en-US");
        if (!["greenhouse", "lever", "lever-eu", "ashby"].includes(declared))
          throw new Error(
            "source type must be greenhouse, lever, lever-eu, or ashby",
          );
        kind = declared.startsWith("lever")
          ? "LEVER"
          : declared === "ashby"
            ? "ASHBY"
            : "GREENHOUSE";
        company = parts[1];
        target = parts[2];
      } else if (parts.length === 2) {
        company = parts[0];
        target = parts[1];
      } else if (parts.length === 1) {
        target = parts[0];
        company = inferredCompany(target);
      } else throw new Error("use type|Company|identifier-or-URL");
      const parsed = parseTarget(target, kind);
      if (!parsed.value || !/^[a-zA-Z0-9_-]+$/u.test(parsed.value))
        throw new Error("source identifier contains unsupported characters");
      const identity =
        `${kind}:${parsed.value}:${parsed.region}`.toLocaleLowerCase("en-US");
      if (seen.has(identity)) continue;
      seen.add(identity);
      if (kind === "GREENHOUSE")
        sources.push({
          kind,
          company: company || inferredCompany(parsed.value),
          boardToken: parsed.value,
        });
      else if (kind === "LEVER")
        sources.push({
          kind,
          company: company || inferredCompany(parsed.value),
          site: parsed.value,
          region:
            parts[0]?.toLocaleLowerCase("en-US") === "lever-eu"
              ? "EU"
              : parsed.region,
        });
      else
        sources.push({
          kind,
          company: company || inferredCompany(parsed.value),
          boardName: parsed.value,
        });
    } catch (error) {
      throw new Error(
        `Invalid source on line ${index + 1}: ${error instanceof Error ? error.message : "unknown source error"}`,
      );
    }
  }
  return sources;
}

function detectRemoteType(job: CanonicalJobInput) {
  if (job.remoteType) return job.remoteType;
  const location = `${job.title} ${(job.locations ?? []).join(" ")}`;
  const all = `${location} ${job.description ?? ""}`;
  if (/\bremote\b/iu.test(location) || /\bfully remote\b/iu.test(all))
    return "REMOTE" as const;
  if (/\bhybrid\b/iu.test(all)) return "HYBRID" as const;
  if (/\b(?:on[- ]?site|in[- ]office)\b/iu.test(all)) return "ONSITE" as const;
  return null;
}

function detectSeniority(title: string, explicit: string | null) {
  if (explicit) return explicit.toLocaleUpperCase("en-US");
  if (/\b(?:intern|internship)\b/iu.test(title)) return "INTERN";
  if (/\b(?:junior|jr\.?|entry[- ]level|graduate)\b/iu.test(title))
    return "JUNIOR";
  if (
    /\b(?:principal|staff|lead|director|head|vp|vice president)\b/iu.test(title)
  )
    return "LEAD";
  if (/\b(?:senior|sr\.?)\b/iu.test(title)) return "SENIOR";
  if (/\b(?:mid[- ]level|intermediate)\b/iu.test(title)) return "MID";
  return null;
}

function detectMaximumAnnualSalary(job: CanonicalJobInput) {
  if (job.salaryMax != null) return job.salaryMax;
  const description = job.description;
  if (!description || /\b(?:per hour|hourly|\/hr)\b/iu.test(description))
    return null;
  const values: number[] = [];
  for (const match of description.matchAll(
    /(?:\$|usd\s*)?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?\s*k)\b/giu,
  )) {
    const raw = match[1].replace(/\s+/gu, "").toLocaleLowerCase("en-US");
    const amount = raw.endsWith("k")
      ? Number(raw.slice(0, -1)) * 1_000
      : Number(raw.replaceAll(",", ""));
    if (Number.isFinite(amount) && amount >= 10_000 && amount <= 2_000_000)
      values.push(amount);
  }
  return values.length ? Math.max(...values) : null;
}

function skillRequirements(description: string | null) {
  if (!description) return { required: null, preferred: null } as const;
  const required = new Set<string>();
  const preferred = new Set<string>();
  let section: "required" | "preferred" = "preferred";
  for (const part of description.split(/\r?\n|(?<=[.!?])\s+/u)) {
    if (
      /\b(?:required|requirements|must have|minimum qualifications?)\b/iu.test(
        part,
      )
    )
      section = "required";
    if (/\b(?:preferred|nice to have|bonus|desired)\b/iu.test(part))
      section = "preferred";
    for (const skill of aliasesInText(part))
      (section === "required" ? required : preferred).add(skill);
  }
  for (const skill of required) preferred.delete(skill);
  const convert = (skills: Set<string>): SkillRequirement[] | null =>
    skills.size
      ? [...skills].sort().map((name) => ({
          name,
          minimumExperienceMonths: null,
          minimumProficiency: null,
        }))
      : null;
  return { required: convert(required), preferred: convert(preferred) };
}

function detectAuthorization(description: string | null) {
  if (!description) return { countries: null, sponsorship: null } as const;
  const us = /\b(?:united states|u\.?s\.?|usa)\b/iu.test(description);
  const brazil = /\bbrazil\b/iu.test(description);
  const required = /\b(?:authorized to work|work authorization)\b/iu.test(
    description,
  );
  const sponsorship = /\b(?:sponsorship available|will sponsor)\b/iu.test(
    description,
  )
    ? true
    : /\b(?:no sponsorship|without sponsorship|unable to sponsor|will not sponsor)\b/iu.test(
          description,
        )
      ? false
      : null;
  return {
    countries: required ? (us ? ["US"] : brazil ? ["BR"] : null) : null,
    sponsorship,
  } as const;
}

function candidateSnapshot(resume: string, preferences: PersonalPreferences) {
  const parsed = parsePersonalResume(resume);
  return {
    authorizationCountries: parsed.authorizationCountries,
    requiresSponsorship: parsed.requiresSponsorship,
    clearances: null,
    educationLevels: null,
    experienceMonths: null,
    industries: null,
    languages: parsed.languages.length ? parsed.languages : null,
    licenses: null,
    locationExclusions: null,
    preferredIndustries: null,
    preferredLocations: preferences.locations.length
      ? preferences.locations
      : null,
    preferredRemoteTypes: preferences.remotePreferred ? ["REMOTE"] : null,
    preferredRoleFamilies: preferences.targetRoles.length
      ? preferences.targetRoles
      : null,
    requiredSalaryMinimum: preferences.minimumSalary,
    roleFamilies: null,
    seniority: null,
    skills: parsed.skills.map((name) => ({
      name,
      proficiency: null,
      experienceMonths: null,
    })),
  } satisfies CandidateMatchSnapshot;
}

function jobSnapshot(job: CanonicalJobInput): JobMatchSnapshot {
  const skills = skillRequirements(job.description);
  const authorization = detectAuthorization(job.description);
  return {
    authorizationCountries: authorization.countries,
    educationLevels: null,
    excludedSkills: null,
    industry: null,
    locations: job.locations,
    maximumSalary: detectMaximumAnnualSalary(job),
    minimumExperienceMonths: null,
    preferredSkills: skills.preferred,
    remoteType: detectRemoteType(job),
    requiredClearance: null,
    requiredLanguages: null,
    requiredLicenses: null,
    requiredSkills: skills.required,
    roleFamily: null,
    seniority: detectSeniority(job.title, job.seniority),
    sponsorshipAvailable: authorization.sponsorship,
  };
}

function roleAlignment(title: string, targets: readonly string[]) {
  if (!targets.length) return { score: 50, target: null };
  const titleWords = new Set(
    normalizedSearchText(title)
      .trim()
      .split(/\s+/u)
      .filter((word) => word.length > 2),
  );
  let best = { score: 0, target: targets[0] as string };
  for (const target of targets) {
    const words = normalizedSearchText(target)
      .trim()
      .split(/\s+/u)
      .filter((word) => word.length > 2);
    const overlap = words.length
      ? words.filter((word) => titleWords.has(word)).length / words.length
      : 0;
    const score = normalizedSearchText(title).includes(
      normalizedSearchText(target).trim(),
    )
      ? 100
      : Math.round(overlap * 100);
    if (score > best.score) best = { score, target };
  }
  return best;
}

function localEvidence(
  job: CanonicalJobInput,
  snapshot: JobMatchSnapshot,
  preferences: PersonalPreferences,
) {
  const strengths: MatchEvidence[] = [];
  const partialMatches: MatchEvidence[] = [];
  const gaps: MatchEvidence[] = [];
  const unknowns: MatchEvidence[] = [];
  const alignment = roleAlignment(job.title, preferences.targetRoles);
  if (alignment.target) {
    const evidence = `${job.title} compared with target ${alignment.target}`;
    (alignment.score >= 75
      ? strengths
      : alignment.score >= 35
        ? partialMatches
        : gaps
    ).push({
      code:
        alignment.score >= 75
          ? "TARGET_ROLE"
          : alignment.score >= 35
            ? "TARGET_ROLE_PARTIAL"
            : "TARGET_ROLE_GAP",
      label:
        alignment.score >= 75
          ? "Target-role alignment"
          : alignment.score >= 35
            ? "Partial target-role alignment"
            : "Title does not match a target role",
      evidence,
    });
  }
  if (!job.description)
    unknowns.push({
      code: "DESCRIPTION_UNKNOWN",
      label: "Job description is unavailable",
      evidence: "The public source did not provide a description",
    });
  if (!job.locations?.length)
    unknowns.push({
      code: "LOCATION_UNKNOWN",
      label: "Location is unknown",
      evidence: "The public source did not provide a location",
    });
  if (!snapshot.remoteType)
    unknowns.push({
      code: "REMOTE_STATUS_UNKNOWN",
      label: "Remote status is unknown",
      evidence: "No explicit remote, hybrid, or onsite statement was found",
    });
  if (!job.postedAt)
    unknowns.push({
      code: "POSTED_DATE_UNKNOWN",
      label: "Posted date is unknown",
      evidence: "The public source did not provide a reliable posting date",
    });
  if (!job.canonicalApplicationUrl)
    unknowns.push({
      code: "APPLICATION_URL_UNKNOWN",
      label: "Application URL is unavailable",
      evidence: "The public source did not provide a usable HTTPS URL",
    });
  return { alignment, strengths, partialMatches, gaps, unknowns };
}

function normalized(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("en-US");
}

function hardFilterReasons(
  job: CanonicalJobInput,
  snapshot: JobMatchSnapshot,
  match: JobMatchResult,
  preferences: PersonalPreferences,
  now: Date,
) {
  const reasons: string[] = [];
  if (
    preferences.excludedCompanies.some(
      (company) => normalized(company) === normalized(job.company),
    )
  )
    reasons.push("Company is excluded by personal preferences");
  if (
    snapshot.seniority &&
    preferences.excludedSeniorities.some(
      (value) => normalized(value) === normalized(snapshot.seniority as string),
    )
  )
    reasons.push(`Seniority ${snapshot.seniority} is excluded`);
  const maximumSalary = detectMaximumAnnualSalary(job);
  if (
    preferences.minimumSalary != null &&
    maximumSalary != null &&
    maximumSalary < preferences.minimumSalary
  )
    reasons.push(
      `Known maximum salary ${maximumSalary} is below minimum ${preferences.minimumSalary}`,
    );
  if (
    preferences.employmentTypes.length &&
    job.employmentType &&
    !preferences.employmentTypes.some(
      (value) =>
        normalized(value).replaceAll(" ", "_") ===
        normalized(job.employmentType as string).replaceAll(" ", "_"),
    )
  )
    reasons.push(`Employment type ${job.employmentType} is not requested`);
  if (job.postedAt) {
    const ageDays = (now.getTime() - job.postedAt.getTime()) / 86_400_000;
    if (ageDays > preferences.maximumJobAgeDays)
      reasons.push(
        `Posting is ${Math.floor(ageDays)} days old (maximum ${preferences.maximumJobAgeDays})`,
      );
  }
  if (
    preferences.locations.length &&
    job.locations?.length &&
    snapshot.remoteType !== "REMOTE"
  ) {
    const requested = preferences.locations.map(normalized);
    const broadOnly = requested.every((location) =>
      ["remote", "latam", "worldwide", "anywhere"].includes(location),
    );
    const compatible = job.locations.some((location) =>
      requested.some(
        (wanted) =>
          wanted !== "remote" &&
          (normalized(location).includes(wanted) ||
            wanted.includes(normalized(location))),
      ),
    );
    if (!broadOnly && !compatible)
      reasons.push(
        `Known location ${job.locations.join(", ")} does not match requested locations`,
      );
    if (broadOnly && snapshot.remoteType === "ONSITE")
      reasons.push(
        "Role is explicitly onsite but only remote/regional locations were requested",
      );
  }
  for (const conflict of match.hardConflicts) {
    if (
      [
        "WORK_AUTHORIZATION_CONFLICT",
        "SPONSORSHIP_CONFLICT",
        "CLEARANCE_CONFLICT",
        "LANGUAGE_CONFLICT",
        "LICENSE_CONFLICT",
      ].includes(conflict.code)
    )
      reasons.push(conflict.label);
  }
  return [...new Set(reasons)];
}

function explanation(
  fitScore: number,
  result: Pick<
    PersonalJobResult,
    "hardConflicts" | "importantGaps" | "unknowns"
  >,
) {
  if (result.hardConflicts.length)
    return `Low priority: ${result.hardConflicts[0].label}. Verify the public listing before pursuing.`;
  if (fitScore >= 75)
    return "Worth reviewing soon: the available evidence aligns well, with no detected hard conflict.";
  if (fitScore >= 55)
    return "Potentially worth pursuing after checking the listed gaps and unknown information.";
  if (result.importantGaps.length)
    return `Lower priority: the available evidence shows ${result.importantGaps.length} important gap${result.importantGaps.length === 1 ? "" : "s"}.`;
  if (result.unknowns.length)
    return "Insufficient public information for a confident recommendation; inspect the original listing.";
  return "Lower priority based on the currently available résumé and preference evidence.";
}

function stableJobId(job: CanonicalJobInput) {
  return createHash("sha256")
    .update(
      [
        normalized(job.company),
        normalized(job.title),
        ...(job.locations ?? []).map(normalized),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);
}

function freshness(
  job: CanonicalJobInput,
  preferences: PersonalPreferences,
  now: Date,
) {
  if (!job.postedAt) return "UNKNOWN" as const;
  return (now.getTime() - job.postedAt.getTime()) / 86_400_000 <=
    preferences.maximumJobAgeDays
    ? ("CURRENT" as const)
    : ("STALE" as const);
}

function combineResult(
  canonical: CanonicalJobInput,
  provenance: readonly PersonalJobProvenance[],
  match: JobMatchResult,
  preferences: PersonalPreferences,
  now: Date,
): Omit<PersonalJobResult, "rank"> {
  const snapshot = jobSnapshot(canonical);
  const local = localEvidence(canonical, snapshot, preferences);
  const rawScore = Math.round(
    match.overallFit * 0.75 + local.alignment.score * 0.25,
  );
  const result = {
    id: stableJobId(canonical),
    fitScore: rawScore,
    deterministicFitScore: rawScore,
    confidence: match.confidence,
    title: canonical.title,
    company: canonical.company,
    description: canonical.description,
    location: canonical.locations?.join("; ") ?? null,
    remoteStatus: snapshot.remoteType,
    employmentType: canonical.employmentType,
    postedAt: canonical.postedAt?.toISOString() ?? null,
    freshness: freshness(canonical, preferences, now),
    salaryMin: canonical.salaryMin,
    salaryMax: canonical.salaryMax,
    salaryCurrency: canonical.salaryCurrency,
    salaryInterval: canonical.salaryInterval,
    applicationUrl: canonical.canonicalApplicationUrl,
    sources: provenance,
    strongMatches: [...match.strengths, ...local.strengths],
    partialMatches: [...match.partialMatches, ...local.partialMatches],
    importantGaps: [...match.gaps, ...local.gaps],
    hardConflicts: match.hardConflicts,
    unknowns: [...match.unknowns, ...local.unknowns],
  };
  return { ...result, explanation: explanation(rawScore, result) };
}

const SOURCE_PRIORITY: Readonly<Record<PersonalSourceName, number>> = {
  GREENHOUSE: 6,
  LEVER: 6,
  ASHBY: 6,
  ADZUNA: 4,
  JOBICY: 2,
  REMOTIVE: 2,
};

export async function runPersonalProwl(input: {
  readonly resume: string;
  readonly preferences?: PersonalPreferences;
  readonly sources?: readonly PersonalTargetedSource[];
  readonly limit?: number;
  readonly request?: PersonalDiscoveryFetch;
  readonly environment?: PersonalDiscoveryEnvironment;
  readonly now?: Date;
}): Promise<PersonalProwlResult> {
  const resume = input.resume.trim();
  if (!resume)
    throw new Error(
      "personal/resume.txt is empty. Add plaintext résumé content first.",
    );
  const preferences = personalPreferencesSchema.parse(
    input.preferences ?? defaultPersonalPreferences,
  );
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("--limit must be an integer from 1 to 100.");
  const now = input.now ?? new Date();
  const queries = buildPersonalSearchPlan({
    resume,
    searchTerms: preferences.searchTerms,
    targetRoles: preferences.targetRoles,
  });
  const discovery = await discoverPersonalJobs({
    adzunaCountry: preferences.adzunaCountry,
    environment: input.environment,
    locations: preferences.locations,
    queries,
    request: input.request,
    targetedSources: input.sources ?? [],
  });
  const sourceErrors = discovery.sources
    .filter((source) => source.status === "WARNING")
    .map(
      (source) => `${source.label}: ${source.message ?? "discovery failed"}`,
    );
  const unique: Array<{
    canonical: CanonicalJobInput;
    provenance: PersonalJobProvenance[];
    dedupe: DeduplicationCandidate;
    priority: number;
  }> = [];
  for (const discovered of discovery.jobs) {
    const canonical = discovered.canonical;
    const dedupe: DeduplicationCandidate = {
      applicationUrl: canonical.canonicalApplicationUrl,
      company: canonical.company,
      contentHash: canonicalJobContentHash(canonical),
      description: canonical.description,
      externalId: discovered.sourceJobId,
      id: `${discovered.source}:${discovered.sourceJobId}`,
      lastSeenAt: now,
      locations: canonical.locations,
      postedAt: canonical.postedAt,
      seniority: canonical.seniority,
      source: discovered.source,
      status: "ACTIVE",
      title: canonical.title,
    };
    const decision = decideJobDeduplication(
      dedupe,
      unique.map((job) => job.dedupe),
    );
    const provenance = {
      source: discovered.source,
      label: discovered.sourceLabel,
      sourceJobId: discovered.sourceJobId,
      sourceUrl: discovered.sourceUrl,
    };
    if (decision.kind === "NEW")
      unique.push({
        canonical,
        provenance: [provenance],
        dedupe,
        priority: SOURCE_PRIORITY[discovered.source],
      });
    else {
      const existing = unique.find(
        (job) => job.dedupe.id === decision.canonicalJobId,
      );
      if (existing) {
        existing.provenance.push(provenance);
        if (SOURCE_PRIORITY[discovered.source] > existing.priority) {
          existing.canonical = canonical;
          existing.dedupe = dedupe;
          existing.priority = SOURCE_PRIORITY[discovered.source];
        }
      }
    }
  }
  if (!unique.length && sourceErrors.length)
    throw new Error(`No jobs could be evaluated. ${sourceErrors.join(" ")}`);
  const candidate = candidateSnapshot(resume, preferences);
  const filteredJobs: PersonalFilteredJob[] = [];
  const evaluated: Array<Omit<PersonalJobResult, "rank">> = [];
  for (const item of unique) {
    const snapshot = jobSnapshot(item.canonical);
    const match = matchCandidateToJob(candidate, snapshot);
    const reasons = hardFilterReasons(
      item.canonical,
      snapshot,
      match,
      preferences,
      now,
    );
    if (reasons.length)
      filteredJobs.push({
        id: stableJobId(item.canonical),
        title: item.canonical.title,
        company: item.canonical.company,
        reasons,
      });
    else
      evaluated.push(
        combineResult(item.canonical, item.provenance, match, preferences, now),
      );
  }
  evaluated.sort(
    (left, right) =>
      right.fitScore - left.fitScore ||
      right.confidence - left.confidence ||
      left.title.localeCompare(right.title),
  );
  const jobs = evaluated.slice(0, limit).map((job, index) => ({
    ...job,
    rank: index + 1,
  }));
  return {
    generatedAt: now.toISOString(),
    mode: "DETERMINISTIC_LOCAL",
    searchQueries: queries,
    stats: {
      sources: discovery.sources.length,
      jobsDiscovered: discovery.jobs.length,
      jobsNormalized: discovery.jobs.length,
      jobsDeduplicated: unique.length,
      jobsPassedHardFilters: evaluated.length,
      jobsFiltered: filteredJobs.length,
      jobsEvaluated: evaluated.length,
      jobsReturned: jobs.length,
    },
    sources: discovery.sources,
    sourceErrors,
    filteredJobs,
    jobs,
  };
}

function safeMarkdown(value: string) {
  return value
    .replace(/[\\`*_[\]<>#]/gu, "\\$&")
    .replace(/\s+/gu, " ")
    .trim();
}

function evidenceSection(title: string, evidence: readonly MatchEvidence[]) {
  return [
    `### ${title}`,
    "",
    ...(evidence.length
      ? evidence.map(
          (item) =>
            `- ${safeMarkdown(item.label)} — ${safeMarkdown(item.evidence)}`,
        )
      : ["- None identified from the available data."]),
    "",
  ];
}

function salary(job: PersonalJobResult) {
  if (job.salaryMin == null && job.salaryMax == null) return "Unknown";
  const amount = [job.salaryMin, job.salaryMax]
    .filter((value): value is number => value != null)
    .map((value) =>
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        value,
      ),
    )
    .join("–");
  return `${job.salaryCurrency ?? "currency unknown"} ${amount}${job.salaryInterval ? ` / ${job.salaryInterval}` : ""}`;
}

export function renderPersonalResultsMarkdown(result: PersonalProwlResult) {
  const lines = [
    "# RoleProwl Personal Results",
    "",
    `Generated: ${result.generatedAt}`,
    "",
    "> Local evaluation. Real résumé content is never sent to Gemini by personal mode. Missing source data remains unknown.",
    "",
    `- Search queries: ${result.searchQueries.map(safeMarkdown).join(", ")}`,
    `- Sources attempted: ${result.stats.sources}`,
    `- Jobs discovered: ${result.stats.jobsDiscovered}`,
    `- Unique jobs: ${result.stats.jobsDeduplicated}`,
    `- Passed hard filters: ${result.stats.jobsPassedHardFilters}`,
    `- Filtered out: ${result.stats.jobsFiltered}`,
    `- Jobs shown: ${result.stats.jobsReturned}`,
    "",
    "## Discovery sources",
    "",
    ...result.sources.map(
      (source) =>
        `- **${safeMarkdown(source.label)}:** ${source.status} — ${source.jobs} jobs${source.message ? ` — ${safeMarkdown(source.message)}` : ""}${source.attributionUrl ? ` — [source](${source.attributionUrl})` : ""}`,
    ),
    "",
  ];
  if (!result.jobs.length)
    lines.push(
      "No jobs passed the configured hard filters. Review source warnings and preferences.",
      "",
    );
  for (const job of result.jobs) {
    lines.push(
      `## ${job.rank}. [${job.stateStatus ?? "UNTRACKED"}] ${safeMarkdown(job.title)} — ${safeMarkdown(job.company)} — ${job.fitScore}%`,
      "",
      `- **Job ID:** \`${job.id}\``,
      `- **Source:** ${job.sources.map((source) => safeMarkdown(source.label)).join(", ")}`,
      `- **Posted:** ${job.postedAt ?? "Unknown"} (${job.freshness})`,
      `- **Location:** ${job.location ? safeMarkdown(job.location) : "Unknown"}`,
      `- **Remote status:** ${job.remoteStatus ?? "Unknown"}`,
      `- **Employment type:** ${job.employmentType ?? "Unknown"}`,
      `- **Salary:** ${salary(job)}`,
      `- **Confidence:** ${Math.round(job.confidence * 100)}%`,
      `- **Official/public application URL:** ${job.applicationUrl ? `[Open listing](${job.applicationUrl})` : "Unknown"}`,
      "",
      "### Why it ranks highly",
      "",
      safeMarkdown(job.semanticSummary ?? job.explanation),
      "",
      ...evidenceSection("Strong matches", job.strongMatches),
      ...evidenceSection("Partial matches", job.partialMatches),
      ...evidenceSection("Important gaps", job.importantGaps),
      ...evidenceSection("Hard conflicts", job.hardConflicts),
      ...evidenceSection("Unknowns", job.unknowns),
    );
  }
  return `${lines.join("\n").trim()}\n`;
}
