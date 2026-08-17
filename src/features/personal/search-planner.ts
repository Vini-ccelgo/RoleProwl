export interface PersonalSearchPlanInput {
  readonly resume: string;
  readonly searchTerms: readonly string[];
  readonly targetRoles: readonly string[];
}

const normalize = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ");

export function buildPersonalSearchPlan(
  input: PersonalSearchPlanInput,
  maximumQueries = 6,
) {
  const queries: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const query = normalize(value);
    const key = query.toLocaleLowerCase("en-US");
    if (query && !seen.has(key) && queries.length < maximumQueries) {
      seen.add(key);
      queries.push(query);
    }
  };

  input.searchTerms.forEach(add);
  input.targetRoles.forEach(add);

  const searchable = `${input.targetRoles.join(" ")} ${input.resume}`;
  if (/\b(?:cybersecurity|cyber security|soc|siem)\b/iu.test(searchable)) {
    add("cybersecurity");
    add("information security");
  }
  if (/\b(?:cloud security|aws security|azure security)\b/iu.test(searchable))
    add("cloud security");
  if (/\b(?:data analyst|data analytics|power bi|tableau)\b/iu.test(searchable))
    add("data analyst");
  if (
    /\b(?:software engineer|software developer|typescript|javascript)\b/iu.test(
      searchable,
    )
  )
    add("software engineer");

  return queries.length ? queries : ["analyst"];
}
