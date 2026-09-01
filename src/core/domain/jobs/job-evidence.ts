import type { CanonicalJobCriterion } from "./job";

const REQUIRED_HEADINGS = new Set([
  "minimum qualifications",
  "qualifications",
  "required qualifications",
  "requirements",
  "what you need",
  "what you will bring",
  "what you'll bring",
  "must have",
]);

const PREFERRED_HEADINGS = new Set([
  "nice to have",
  "preferred qualifications",
  "preferred requirements",
  "what would be nice",
]);

function heading(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/:$/u, "")
    .toLocaleLowerCase("en-US");
}

function criterion(
  statement: string,
  sourceField: "description.requirements" | "description.preferredRequirements",
): CanonicalJobCriterion {
  const overallExperience = statement.match(
    /^(?:at least |minimum(?: of)? )?(\d+)\+?\s+years?\s+(?:of\s+)?(?:professional\s+)?experience(?:\s+(?:with|in|using)\s+(.+?))?(?:\s+(?:is\s+)?required)?[.;]?$/iu,
  );
  if (overallExperience) {
    const skillName = overallExperience[2]?.trim();
    return {
      kind: skillName ? "SKILL" : "EXPERIENCE",
      statement,
      origin: "SOURCE_TEXT_EXPLICIT",
      sourceField,
      ...(skillName ? { skillName } : {}),
      minimumExperienceMonths: Number(overallExperience[1]) * 12,
    };
  }
  const skillDuration = statement.match(
    /^(?:at least |minimum(?: of)? )?(\d+)\+?\s+years?\s+(?:of\s+)?(.+?)\s+(?:is\s+)?required[.;]?$/iu,
  );
  if (skillDuration) {
    return {
      kind: "SKILL",
      statement,
      origin: "SOURCE_TEXT_EXPLICIT",
      sourceField,
      skillName: skillDuration[2].trim(),
      minimumExperienceMonths: Number(skillDuration[1]) * 12,
    };
  }
  return {
    kind: "OTHER",
    statement,
    origin: "SOURCE_TEXT_EXPLICIT",
    sourceField,
  };
}

export function extractExplicitJobCriteria(description: string | null) {
  const required: CanonicalJobCriterion[] = [];
  const preferred: CanonicalJobCriterion[] = [];
  let section: "REQUIRED" | "PREFERRED" | null = null;
  for (const rawLine of description?.split("\n") ?? []) {
    const line = rawLine.trim();
    const normalizedHeading = heading(line);
    if (REQUIRED_HEADINGS.has(normalizedHeading)) {
      section = "REQUIRED";
      continue;
    }
    if (PREFERRED_HEADINGS.has(normalizedHeading)) {
      section = "PREFERRED";
      continue;
    }
    if (!line.startsWith("• ")) {
      if (section && line && /^[A-Z][^.!?]{0,80}:?$/u.test(line))
        section = null;
      continue;
    }
    const statement = line.slice(2).trim();
    if (!section || !statement) continue;
    const target = section === "REQUIRED" ? required : preferred;
    target.push(
      criterion(
        statement,
        section === "REQUIRED"
          ? "description.requirements"
          : "description.preferredRequirements",
      ),
    );
  }
  return {
    required: required.length ? required : null,
    preferred: preferred.length ? preferred : null,
  };
}

export function explicitRemoteTypeFromLocation(value: string | undefined) {
  const normalized = value?.normalize("NFKC").toLocaleLowerCase("en-US");
  if (!normalized) return null;
  if (/\bhybrid\b/u.test(normalized)) return "HYBRID" as const;
  if (/\bon[ -]?site\b/u.test(normalized)) return "ONSITE" as const;
  if (/\bremote\b/u.test(normalized)) return "REMOTE" as const;
  return null;
}
