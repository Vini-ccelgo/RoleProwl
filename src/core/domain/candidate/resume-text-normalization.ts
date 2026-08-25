const SYMBOL_FONT_LIST_MARKER = /^([\t ]*)l[\t ]+(?=\S)/gmu;

export function normalizeExtractedResumeText(text: string): string {
  return text.replace(SYMBOL_FONT_LIST_MARKER, "$1");
}
