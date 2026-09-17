import type { PublicApplicationQuestionOption } from "./public-application-question";

export function normalizedChoiceText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const EXCLUSIVE_SENTINEL =
  /^(?:n ?a|not applicable|none|none of the above|no known employee|i do not know anyone(?: at .+)?|nao conheco(?: .+)?|nenhum(?:a)?|nao possui)$/u;

export function exclusiveChoiceValues(
  options: readonly PublicApplicationQuestionOption[],
) {
  const exclusive = options.filter((option) =>
    EXCLUSIVE_SENTINEL.test(normalizedChoiceText(option.label)),
  );
  return exclusive.length === 1 && options.length > 1
    ? new Set([exclusive[0]!.value])
    : new Set<string>();
}

export function exactChoiceMatches(
  candidateValues: readonly string[],
  options: readonly PublicApplicationQuestionOption[],
) {
  const matches = candidateValues.flatMap((candidate) => {
    const normalized = normalizedChoiceText(candidate);
    const found = options.filter(
      (option) => normalizedChoiceText(option.label) === normalized,
    );
    return found.length === 1 ? [found[0]!.value] : [];
  });
  return [...new Set(matches)];
}
