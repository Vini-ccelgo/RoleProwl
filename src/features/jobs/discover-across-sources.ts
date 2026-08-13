import type {
  JobDiscoveryQuery,
  JobSourceAdapter,
  NormalizedSourceJob,
  SourceHealthReporter,
} from "@/core/contracts/job-source-adapter";
import { SourceAdapterError } from "@/core/errors/source-adapter-error";
import { hasCapabilities } from "@/core/types/capabilities";

export interface DiscoveryFailure {
  readonly code: string;
  readonly message: string;
  readonly source: string;
}

export interface MultiSourceDiscoveryResult {
  readonly failures: readonly DiscoveryFailure[];
  readonly jobs: readonly NormalizedSourceJob[];
}

function safeFailure(error: unknown, source: string): DiscoveryFailure {
  if (error instanceof SourceAdapterError) {
    return { source, code: error.sourceCode, message: error.message };
  }
  return {
    source,
    code: "SOURCE_UNAVAILABLE",
    message: `${source} is temporarily unavailable.`,
  };
}

export async function discoverAcrossSources(
  adapters: readonly JobSourceAdapter[],
  query: JobDiscoveryQuery,
  health: SourceHealthReporter,
): Promise<MultiSourceDiscoveryResult> {
  const eligible = adapters.filter((adapter) =>
    hasCapabilities(adapter.getCapabilities(), ["READ_JOBS"]),
  );
  const settled = await Promise.allSettled(
    eligible.map(async (adapter) => {
      const page = await adapter.discover(query);
      const jobs = await Promise.all(
        page.jobs.map((job) => adapter.normalize(job)),
      );
      await health.report({ source: adapter.source, status: "HEALTHY" });
      return { source: adapter.source, jobs };
    }),
  );

  const jobs: NormalizedSourceJob[] = [];
  const failures: DiscoveryFailure[] = [];
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const source = eligible[index].source;
    if (result.status === "fulfilled") {
      jobs.push(...result.value.jobs);
      continue;
    }
    const failure = safeFailure(result.reason, source);
    failures.push(failure);
    await health.report({
      source,
      status: "DEGRADED",
      errorCode: failure.code,
      errorMessage: failure.message,
    });
  }
  return { jobs, failures };
}
