import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import {
  defaultPersonalPreferences,
  parsePersonalSources,
  personalPreferencesSchema,
  renderPersonalResultsMarkdown,
  runPersonalProwl,
  type PersonalProwlResult,
} from "@/features/personal/personal-prowl";
import { enhancePersonalResults } from "@/features/personal/personal-semantic";
import {
  loadFreshPersonalCache,
  loadPersonalState,
  mergePersonalState,
  personalCacheKey,
  PERSONAL_JOB_STATUSES,
  savePersonalCache,
  savePersonalState,
  updatePersonalJob,
  type PersonalJobStatus,
} from "@/features/personal/personal-state";
import { preparePersonalApplication } from "@/features/personal/personal-application";
import { exportPersonalResumeHtml } from "@/features/personal/personal-resume-export";
import { inspectPersonalMode } from "@/features/personal/personal-doctor";
import { LocalPersonalAIProvider } from "@/integrations/ai/local-personal-ai-provider";

const args = process.argv.slice(2).filter((value) => value !== "--");
const command = args[0]?.startsWith("-") ? "prowl" : (args.shift() ?? "prowl");
const personalDirectory = resolve(process.cwd(), "personal");
const paths = {
  resume: resolve(personalDirectory, "resume.txt"),
  preferences: resolve(personalDirectory, "preferences.json"),
  sources: resolve(personalDirectory, "sources.txt"),
  resultsMarkdown: resolve(personalDirectory, "results.md"),
  resultsJson: resolve(personalDirectory, "results.json"),
  state: resolve(personalDirectory, "state.json"),
  cache: resolve(personalDirectory, "cache.json"),
  applications: resolve(personalDirectory, "applications"),
  gitignore: resolve(process.cwd(), ".gitignore"),
};

function option(name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function flag(name: string) {
  return args.includes(name);
}

function jobId() {
  const value =
    option("--job") ?? args.find((item) => /^[a-f0-9]{16}$/u.test(item));
  if (!value)
    throw new Error("Provide --job <id> using an ID from personal/results.md.");
  return value;
}

function resultLimit() {
  const raw = option("--limit");
  if (!raw) return 25;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100)
    throw new Error("--limit must be an integer from 1 to 100.");
  return value;
}

async function preferences() {
  if (!existsSync(paths.preferences)) return defaultPersonalPreferences;
  try {
    return personalPreferencesSchema.parse(
      JSON.parse(await readFile(paths.preferences, "utf8")),
    );
  } catch (error) {
    throw new Error(
      `Could not read personal/preferences.json: ${error instanceof Error ? error.message : "invalid JSON"}`,
    );
  }
}

async function resume() {
  if (!existsSync(paths.resume))
    throw new Error(
      "personal/resume.txt is missing. Copy personal/resume.example.txt and replace the fictional content.",
    );
  const value = await readFile(paths.resume, "utf8");
  if (!value.trim()) throw new Error("personal/resume.txt is empty.");
  return value;
}

async function targetedSources() {
  if (!existsSync(paths.sources)) return [];
  return parsePersonalSources(await readFile(paths.sources, "utf8"));
}

function localAI() {
  const provider =
    process.env.PERSONAL_AI_PROVIDER?.trim().toLocaleLowerCase("en-US");
  if (!provider || provider === "none" || provider === "deterministic")
    return undefined;
  if (provider !== "local")
    throw new Error(
      "Personal mode accepts only PERSONAL_AI_PROVIDER=local. It will not route a real résumé to Gemini or another external provider.",
    );
  return new LocalPersonalAIProvider({
    baseUrl:
      process.env.PERSONAL_AI_BASE_URL?.trim() || "http://127.0.0.1:11434",
    model: process.env.PERSONAL_AI_MODEL?.trim() || "",
  });
}

function visibleResult(
  result: PersonalProwlResult,
  limit: number,
  newOnly: boolean,
) {
  const visible = result.jobs.filter(
    (job) =>
      (!newOnly || job.stateStatus === "NEW") &&
      !["REJECTED", "CLOSED"].includes(job.stateStatus ?? ""),
  );
  const jobs = visible.slice(0, limit).map((job, index) => ({
    ...job,
    rank: index + 1,
  }));
  return {
    ...result,
    stats: { ...result.stats, jobsReturned: jobs.length },
    jobs,
  };
}

async function prowl() {
  const limit = resultLimit();
  const resumeText = await resume();
  const searchPreferences = await preferences();
  const sources = await targetedSources();
  console.log("RoleProwl Personal\n\nResume loaded.");
  console.log(`Targeted boards: ${sources.length}`);
  console.log("Searching public job APIs and configured boards...");
  const key = personalCacheKey({
    resumeHash: personalCacheKey(resumeText),
    preferences: searchPreferences,
    sources,
  });
  let result = flag("--refresh")
    ? null
    : await loadFreshPersonalCache({ path: paths.cache, key });
  if (result) console.log("Discovery cache: HIT (less than six hours old)");
  else {
    result = await runPersonalProwl({
      resume: resumeText,
      preferences: searchPreferences,
      sources,
      limit: 100,
      environment: {
        ADZUNA_APP_ID: process.env.ADZUNA_APP_ID,
        ADZUNA_APP_KEY: process.env.ADZUNA_APP_KEY,
      },
    });
    await savePersonalCache({ path: paths.cache, key, result });
    console.log("Discovery cache: REFRESHED");
  }
  const ai = localAI();
  if (ai && searchPreferences.semanticLimit > 0) {
    console.log(
      `Local semantic analysis: top ${Math.min(searchPreferences.semanticLimit, result.jobs.length)} jobs`,
    );
    const enhanced = await enhancePersonalResults({
      ai,
      result,
      resume: resumeText,
      limit: searchPreferences.semanticLimit,
    });
    result = enhanced.result;
    if (enhanced.warnings.length)
      console.log(
        `Local AI warnings: ${enhanced.warnings.length}; deterministic scores retained for failed jobs.`,
      );
  } else
    console.log("Local semantic analysis: OFF (deterministic ranking used)");

  const state = await loadPersonalState(paths.state);
  const merged = mergePersonalState(state, result);
  await savePersonalState(paths.state, merged.state);
  result = visibleResult(merged.result, limit, flag("--new-only"));
  await writeFile(
    paths.resultsMarkdown,
    renderPersonalResultsMarkdown(result),
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  await writeFile(paths.resultsJson, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  console.log(`\nJobs retrieved: ${result.stats.jobsDiscovered}`);
  console.log(`Unique jobs: ${result.stats.jobsDeduplicated}`);
  console.log(`Passed hard filters: ${result.stats.jobsPassedHardFilters}`);
  console.log(
    `New in current report: ${result.jobs.filter((job) => job.stateStatus === "NEW").length}`,
  );
  for (const source of result.sources)
    console.log(
      `${source.label}: ${source.status} — ${source.jobs} jobs${source.message ? ` — ${source.message}` : ""}`,
    );
  console.log("\nTop opportunities:\n");
  for (const job of result.jobs.slice(0, 10))
    console.log(
      `${job.rank}. [${job.stateStatus}] ${job.title} — ${job.company} — ${job.fitScore}% — ${job.id}`,
    );
  if (!result.jobs.length)
    console.log(
      flag("--new-only")
        ? "No new jobs passed the current filters."
        : "No jobs passed the current filters.",
    );
  console.log("\nResults:\npersonal/results.md\npersonal/results.json");
}

async function mutateStatus(status: PersonalJobStatus) {
  const state = await loadPersonalState(paths.state);
  const id = jobId();
  const updated = updatePersonalJob(state, id, {
    status,
    note: option("--note"),
  });
  await savePersonalState(paths.state, updated);
  console.log(`${id}: ${status}`);
}

async function mark() {
  const raw = option("--status") ?? args.at(-1);
  const status = raw?.toLocaleUpperCase("en-US") as PersonalJobStatus;
  if (!PERSONAL_JOB_STATUSES.includes(status))
    throw new Error(
      `--status must be one of: ${PERSONAL_JOB_STATUSES.join(", ")}.`,
    );
  await mutateStatus(status);
}

async function prepare() {
  const state = await loadPersonalState(paths.state);
  const id = jobId();
  const job = state.jobs[id];
  if (!job) throw new Error(`Unknown job ID ${id}. Run personal:prowl first.`);
  const prepared = await preparePersonalApplication({
    applicationsDirectory: paths.applications,
    ai: localAI(),
    job,
    resume: await resume(),
  });
  const relativePath = `personal/applications/${id}`;
  await savePersonalState(
    paths.state,
    updatePersonalJob(state, id, { applicationPackagePath: relativePath }),
  );
  console.log(
    `Application package: ${relativePath}\n${prepared.generated.join("\n")}`,
  );
  if (prepared.warning) console.log(`Warning: ${prepared.warning}`);
}

async function openApplication() {
  const state = await loadPersonalState(paths.state);
  const id = jobId();
  const url = state.jobs[id]?.snapshot.applicationUrl;
  if (!url) throw new Error(`Job ${id} has no known application URL.`);
  const parsed = new URL(url);
  if (parsed.protocol !== "https:")
    throw new Error("Application URL is not HTTPS.");
  const executable = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(executable, [parsed.toString()], {
    detached: true,
    stdio: "ignore",
  }).unref();
  console.log(`Opened official/public application destination:\n${parsed}`);
  console.log("No form was filled and no application was submitted.");
}

async function exportResume() {
  const state = await loadPersonalState(paths.state);
  const id = jobId();
  const job = state.jobs[id];
  if (!job) throw new Error(`Unknown job ID ${id}. Run personal:prowl first.`);
  await exportPersonalResumeHtml({
    applicationsDirectory: paths.applications,
    job,
    resume: await resume(),
  });
  console.log(
    `ATS-readable HTML résumé:\npersonal/applications/${id}/tailored-resume.html`,
  );
  console.log("Open it in a browser and use Print → Save as PDF if needed.");
}

async function doctor() {
  const result = await inspectPersonalMode({
    paths: {
      resume: paths.resume,
      preferences: paths.preferences,
      sources: paths.sources,
      state: paths.state,
      cache: paths.cache,
      gitignore: paths.gitignore,
    },
    environment: process.env,
    packageManagerUserAgent: process.env.npm_config_user_agent,
  });
  console.log("RoleProwl Personal Doctor\n");
  for (const check of result.checks)
    console.log(
      `${check.label}: ${check.status}${check.detail ? ` — ${check.detail}` : ""}`,
    );
  console.log(
    result.ready ? "\nReady." : "\nNot ready. Fix the ERROR checks above.",
  );
  if (!result.ready) process.exitCode = 1;
}

async function history() {
  const state = await loadPersonalState(paths.state);
  const jobs = Object.values(state.jobs).sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
  if (!jobs.length) {
    console.log("No personal job history yet. Run pnpm personal:prowl.");
    return;
  }
  for (const job of jobs)
    console.log(
      `${job.status.padEnd(11)} ${job.snapshot.fitScore.toString().padStart(3)}% ${job.id} ${job.snapshot.title} — ${job.snapshot.company}`,
    );
}

function help() {
  console.log(`RoleProwl Personal

Commands:
  pnpm personal:prowl -- --limit 25 [--new-only] [--refresh]
  pnpm personal:shortlist -- --job <id> [--note "..."]
  pnpm personal:reject -- --job <id> [--note "..."]
  pnpm personal:mark -- --job <id> --status APPLIED [--note "..."]
  pnpm personal:prepare -- --job <id>
  pnpm personal:export-resume -- --job <id>
  pnpm personal:open -- --job <id>
  pnpm personal:history
  pnpm personal:doctor

Personal mode never submits an application.`);
}

async function main() {
  if (flag("--help") || command === "help") return help();
  if (command === "prowl") return prowl();
  if (command === "shortlist") return mutateStatus("SHORTLISTED");
  if (command === "reject") return mutateStatus("REJECTED");
  if (command === "mark") return mark();
  if (command === "prepare") return prepare();
  if (command === "export-resume") return exportResume();
  if (command === "open") return openApplication();
  if (command === "history") return history();
  if (command === "doctor") return doctor();
  throw new Error(`Unknown command ${command}. Run pnpm personal -- help.`);
}

main().catch((error: unknown) => {
  console.error(
    `RoleProwl Personal\n\nError: ${error instanceof Error ? error.message : "Unknown personal-mode failure"}`,
  );
  process.exitCode = 1;
});
