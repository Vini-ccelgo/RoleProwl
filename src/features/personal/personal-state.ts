import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PersonalJobResult, PersonalProwlResult } from "./personal-prowl";

export const PERSONAL_JOB_STATUSES = [
  "NEW",
  "SEEN",
  "SHORTLISTED",
  "REJECTED",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "CLOSED",
] as const;

export type PersonalJobStatus = (typeof PERSONAL_JOB_STATUSES)[number];

export interface PersonalStateJob {
  readonly id: string;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly status: PersonalJobStatus;
  readonly fitHistory: readonly {
    readonly at: string;
    readonly score: number;
  }[];
  readonly notes: readonly string[];
  readonly appliedAt: string | null;
  readonly applicationPackagePath: string | null;
  readonly snapshot: PersonalJobResult;
}

export interface PersonalState {
  readonly version: 1;
  readonly jobs: Readonly<Record<string, PersonalStateJob>>;
}

export interface PersonalCache {
  readonly version: 1;
  readonly key: string;
  readonly cachedAt: string;
  readonly result: PersonalProwlResult;
}

const emptyState = (): PersonalState => ({ version: 1, jobs: {} });

async function readJson(path: string) {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(
      `Could not read ${path}: ${error instanceof Error ? error.message : "invalid JSON"}`,
    );
  }
}

export async function loadPersonalState(path: string): Promise<PersonalState> {
  const input = await readJson(path);
  if (input === null) return emptyState();
  const parsed = z
    .object({
      version: z.literal(1),
      jobs: z.record(
        z.string(),
        z
          .object({
            id: z.string(),
            firstSeenAt: z.iso.datetime(),
            lastSeenAt: z.iso.datetime(),
            status: z.enum(PERSONAL_JOB_STATUSES),
            fitHistory: z.array(
              z.object({ at: z.iso.datetime(), score: z.number() }),
            ),
            notes: z.array(z.string()),
            appliedAt: z.iso.datetime().nullable(),
            applicationPackagePath: z.string().nullable(),
            snapshot: z.record(z.string(), z.unknown()),
          })
          .passthrough(),
      ),
    })
    .parse(input);
  return parsed as unknown as PersonalState;
}

export async function savePersonalState(path: string, state: PersonalState) {
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function mergePersonalState(
  state: PersonalState,
  result: PersonalProwlResult,
  now = new Date(),
) {
  const at = now.toISOString();
  const jobs: Record<string, PersonalStateJob> = {};
  for (const [id, job] of Object.entries(state.jobs))
    jobs[id] = { ...job, status: job.status === "NEW" ? "SEEN" : job.status };

  const decorated = result.jobs.map((snapshot) => {
    const previous = jobs[snapshot.id];
    const status = previous?.status ?? "NEW";
    const history = [...(previous?.fitHistory ?? [])];
    if (!history.length || history.at(-1)?.score !== snapshot.fitScore)
      history.push({ at, score: snapshot.fitScore });
    const current = {
      ...snapshot,
      stateStatus: status,
      isNew: status === "NEW",
    };
    jobs[snapshot.id] = {
      id: snapshot.id,
      firstSeenAt: previous?.firstSeenAt ?? at,
      lastSeenAt: at,
      status,
      fitHistory: history.slice(-20),
      notes: previous?.notes ?? [],
      appliedAt: previous?.appliedAt ?? null,
      applicationPackagePath: previous?.applicationPackagePath ?? null,
      snapshot: current,
    };
    return current;
  });
  return {
    state: { version: 1, jobs } satisfies PersonalState,
    result: { ...result, jobs: decorated } satisfies PersonalProwlResult,
  };
}

export function updatePersonalJob(
  state: PersonalState,
  id: string,
  input: {
    readonly status?: PersonalJobStatus;
    readonly note?: string;
    readonly applicationPackagePath?: string;
  },
  now = new Date(),
) {
  const existing = state.jobs[id];
  if (!existing)
    throw new Error(
      `Unknown job ID ${id}. Run personal:prowl and copy an ID from results.md.`,
    );
  const status = input.status ?? existing.status;
  const note = input.note?.trim();
  return {
    ...state,
    jobs: {
      ...state.jobs,
      [id]: {
        ...existing,
        status,
        notes: note ? [...existing.notes, note] : existing.notes,
        appliedAt:
          status === "APPLIED"
            ? (existing.appliedAt ?? now.toISOString())
            : existing.appliedAt,
        applicationPackagePath:
          input.applicationPackagePath ?? existing.applicationPackagePath,
        snapshot: { ...existing.snapshot, stateStatus: status, isNew: false },
      },
    },
  } satisfies PersonalState;
}

export function personalCacheKey(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function loadFreshPersonalCache(input: {
  readonly path: string;
  readonly key: string;
  readonly now?: Date;
  readonly maximumAgeMs?: number;
}) {
  const data = await readJson(input.path);
  if (!data || typeof data !== "object") return null;
  const cache = data as PersonalCache;
  if (cache.version !== 1 || cache.key !== input.key || !cache.cachedAt)
    return null;
  const age =
    (input.now ?? new Date()).getTime() - new Date(cache.cachedAt).getTime();
  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age > (input.maximumAgeMs ?? 21_600_000)
  )
    return null;
  return cache.result;
}

export async function savePersonalCache(input: {
  readonly path: string;
  readonly key: string;
  readonly result: PersonalProwlResult;
  readonly now?: Date;
}) {
  const cache: PersonalCache = {
    version: 1,
    key: input.key,
    cachedAt: (input.now ?? new Date()).toISOString(),
    result: input.result,
  };
  await writeFile(input.path, `${JSON.stringify(cache, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}
