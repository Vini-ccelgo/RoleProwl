function normalizedProposalText(value: string) {
  return value.replace(/\r\n?/gu, "\n").trim();
}

export function isProposalTextEdited(original: string, current: string) {
  return normalizedProposalText(original) !== normalizedProposalText(current);
}

export function availableProposalActions(input: {
  readonly current: string;
  readonly original: string;
  readonly supported: boolean;
}) {
  if (!input.supported) return ["REJECT"] as const;
  return isProposalTextEdited(input.original, input.current)
    ? (["EDIT_AND_ACCEPT", "REJECT"] as const)
    : (["ACCEPT", "REJECT"] as const);
}
