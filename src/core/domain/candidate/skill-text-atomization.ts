import { normalizeSkillName } from "./truth-vault";

const SKILL_LIST =
  /^(?:languages(?:\s*\/\s*query)?|tools|cloud\s*\/\s*infrastructure|skills|technologies)\s*:\s*(.+)$/iu;
const PROSE_MARKER =
  /\b(?:built|created|developed|implemented|managed|responsible|worked|using)\b/iu;

export interface AtomicCandidateSkill {
  readonly canonicalName: string;
  readonly normalizedName: string;
}

function atomicName(value: string) {
  const canonicalName = value.trim().replace(/[.]$/u, "").trim();
  if (
    !canonicalName ||
    canonicalName.length > 120 ||
    /[,;:\n\r!?]/u.test(canonicalName) ||
    /\b(?:and|or)\b/iu.test(canonicalName) ||
    PROSE_MARKER.test(canonicalName) ||
    canonicalName.split(/\s+/u).length > 5 ||
    !/[\p{L}\p{N}+#]/u.test(canonicalName)
  )
    return null;
  return {
    canonicalName,
    normalizedName: normalizeSkillName(canonicalName),
  } satisfies AtomicCandidateSkill;
}

export function atomizeVerifiedSkillText(value: unknown) {
  const text =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as { text?: unknown }).text
      : null;
  if (typeof text !== "string") return [];
  const source = text.normalize("NFKC").trim();
  if (!source) return [];

  const list = source.match(SKILL_LIST)?.[1];
  const candidates = list
    ? list.split(",")
    : /^\S+$/u.test(source)
      ? [source]
      : [];
  const parsed = candidates.map((candidate) => atomicName(candidate));
  if (!parsed.length || parsed.some((candidate) => candidate === null))
    return [];
  const atoms = new Map<string, AtomicCandidateSkill>();
  for (const atom of parsed) {
    if (atom && !atoms.has(atom.normalizedName))
      atoms.set(atom.normalizedName, atom);
  }
  return [...atoms.values()];
}
