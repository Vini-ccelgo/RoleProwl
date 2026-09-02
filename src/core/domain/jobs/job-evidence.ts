import type { CanonicalJobCriterion } from "./job";

const REQUIRED_HEADINGS = new Set([
  "minimum qualifications",
  "qualifications",
  "required qualifications",
  "requirements",
  "what we're looking for",
  "what you need",
  "what you'll need",
  "what you will need",
  "what you will bring",
  "what you'll bring",
  "must have",
]);

const PREFERRED_HEADINGS = new Set([
  "nice to have",
  "preferred qualifications",
  "preferred requirements",
  "preferred skills",
  "what would be nice",
]);

const NON_QUALIFICATION_HEADINGS = new Set([
  "about the company",
  "about the role",
  "about us",
  "benefits",
  "compensation",
  "how to apply",
  "key responsibilities",
  "our benefits",
  "our values",
  "perks",
  "responsibilities",
  "role overview",
  "the opportunity",
  "the role",
  "what you'll be doing",
  "what you'll do",
  "what you will be doing",
  "what you will do",
  "who we are",
]);

const BULLET_LINE = /^(?:[•●▪◦‣⁃∙·*–—-]|\d+[.)])\s+(.+)$/u;
const QUALIFICATION_LANGUAGE =
  /\b(?:ability|authorization|bachelor|certification|clearance|communication|degree|eligible|experience|expertise|familiarity|fluent|knowledge|license|master|must|phd|proficien|required|skill|understanding|years?)\b/iu;

function heading(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[‘’ʼ]/gu, "'")
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/[:：.]$/u, "")
    .toLocaleLowerCase("en-US");
}

function bulletStatement(line: string) {
  return line.match(BULLET_LINE)?.[1]?.trim() ?? null;
}

function likelyUnrecognizedSectionHeading(
  line: string,
  nextLine: string | undefined,
) {
  return (
    line.length <= 80 &&
    !/[.!?;:]$/u.test(line) &&
    !QUALIFICATION_LANGUAGE.test(line) &&
    bulletStatement(nextLine?.trim() ?? "") !== null
  );
}

function criterion(
  statement: string,
  sourceField: "description.requirements" | "description.preferredRequirements",
): CanonicalJobCriterion {
  const overallExperience = statement.match(
    /^(?:at least |minimum(?: of)? )?(\d+)\+?\s+years?\s+(?:of\s+)?(?:(?:industry|professional|relevant|work)\s+)*experience(?:\s+(?:with|in|using)\s+(.+?))?(?:\s+(?:is\s+)?required)?[.;]?$/iu,
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
    /^(?:at least |minimum(?: of)? )?(\d+)\+?\s+years?\s+(?:of\s+)?(.+?)(?:\s+experience)?(?:\s+(?:is\s+)?required)?[.;]?$/iu,
  );
  if (skillDuration) {
    const subject = skillDuration[2]
      .trim()
      .replace(/\s+experience$/iu, "")
      .trim();
    if (/^(?:(?:industry|professional|relevant|work)\s*)+$/iu.test(subject)) {
      return {
        kind: "EXPERIENCE",
        statement,
        origin: "SOURCE_TEXT_EXPLICIT",
        sourceField,
        minimumExperienceMonths: Number(skillDuration[1]) * 12,
      };
    }
    return {
      kind: "SKILL",
      statement,
      origin: "SOURCE_TEXT_EXPLICIT",
      sourceField,
      skillName: subject,
      minimumExperienceMonths: Number(skillDuration[1]) * 12,
    };
  }
  const explicitSkill = statement.match(
    /^(?:experience|expertise|familiarity|knowledge|proficiency)\s+(?:in|of|using|with)\s+(.+?)(?:\s+(?:is\s+)?(?:preferred|required))?[.;]?$/iu,
  );
  if (explicitSkill) {
    return {
      kind: "SKILL",
      statement,
      origin: "SOURCE_TEXT_EXPLICIT",
      sourceField,
      skillName: explicitSkill[1].trim(),
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
  const lines = description?.split("\n") ?? [];
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const normalizedHeading = heading(line);
    if (REQUIRED_HEADINGS.has(normalizedHeading)) {
      section = "REQUIRED";
      continue;
    }
    if (PREFERRED_HEADINGS.has(normalizedHeading)) {
      section = "PREFERRED";
      continue;
    }
    if (NON_QUALIFICATION_HEADINGS.has(normalizedHeading)) {
      section = null;
      continue;
    }
    if (!section) continue;
    const explicitBullet = bulletStatement(line);
    if (
      explicitBullet === null &&
      likelyUnrecognizedSectionHeading(line, lines[index + 1])
    ) {
      section = null;
      continue;
    }
    if (explicitBullet === null && /:\s*$/u.test(line)) continue;
    const statement = explicitBullet ?? line;
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
