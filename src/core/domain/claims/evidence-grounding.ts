export function normalizeEvidenceText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function hasExactEvidenceQuote(source: string, quote: string) {
  const normalizedQuote = normalizeEvidenceText(quote);
  return (
    normalizedQuote.length > 0 &&
    normalizeEvidenceText(source).includes(normalizedQuote)
  );
}
