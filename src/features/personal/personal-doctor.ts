import { readFile } from "node:fs/promises";
import {
  parsePersonalSources,
  personalPreferencesSchema,
} from "./personal-prowl";

export interface PersonalDoctorPaths {
  readonly resume: string;
  readonly preferences: string;
  readonly sources: string;
  readonly state: string;
  readonly cache: string;
  readonly gitignore: string;
}

export interface PersonalDoctorCheck {
  readonly label: string;
  readonly status: "OK" | "READY" | "OFF" | "NOT CONFIGURED" | "ERROR";
  readonly detail?: string;
  readonly required: boolean;
}

export type PersonalDoctorEnvironment = Readonly<
  Record<string, string | undefined>
>;

async function optionalText(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function jsonCheck(
  path: string,
  label: string,
): Promise<PersonalDoctorCheck> {
  const value = await optionalText(path);
  if (value === null)
    return { label, status: "OK", detail: "not created yet", required: false };
  try {
    JSON.parse(value);
    return { label, status: "OK", required: false };
  } catch {
    return { label, status: "ERROR", detail: "invalid JSON", required: false };
  }
}

export async function inspectPersonalMode(input: {
  readonly paths: PersonalDoctorPaths;
  readonly environment: PersonalDoctorEnvironment;
  readonly nodeVersion?: string;
  readonly packageManagerUserAgent?: string;
}) {
  const checks: PersonalDoctorCheck[] = [];
  const nodeVersion = input.nodeVersion ?? process.version;
  checks.push({
    label: "Node 24",
    status: /^v24\./u.test(nodeVersion) ? "OK" : "ERROR",
    detail: nodeVersion,
    required: true,
  });
  const userAgent = input.packageManagerUserAgent ?? "";
  const pnpm = userAgent.match(/\bpnpm\/([^\s]+)/u)?.[1];
  checks.push({
    label: "pnpm",
    status: pnpm ? "OK" : "ERROR",
    detail: pnpm ?? "run through pnpm",
    required: true,
  });

  const resume = await optionalText(input.paths.resume);
  checks.push({
    label: "Résumé",
    status: resume?.trim() ? "OK" : "ERROR",
    detail:
      resume === null
        ? "personal/resume.txt is missing"
        : resume.trim()
          ? undefined
          : "file is empty",
    required: true,
  });

  const preferences = await optionalText(input.paths.preferences);
  let parsedPreferences: ReturnType<
    typeof personalPreferencesSchema.parse
  > | null = null;
  if (preferences === null)
    checks.push({
      label: "Preferences",
      status: "OK",
      detail: "using defaults",
      required: false,
    });
  else {
    try {
      parsedPreferences = personalPreferencesSchema.parse(
        JSON.parse(preferences),
      );
      checks.push({ label: "Preferences", status: "OK", required: false });
    } catch {
      checks.push({
        label: "Preferences",
        status: "ERROR",
        detail: "invalid schema or JSON",
        required: true,
      });
    }
  }

  checks.push(await jsonCheck(input.paths.state, "State"));
  checks.push(await jsonCheck(input.paths.cache, "Cache"));

  const sources = await optionalText(input.paths.sources);
  try {
    const targeted = sources === null ? [] : parsePersonalSources(sources);
    checks.push({ label: "Jobicy", status: "READY", required: false });
    checks.push({ label: "Remotive", status: "READY", required: false });
    checks.push({
      label: "Targeted boards",
      status: "OK",
      detail: String(targeted.length),
      required: false,
    });
  } catch {
    checks.push({
      label: "Targeted boards",
      status: "ERROR",
      detail: "invalid personal/sources.txt",
      required: true,
    });
  }

  const adzunaReady = Boolean(
    parsedPreferences?.adzunaCountry &&
    input.environment.ADZUNA_APP_ID?.trim() &&
    input.environment.ADZUNA_APP_KEY?.trim(),
  );
  checks.push({
    label: "Adzuna",
    status: adzunaReady ? "READY" : "NOT CONFIGURED",
    required: false,
  });

  const localProvider =
    input.environment.PERSONAL_AI_PROVIDER?.trim().toLocaleLowerCase("en-US");
  const localReady =
    localProvider === "local" &&
    Boolean(input.environment.PERSONAL_AI_MODEL?.trim());
  checks.push({
    label: "Local AI",
    status: localReady
      ? "READY"
      : localProvider && !["none", "deterministic"].includes(localProvider)
        ? "ERROR"
        : "OFF",
    detail:
      localProvider === "local" && !localReady
        ? "PERSONAL_AI_MODEL is missing"
        : undefined,
    required: localProvider === "local",
  });

  const gitignore = (await optionalText(input.paths.gitignore)) ?? "";
  const privateFilesIgnored =
    /^personal\/\*\s*$/mu.test(gitignore) &&
    /^!personal\/\*\.example\.\*\s*$/mu.test(gitignore);
  checks.push({
    label: "Private files Git-ignored",
    status: privateFilesIgnored ? "OK" : "ERROR",
    required: true,
  });
  return {
    checks,
    ready: !checks.some((check) => check.required && check.status === "ERROR"),
  };
}
