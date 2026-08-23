import { z } from "zod";
import type {
  JobSourceAdapter,
  SourceHealthReporter,
} from "@/core/contracts/job-source-adapter";
import type { AnalyticsProvider } from "@/core/contracts/analytics-provider";
import { discoverAcrossSources } from "./discover-across-sources";
import {
  ingestNormalizedJob,
  type JobIngestionRepository,
} from "./ingest-normalized-job";

const greenhouseBoardsSchema = z
  .array(
    z.object({
      boardToken: z.string().regex(/^[a-zA-Z0-9_-]+$/u),
      company: z.string().trim().min(1).max(160),
    }),
  )
  .min(1)
  .max(30);

export function parseGreenhouseBoards(value: string | undefined) {
  if (!value?.trim()) return [];
  return greenhouseBoardsSchema.parse(JSON.parse(value));
}

export function isGreenhouseConfigurationFailure(error: unknown) {
  return (
    error instanceof SyntaxError ||
    error instanceof z.ZodError ||
    (error instanceof Error && error.message.includes("configured"))
  );
}

export function searchRunIsActive(
  state: { status: string; startedAt: Date } | null,
  now = new Date(),
) {
  if (state?.status !== "RUNNING") return false;
  return now.getTime() - state.startedAt.getTime() < 15 * 60 * 1000;
}

export async function runManualDiscovery(input: {
  adapters: readonly JobSourceAdapter[];
  analytics?: AnalyticsProvider;
  health: SourceHealthReporter;
  repository: JobIngestionRepository;
  query?: { query: string; location?: string };
}) {
  const discoveryStartedAt = performance.now();
  const discovery = await discoverAcrossSources(
    input.adapters,
    {
      query: input.query?.query ?? "",
      location: input.query?.location,
      limit: 100,
    },
    input.health,
  );
  const discoveryCompletedAt = performance.now();
  if (discovery.jobs.length === 0 && discovery.failures.length > 0) {
    throw new Error("All configured public job sources were unavailable.");
  }

  const ingestionStartedAt = performance.now();
  let created = 0;
  for (let offset = 0; offset < discovery.jobs.length; offset += 8) {
    const batch = discovery.jobs.slice(offset, offset + 8);
    const results = await Promise.all(
      batch.map((job) =>
        ingestNormalizedJob(job, input.repository, new Date(), input.analytics),
      ),
    );
    created += results.filter((result) => result.created).length;
  }

  return {
    discoveredCount: discovery.jobs.length,
    newCount: created,
    sourceFailureCount: discovery.failures.length,
    discoveryDurationMs: Math.round(discoveryCompletedAt - discoveryStartedAt),
    ingestionDurationMs: Math.round(performance.now() - ingestionStartedAt),
  };
}
