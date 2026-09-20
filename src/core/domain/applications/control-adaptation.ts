import type { PublicApplicationQuestion } from "./public-application-question";
import { normalizedChoiceText } from "./choice-taxonomy";
import {
  completedExperienceYears,
  formattedExperienceDuration,
} from "./experience-duration";

export function employerQuestionOptions(question: PublicApplicationQuestion) {
  return question.optionIdentities?.length
    ? question.optionIdentities
    : question.options.map((option) => ({ label: option, value: option }));
}

export function normalizePersonalNameForEmployerPresentation(value: string) {
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (
    /\p{L}/u.test(normalized) &&
    /[^\p{Script_Extensions=Latin}\p{M}\p{N}\s'’.-]/u.test(normalized)
  )
    return normalized;
  const hasUppercase = /\p{Lu}/u.test(normalized);
  const hasLowercase = /\p{Ll}/u.test(normalized);
  if (!hasUppercase || hasLowercase) return normalized;
  return normalized.replace(/\p{L}+/gu, (part) => {
    const [first, ...rest] = [...part];
    return `${first?.toLocaleUpperCase("en-US") ?? ""}${rest
      .join("")
      .toLocaleLowerCase("en-US")}`;
  });
}

function encodedOptionValue(
  question: PublicApplicationQuestion,
  values: readonly string[],
) {
  const unique = [...new Set(values)];
  return question.fieldTypes.includes("multi_value_multi_select")
    ? JSON.stringify(unique)
    : (unique[0] ?? null);
}

export function adaptKnownValueToEmployerControl(
  value: string,
  question: PublicApplicationQuestion,
) {
  const options = employerQuestionOptions(question);
  if (!options.length) return value;
  const normalized = normalizedChoiceText(value);
  const exact = options.filter(
    (option) => normalizedChoiceText(option.label) === normalized,
  );
  if (exact.length === 1)
    return encodedOptionValue(question, [exact[0]!.value]);

  const boolean = /^(?:true|yes|sim|required)$/u.test(normalized)
    ? true
    : /^(?:false|no|nao|not required)$/u.test(normalized)
      ? false
      : null;
  if (boolean != null) {
    const matched = options.filter((option) =>
      boolean
        ? /^(?:yes|sim)\b/u.test(normalizedChoiceText(option.label))
        : /^(?:no|nao)\b/u.test(normalizedChoiceText(option.label)),
    );
    if (matched.length === 1)
      return encodedOptionValue(question, [matched[0]!.value]);
  }
  return null;
}

function rangeForLabel(label: string) {
  const normalized = label
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[–—]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
  const plus =
    normalized.match(
      /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:plus|or more|and above)(?:\s|$)/u,
    ) ?? normalized.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*\+(?:\s|$)/u);
  if (plus)
    return {
      kind: "RANGE" as const,
      minimum: Number(plus[1]!.replace(",", ".")),
      maximum: null,
    };
  const range = normalized.match(
    /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:-|to|through)\s*(\d+(?:[.,]\d+)?)(?:\s|$)/u,
  );
  if (range)
    return {
      kind: "RANGE" as const,
      minimum: Number(range[1]!.replace(",", ".")),
      maximum: Number(range[2]!.replace(",", ".")),
    };
  const exact = normalized.match(
    /^(\d+(?:[.,]\d+)?)\s*(?:year|years|yr|yrs|ano|anos)$/u,
  );
  return exact
    ? {
        kind: "EXACT" as const,
        minimum: Number(exact[1]!.replace(",", ".")),
        maximum: null,
      }
    : null;
}

export function adaptExperienceDurationToEmployerControl(
  months: number,
  question: PublicApplicationQuestion,
) {
  const options = employerQuestionOptions(question);
  if (!options.length) return formattedExperienceDuration(months);
  if (months === 0) {
    const zero = options.filter((option) =>
      /^(?:0\s*(?:year|years|yr|yrs|ano|anos)?|none|no experience|nenhuma|nenhum|sem experiencia)$/u.test(
        normalizedChoiceText(option.label),
      ),
    );
    return zero.length === 1
      ? encodedOptionValue(question, [zero[0]!.value])
      : null;
  }
  const years = months / 12;
  const completedYears = completedExperienceYears(months);
  const matches = options.filter((option) => {
    const parsed = rangeForLabel(option.label);
    if (!parsed) return false;
    if (parsed.kind === "EXACT") return parsed.minimum === completedYears;
    return (
      years >= parsed.minimum &&
      (parsed.maximum == null || years < parsed.maximum)
    );
  });
  return matches.length === 1
    ? encodedOptionValue(question, [matches[0]!.value])
    : null;
}
