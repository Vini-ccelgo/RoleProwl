const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
};

function decodeEntities(value: string) {
  return value.replace(
    /&(?:#(x[0-9a-f]+|\d+)|([a-z][a-z0-9]+));/giu,
    (entity, numeric: string | undefined, named: string | undefined) => {
      if (named)
        return NAMED_ENTITIES[named.toLocaleLowerCase("en-US")] ?? entity;
      const hexadecimal = numeric?.toLocaleLowerCase("en-US").startsWith("x");
      const codePoint = Number.parseInt(
        hexadecimal ? numeric!.slice(1) : numeric!,
        hexadecimal ? 16 : 10,
      );
      return Number.isSafeInteger(codePoint) &&
        codePoint > 0 &&
        codePoint <= 0x10ffff &&
        !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint)
        : entity;
    },
  );
}

export function readableJobDescription(value: string | null | undefined) {
  if (!value?.trim()) return null;
  let text = value.normalize("NFKC").replace(/\r\n?/gu, "\n");
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = decodeEntities(text);
    if (decoded === text) break;
    text = decoded;
  }
  text = text
    .replace(/<!--[^]*?-->/gu, " ")
    .replace(
      /<(?:script|style|svg|iframe|object|embed|template|noscript)\b[^>]*>[^]*?<\/(?:script|style|svg|iframe|object|embed|template|noscript)\s*>/giu,
      " ",
    )
    .replace(/<(?:img|source|track|link|meta)\b[^>]*\/?>/giu, " ")
    .replace(/<li\b[^>]*>/giu, "\n• ")
    .replace(
      /<\/(?:li|p|div|section|article|header|footer|h[1-6]|ul|ol|table|tr)\s*>/giu,
      "\n",
    )
    .replace(/<(?:br|hr)\b[^>]*\/?>/giu, "\n")
    .replace(/<[^>]*>/gu, " ");
  text = decodeEntities(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .replace(/[ \t]+/gu, " ")
    .replace(/ +([,.;:!?])/gu, "$1")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{2,}(?=• )/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return text || null;
}
