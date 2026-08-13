import type {
  JobDiscoveryPage,
  JobDiscoveryQuery,
  JobReference,
  JobSourceAdapter,
  NormalizedSourceJob,
  RawSourceJob,
} from "@/core/contracts/job-source-adapter";
import { canonicalJobSchema } from "@/core/domain/jobs/job";
import { SourceAdapterError } from "@/core/errors/source-adapter-error";
import { sourceCapabilities } from "@/core/integrations/capability-registry";

const GREENHOUSE_BASE_URL = "https://boards-api.greenhouse.io/v1/boards";

interface GreenhouseJob {
  readonly id: number;
  readonly title: string;
  readonly content?: string;
  readonly absolute_url?: string;
  readonly updated_at?: string;
  readonly location?: { readonly name?: string };
  readonly departments?: readonly {
    readonly id: number;
    readonly name: string;
  }[];
  readonly offices?: readonly { readonly id: number; readonly name: string }[];
  readonly metadata?: unknown;
}

interface GreenhouseJobList {
  readonly jobs: readonly GreenhouseJob[];
}

export interface GreenhouseBoardConfiguration {
  readonly boardToken: string;
  readonly company: string;
}

export type JobSourceFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function plainText(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<\/p\s*>/giu, "\n")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n\s+/gu, "\n")
    .trim();
  return text || null;
}

function toRawJob(job: GreenhouseJob): RawSourceJob {
  return {
    source: "GREENHOUSE",
    externalId: String(job.id),
    sourceUrl: job.absolute_url ?? null,
    applicationUrl: job.absolute_url ?? null,
    payload: job as unknown as Readonly<Record<string, unknown>>,
  };
}

export class GreenhouseJobSource implements JobSourceAdapter {
  readonly source = "GREENHOUSE";

  constructor(
    private readonly configuration: GreenhouseBoardConfiguration,
    private readonly request: JobSourceFetch = fetch,
  ) {
    if (!/^[a-zA-Z0-9_-]+$/u.test(configuration.boardToken)) {
      throw new SourceAdapterError(
        this.source,
        "INVALID_CONFIGURATION",
        "Greenhouse board token is invalid.",
      );
    }
  }

  getCapabilities() {
    return sourceCapabilities("GREENHOUSE");
  }

  private async getJson(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.request(
        `${GREENHOUSE_BASE_URL}/${encodeURIComponent(this.configuration.boardToken)}${path}`,
        { headers: { accept: "application/json" }, signal: controller.signal },
      );
      if (!response.ok) {
        throw new SourceAdapterError(
          this.source,
          response.status === 429 ? "RATE_LIMITED" : `HTTP_${response.status}`,
          response.status === 429
            ? "Greenhouse rate limit reached."
            : "Greenhouse job data is temporarily unavailable.",
        );
      }
      return response.json();
    } catch (error) {
      if (error instanceof SourceAdapterError) throw error;
      throw new SourceAdapterError(
        this.source,
        error instanceof Error && error.name === "AbortError"
          ? "TIMEOUT"
          : "NETWORK_ERROR",
        "Greenhouse job data is temporarily unavailable.",
        error,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async discover(query: JobDiscoveryQuery): Promise<JobDiscoveryPage> {
    const payload = (await this.getJson(
      "/jobs?content=true",
    )) as GreenhouseJobList | null;
    if (!payload || !Array.isArray(payload.jobs)) {
      throw new SourceAdapterError(
        this.source,
        "INVALID_RESPONSE",
        "Greenhouse returned an invalid job list.",
      );
    }
    const needle = query.query.trim().toLocaleLowerCase("en-US");
    const location = query.location?.trim().toLocaleLowerCase("en-US");
    const jobs = payload.jobs.filter((job) => {
      const searchable =
        `${job.title} ${plainText(job.content) ?? ""}`.toLocaleLowerCase(
          "en-US",
        );
      const locationName = job.location?.name?.toLocaleLowerCase("en-US") ?? "";
      return (
        (!needle || searchable.includes(needle)) &&
        (!location || locationName.includes(location))
      );
    });
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 100);
    return { jobs: jobs.slice(0, limit).map(toRawJob), nextCursor: null };
  }

  async fetch(reference: JobReference): Promise<RawSourceJob | null> {
    if (reference.source !== this.source) return null;
    const payload = (await this.getJson(
      `/jobs/${encodeURIComponent(reference.externalId)}?content=true`,
    )) as GreenhouseJob;
    return typeof payload.id === "number" ? toRawJob(payload) : null;
  }

  refresh(reference: JobReference) {
    return this.fetch(reference);
  }

  async normalize(job: RawSourceJob): Promise<NormalizedSourceJob> {
    if (job.source !== this.source) {
      throw new SourceAdapterError(
        this.source,
        "WRONG_SOURCE",
        "Cannot normalize a non-Greenhouse job.",
      );
    }
    const payload = job.payload as unknown as GreenhouseJob;
    const location = payload.location?.name?.trim();
    return {
      source: job,
      canonical: canonicalJobSchema.parse({
        company: this.configuration.company,
        title: payload.title,
        description: plainText(payload.content),
        canonicalApplicationUrl: job.applicationUrl,
        locations: location ? [location] : null,
        remoteType: null,
        employmentType: null,
        seniority: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryInterval: null,
        requirements: null,
        preferredRequirements: null,
        skills: null,
        educationRequirements: null,
        experienceRequirements: null,
        workAuthorization: null,
        sponsorship: null,
        postedAt: null,
        expiresAt: null,
      }),
    };
  }
}
