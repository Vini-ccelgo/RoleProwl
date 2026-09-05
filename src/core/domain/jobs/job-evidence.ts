import type { CanonicalJobCriterion } from "./job";

export const JOB_EVIDENCE_VERSION = "job-evidence-v3" as const;

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

type CriterionSourceField =
  "description.requirements" | "description.preferredRequirements";

function baseCriterion(statement: string, sourceField: CriterionSourceField) {
  return {
    statement,
    origin: "SOURCE_TEXT_EXPLICIT" as const,
    sourceField,
  };
}

function otherCriterion(
  statement: string,
  sourceField: CriterionSourceField,
  logicalContext?: CanonicalJobCriterion["logicalContext"],
): CanonicalJobCriterion {
  return {
    kind: "OTHER",
    ...baseCriterion(statement, sourceField),
    ...(logicalContext ? { logicalContext } : {}),
  };
}

function skillCriterion(
  skillName: string,
  statement: string,
  sourceField: CriterionSourceField,
  options?: {
    readonly evaluationMode?: CanonicalJobCriterion["evaluationMode"];
    readonly logicalContext?: CanonicalJobCriterion["logicalContext"];
    readonly minimumExperienceMonths?: number;
  },
): CanonicalJobCriterion {
  return {
    kind: "SKILL",
    ...baseCriterion(statement, sourceField),
    skillName,
    ...(options?.evaluationMode
      ? { evaluationMode: options.evaluationMode }
      : {}),
    ...(options?.logicalContext
      ? { logicalContext: options.logicalContext }
      : {}),
    ...(options?.minimumExperienceMonths != null
      ? { minimumExperienceMonths: options.minimumExperienceMonths }
      : {}),
  };
}

function atomicSkillName(value: string) {
  const candidate = value
    .trim()
    .replace(/^(?:strong|advanced|working)\s+/iu, "")
    .replace(/[.;:]$/u, "")
    .trim();
  if (
    !candidate ||
    candidate.length > 80 ||
    /[,;]/u.test(candidate) ||
    /\b(?:and|or|alternatively|including|such as|with the ability)\b/iu.test(
      candidate,
    ) ||
    candidate.split(/\s+/u).length > 4
  )
    return null;
  return candidate;
}

function namedTechnologyList(value: string, separator: RegExp) {
  return value
    .split(separator)
    .map((item) => atomicSkillName(item))
    .filter((item): item is string => item !== null);
}

function compoundCriteria(
  statement: string,
  sourceField: CriterionSourceField,
): CanonicalJobCriterion[] | null {
  if (
    /\b(?:alternatively|equivalent professional experience)\b/iu.test(
      statement,
    ) &&
    /\b(?:bachelor'?s?|master'?s?|phd|doctorate)\b/iu.test(statement)
  ) {
    return [otherCriterion(statement, sourceField, "ALTERNATIVE")];
  }

  const developmentExperience = statement.match(
    /^(?:strong\s+)?(.+?)\s+development experience\b/iu,
  );
  const developmentSkill = developmentExperience
    ? atomicSkillName(developmentExperience[1])
    : null;
  if (developmentSkill) {
    return [
      skillCriterion(developmentSkill, statement, sourceField),
      otherCriterion(statement, sourceField, "AND"),
    ];
  }

  const proficiency = statement.match(
    /^(?:working\s+)?proficiency\s+in\s+(.+?)(?:,\s+with\b|[.;]?$)/iu,
  );
  if (proficiency) {
    const skills = namedTechnologyList(proficiency[1], /\s+and\s+/iu);
    if (skills.length) {
      return [
        ...skills.map((skill) =>
          skillCriterion(skill, statement, sourceField, {
            logicalContext: skills.length > 1 ? "AND" : undefined,
          }),
        ),
        otherCriterion(statement, sourceField, "AND"),
      ];
    }
  }

  const familiarityAndKnowledge = statement.match(
    /^familiarity\s+with\s+(.+?)\s+and\s+a\s+working\s+knowledge\s+of\s+(.+?)(?:,|[.;]?$)/iu,
  );
  if (familiarityAndKnowledge) {
    const alternative = familiarityAndKnowledge[1]
      .replace(/\s+or\s+similar\b.*$/iu, "")
      .trim();
    const alternatives = namedTechnologyList(alternative, /\s*\/\s*/u);
    const requiredSkill = atomicSkillName(familiarityAndKnowledge[2]);
    return [
      ...alternatives.map((skill) =>
        skillCriterion(skill, statement, sourceField, {
          evaluationMode: "CONTEXT_ONLY",
          logicalContext: "OR",
        }),
      ),
      ...(requiredSkill
        ? [
            skillCriterion(requiredSkill, statement, sourceField, {
              logicalContext: "AND",
            }),
          ]
        : []),
      otherCriterion(statement, sourceField, "OR"),
    ];
  }

  const examples = statement.match(
    /\b(?:frameworks?|technologies|tools)\s+such as\s+(.+?)(?:[.;]|$)/iu,
  );
  if (examples) {
    const names = namedTechnologyList(examples[1], /\s*,?\s+or\s+|\s*,\s*/iu);
    return [
      ...names.map((skill) =>
        skillCriterion(skill, statement, sourceField, {
          evaluationMode: "CONTEXT_ONLY",
          logicalContext: "EXAMPLE",
        }),
      ),
      otherCriterion(statement, sourceField, "EXAMPLE"),
    ];
  }
  return null;
}

function criteria(
  statement: string,
  sourceField: CriterionSourceField,
): CanonicalJobCriterion[] {
  const compound = compoundCriteria(statement, sourceField);
  if (compound) return compound;
  const overallExperience = statement.match(
    /^(?:at least |minimum(?: of)? )?(\d+)\+?\s+years?\s+(?:of\s+)?(?:(?:industry|professional|relevant|work)\s+)*experience(?:\s+(?:with|in|using)\s+(.+?))?(?:\s+(?:is\s+)?required)?[.;]?$/iu,
  );
  if (overallExperience) {
    const skillName = overallExperience[2]
      ? atomicSkillName(overallExperience[2])
      : null;
    return skillName
      ? [
          skillCriterion(skillName, statement, sourceField, {
            minimumExperienceMonths: Number(overallExperience[1]) * 12,
          }),
        ]
      : [
          {
            kind: "EXPERIENCE",
            ...baseCriterion(statement, sourceField),
            minimumExperienceMonths: Number(overallExperience[1]) * 12,
          },
        ];
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
      return [
        {
          kind: "EXPERIENCE",
          ...baseCriterion(statement, sourceField),
          minimumExperienceMonths: Number(skillDuration[1]) * 12,
        },
      ];
    }
    const skillName = atomicSkillName(subject);
    return skillName
      ? [
          skillCriterion(skillName, statement, sourceField, {
            minimumExperienceMonths: Number(skillDuration[1]) * 12,
          }),
        ]
      : [otherCriterion(statement, sourceField)];
  }
  const explicitSkill = statement.match(
    /^(?:experience|expertise|familiarity|knowledge|proficiency)\s+(?:in|of|using|with)\s+(.+?)(?:\s+(?:is\s+)?(?:preferred|required))?[.;]?$/iu,
  );
  if (explicitSkill) {
    const skillName = atomicSkillName(explicitSkill[1]);
    if (skillName) return [skillCriterion(skillName, statement, sourceField)];
  }
  const requiredSkill = statement.match(/^(.+?)\s+(?:is\s+)?required[.;]?$/iu);
  if (requiredSkill) {
    const skillName = atomicSkillName(requiredSkill[1]);
    if (skillName) return [skillCriterion(skillName, statement, sourceField)];
  }
  const logicalContext = /\balternatively\b/iu.test(statement)
    ? "ALTERNATIVE"
    : /\bsuch as\b/iu.test(statement)
      ? "EXAMPLE"
      : /\bor\b/iu.test(statement)
        ? "OR"
        : /\band\b/iu.test(statement)
          ? "AND"
          : undefined;
  return [otherCriterion(statement, sourceField, logicalContext)];
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
      ...criteria(
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
