import { canonicalJobSchema } from "@/core/domain/jobs/job";
import { normalizeCanonicalJob } from "@/core/domain/jobs/normalization";
import { GreenhouseJobSource } from "@/integrations/jobs/greenhouse-job-source";
import type {
  PersonalDiscoveredJob,
  PersonalSourceStatus,
  PersonalTargetedSource,
} from "./personal-source-types";

export type PersonalDiscoveryFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface PersonalDiscoveryEnvironment {
  readonly ADZUNA_APP_ID?: string;
  readonly ADZUNA_APP_KEY?: string;
}

export interface PersonalDiscoveryResult {
  readonly jobs: readonly PersonalDiscoveredJob[];
  readonly sources: readonly PersonalSourceStatus[];
}

function plainText(html: string | null | undefined) {
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

function safeDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeHttpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function employmentType(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/([a-z])([A-Z])/gu, "$1_$2")
    .replace(/[ -]+/gu, "_")
    .toUpperCase();
  const values: Readonly<Record<string, string>> = {
    FULLTIME: "FULL_TIME",
    FULL_TIME: "FULL_TIME",
    PARTTIME: "PART_TIME",
    PART_TIME: "PART_TIME",
    CONTRACT: "CONTRACT",
    FREELANCE: "CONTRACT",
    INTERN: "INTERNSHIP",
    INTERNSHIP: "INTERNSHIP",
    TEMPORARY: "TEMPORARY",
  };
  return values[normalized] ?? null;
}

function remoteType(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[^a-z]/giu, "").toLocaleLowerCase("en-US");
  if (normalized === "remote" || normalized === "anywhere") return "REMOTE";
  if (normalized === "hybrid") return "HYBRID";
  if (normalized === "onsite") return "ONSITE";
  return null;
}

function currency(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/u.test(normalized) ? normalized : null;
}

function canonical(input: Parameters<typeof canonicalJobSchema.parse>[0]) {
  return normalizeCanonicalJob(canonicalJobSchema.parse(input));
}

async function requestJson(
  request: PersonalDiscoveryFetch,
  url: URL,
  source: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await request(url.toString(), {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? `${source} rate limit reached.`
          : `${source} returned HTTP ${response.status}.`,
      );
    return response.json() as Promise<unknown>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error(`${source} request timed out.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverJobicy(
  queries: readonly string[],
  request: PersonalDiscoveryFetch,
) {
  const jobs = new Map<string, PersonalDiscoveredJob>();
  for (const query of queries.slice(0, 4)) {
    const url = new URL("https://jobicy.com/api/v2/remote-jobs");
    url.searchParams.set("count", "100");
    url.searchParams.set("tag", query);
    const payload = (await requestJson(request, url, "Jobicy")) as {
      jobs?: unknown[];
    };
    for (const item of payload.jobs ?? []) {
      if (!item || typeof item !== "object") continue;
      const job = item as Record<string, unknown>;
      const id = String(job.id ?? "").trim();
      const title = String(job.jobTitle ?? "").trim();
      const company = String(job.companyName ?? "").trim();
      const sourceUrl = safeHttpsUrl(job.url);
      if (!id || !title || !company || !sourceUrl) continue;
      jobs.set(id, {
        source: "JOBICY",
        sourceLabel: "Jobicy",
        sourceJobId: id,
        sourceUrl,
        canonical: canonical({
          company,
          title,
          description: plainText(
            typeof job.jobDescription === "string"
              ? job.jobDescription
              : typeof job.jobExcerpt === "string"
                ? job.jobExcerpt
                : null,
          ),
          canonicalApplicationUrl: sourceUrl,
          locations:
            typeof job.jobGeo === "string" && job.jobGeo.trim()
              ? [job.jobGeo]
              : null,
          remoteType: "REMOTE",
          employmentType: Array.isArray(job.jobType)
            ? employmentType(job.jobType[0])
            : employmentType(job.jobType),
          seniority: typeof job.jobLevel === "string" ? job.jobLevel : null,
          salaryMin: typeof job.salaryMin === "number" ? job.salaryMin : null,
          salaryMax: typeof job.salaryMax === "number" ? job.salaryMax : null,
          salaryCurrency: currency(job.salaryCurrency),
          salaryInterval:
            typeof job.salaryPeriod === "string" ? job.salaryPeriod : null,
          requirements: null,
          preferredRequirements: null,
          skills: null,
          educationRequirements: null,
          experienceRequirements: null,
          workAuthorization: null,
          sponsorship: null,
          postedAt: safeDate(job.pubDate),
          expiresAt: null,
        }),
      });
    }
  }
  return [...jobs.values()];
}

async function discoverRemotive(
  queries: readonly string[],
  request: PersonalDiscoveryFetch,
) {
  const url = new URL("https://remotive.com/api/remote-jobs");
  url.searchParams.set("limit", "100");
  const payload = (await requestJson(request, url, "Remotive")) as {
    jobs?: unknown[];
  };
  const needles = queries.map((query) => query.toLocaleLowerCase("en-US"));
  const jobs: PersonalDiscoveredJob[] = [];
  for (const item of payload.jobs ?? []) {
    if (!item || typeof item !== "object") continue;
    const job = item as Record<string, unknown>;
    const id = String(job.id ?? "").trim();
    const title = String(job.title ?? "").trim();
    const company = String(job.company_name ?? "").trim();
    const sourceUrl = safeHttpsUrl(job.url);
    const description = plainText(
      typeof job.description === "string" ? job.description : null,
    );
    const searchable = `${title} ${description ?? ""}`.toLocaleLowerCase(
      "en-US",
    );
    if (
      !id ||
      !title ||
      !company ||
      !sourceUrl ||
      (needles.length && !needles.some((needle) => searchable.includes(needle)))
    )
      continue;
    jobs.push({
      source: "REMOTIVE",
      sourceLabel: "Remotive",
      sourceJobId: id,
      sourceUrl,
      canonical: canonical({
        company,
        title,
        description,
        canonicalApplicationUrl: sourceUrl,
        locations:
          typeof job.candidate_required_location === "string" &&
          job.candidate_required_location.trim()
            ? [job.candidate_required_location]
            : null,
        remoteType: "REMOTE",
        employmentType: employmentType(job.job_type),
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
        postedAt: safeDate(job.publication_date),
        expiresAt: null,
      }),
    });
  }
  return jobs;
}

async function discoverAdzuna(
  input: {
    readonly appId: string;
    readonly appKey: string;
    readonly country: string;
    readonly location: string | null;
    readonly queries: readonly string[];
  },
  request: PersonalDiscoveryFetch,
) {
  const jobs = new Map<string, PersonalDiscoveredJob>();
  for (const query of input.queries.slice(0, 4)) {
    const url = new URL(
      `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(input.country)}/search/1`,
    );
    url.searchParams.set("app_id", input.appId);
    url.searchParams.set("app_key", input.appKey);
    url.searchParams.set("results_per_page", "50");
    url.searchParams.set("what", query);
    url.searchParams.set("content-type", "application/json");
    if (input.location) url.searchParams.set("where", input.location);
    const payload = (await requestJson(request, url, "Adzuna")) as {
      results?: unknown[];
    };
    for (const item of payload.results ?? []) {
      if (!item || typeof item !== "object") continue;
      const job = item as Record<string, unknown>;
      const id = String(job.id ?? "").trim();
      const title = String(job.title ?? "").trim();
      const companyObject =
        job.company && typeof job.company === "object"
          ? (job.company as Record<string, unknown>)
          : null;
      const company = String(companyObject?.display_name ?? "").trim();
      const sourceUrl = safeHttpsUrl(job.redirect_url);
      if (!id || !title || !company || !sourceUrl) continue;
      const locationObject =
        job.location && typeof job.location === "object"
          ? (job.location as Record<string, unknown>)
          : null;
      jobs.set(id, {
        source: "ADZUNA",
        sourceLabel: "Adzuna",
        sourceJobId: id,
        sourceUrl,
        canonical: canonical({
          company,
          title,
          description:
            typeof job.description === "string" ? job.description : null,
          canonicalApplicationUrl: sourceUrl,
          locations:
            typeof locationObject?.display_name === "string"
              ? [locationObject.display_name]
              : null,
          remoteType: null,
          employmentType: null,
          seniority: null,
          salaryMin: typeof job.salary_min === "number" ? job.salary_min : null,
          salaryMax: typeof job.salary_max === "number" ? job.salary_max : null,
          salaryCurrency: null,
          salaryInterval: null,
          requirements: null,
          preferredRequirements: null,
          skills: null,
          educationRequirements: null,
          experienceRequirements: null,
          workAuthorization: null,
          sponsorship: null,
          postedAt: safeDate(job.created),
          expiresAt: null,
        }),
      });
    }
  }
  return [...jobs.values()];
}

async function discoverTargeted(
  source: PersonalTargetedSource,
  request: PersonalDiscoveryFetch,
) {
  if (source.kind === "GREENHOUSE") {
    const adapter = new GreenhouseJobSource(source, request);
    const page = await adapter.discover({ query: "", limit: 100 });
    return Promise.all(
      page.jobs.map(async (raw) => {
        const normalized = await adapter.normalize(raw);
        const sourceUrl = raw.sourceUrl ?? raw.applicationUrl;
        if (!sourceUrl) throw new Error("Greenhouse job URL is missing.");
        return {
          source: "GREENHOUSE" as const,
          sourceLabel: `Greenhouse/${source.company}`,
          sourceJobId: raw.externalId,
          sourceUrl,
          canonical: normalizeCanonicalJob(normalized.canonical),
        };
      }),
    );
  }
  if (source.kind === "LEVER") {
    const host = source.region === "EU" ? "api.eu.lever.co" : "api.lever.co";
    const url = new URL(
      `https://${host}/v0/postings/${encodeURIComponent(source.site)}`,
    );
    url.searchParams.set("mode", "json");
    url.searchParams.set("limit", "100");
    const payload = await requestJson(request, url, "Lever");
    if (!Array.isArray(payload)) throw new Error("Lever response is invalid.");
    return payload.flatMap((item): PersonalDiscoveredJob[] => {
      if (!item || typeof item !== "object") return [];
      const job = item as Record<string, unknown>;
      const id = String(job.id ?? "").trim();
      const title = String(job.text ?? "").trim();
      const categories =
        job.categories && typeof job.categories === "object"
          ? (job.categories as Record<string, unknown>)
          : null;
      const applicationUrl =
        safeHttpsUrl(job.applyUrl) ?? safeHttpsUrl(job.hostedUrl);
      const sourceUrl = safeHttpsUrl(job.hostedUrl) ?? applicationUrl;
      if (!id || !title || !sourceUrl || !applicationUrl) return [];
      const allLocations = Array.isArray(categories?.allLocations)
        ? categories.allLocations.filter(
            (location): location is string => typeof location === "string",
          )
        : typeof categories?.location === "string"
          ? [categories.location]
          : null;
      return [
        {
          source: "LEVER",
          sourceLabel: `Lever/${source.company}`,
          sourceJobId: id,
          sourceUrl,
          canonical: canonical({
            company: source.company,
            title,
            description: plainText(
              typeof job.descriptionPlain === "string"
                ? job.descriptionPlain
                : typeof job.description === "string"
                  ? job.description
                  : null,
            ),
            canonicalApplicationUrl: applicationUrl,
            locations: allLocations?.length ? allLocations : null,
            remoteType: remoteType(job.workplaceType),
            employmentType: employmentType(categories?.commitment),
            seniority:
              typeof categories?.level === "string" ? categories.level : null,
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
            postedAt:
              typeof job.createdAt === "number"
                ? new Date(job.createdAt)
                : safeDate(job.createdAt),
            expiresAt: null,
          }),
        },
      ];
    });
  }

  const url = new URL(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.boardName)}`,
  );
  url.searchParams.set("includeCompensation", "true");
  const payload = (await requestJson(request, url, "Ashby")) as {
    jobs?: unknown[];
  };
  return (payload.jobs ?? []).flatMap((item): PersonalDiscoveredJob[] => {
    if (!item || typeof item !== "object") return [];
    const job = item as Record<string, unknown>;
    if (job.isListed === false) return [];
    const applicationUrl = safeHttpsUrl(job.applyUrl);
    const sourceUrl = safeHttpsUrl(job.jobUrl) ?? applicationUrl;
    const title = String(job.title ?? "").trim();
    if (!title || !applicationUrl || !sourceUrl) return [];
    const compensation =
      job.compensation && typeof job.compensation === "object"
        ? (job.compensation as Record<string, unknown>)
        : null;
    const components = Array.isArray(compensation?.summaryComponents)
      ? compensation.summaryComponents
      : [];
    const salary = components.find(
      (component) =>
        component &&
        typeof component === "object" &&
        (component as Record<string, unknown>).compensationType === "Salary",
    ) as Record<string, unknown> | undefined;
    const id = sourceUrl.split("/").filter(Boolean).at(-1) ?? title;
    return [
      {
        source: "ASHBY",
        sourceLabel: `Ashby/${source.company}`,
        sourceJobId: id,
        sourceUrl,
        canonical: canonical({
          company: source.company,
          title,
          description:
            typeof job.descriptionPlain === "string"
              ? job.descriptionPlain
              : plainText(
                  typeof job.descriptionHtml === "string"
                    ? job.descriptionHtml
                    : null,
                ),
          canonicalApplicationUrl: applicationUrl,
          locations:
            typeof job.location === "string" && job.location.trim()
              ? [job.location]
              : null,
          remoteType:
            remoteType(job.workplaceType) ??
            (job.isRemote === true ? "REMOTE" : null),
          employmentType: employmentType(job.employmentType),
          seniority: null,
          salaryMin:
            typeof salary?.minValue === "number" ? salary.minValue : null,
          salaryMax:
            typeof salary?.maxValue === "number" ? salary.maxValue : null,
          salaryCurrency: currency(salary?.currencyCode),
          salaryInterval:
            typeof salary?.interval === "string" ? salary.interval : null,
          requirements: null,
          preferredRequirements: null,
          skills: null,
          educationRequirements: null,
          experienceRequirements: null,
          workAuthorization: null,
          sponsorship: null,
          postedAt: safeDate(job.publishedAt),
          expiresAt: null,
        }),
      },
    ];
  });
}

export async function discoverPersonalJobs(input: {
  readonly adzunaCountry: string | null;
  readonly environment?: PersonalDiscoveryEnvironment;
  readonly locations: readonly string[];
  readonly queries: readonly string[];
  readonly request?: PersonalDiscoveryFetch;
  readonly targetedSources: readonly PersonalTargetedSource[];
}): Promise<PersonalDiscoveryResult> {
  const request = input.request ?? fetch;
  const jobs: PersonalDiscoveredJob[] = [];
  const sources: PersonalSourceStatus[] = [];
  const run = async (
    key: string,
    label: string,
    attributionUrl: string | null,
    operation: () => Promise<readonly PersonalDiscoveredJob[]>,
  ) => {
    try {
      const discovered = await operation();
      jobs.push(...discovered);
      sources.push({
        key,
        label,
        status: "OK",
        jobs: discovered.length,
        message: null,
        attributionUrl,
      });
    } catch (error) {
      sources.push({
        key,
        label,
        status: "WARNING",
        jobs: 0,
        message: error instanceof Error ? error.message : "Discovery failed.",
        attributionUrl,
      });
    }
  };

  await run("jobicy", "Jobicy", "https://jobicy.com", () =>
    discoverJobicy(input.queries, request),
  );
  await run("remotive", "Remotive", "https://remotive.com", () =>
    discoverRemotive(input.queries, request),
  );

  const appId = input.environment?.ADZUNA_APP_ID?.trim();
  const appKey = input.environment?.ADZUNA_APP_KEY?.trim();
  if (!input.adzunaCountry || !appId || !appKey)
    sources.push({
      key: "adzuna",
      label: "Adzuna",
      status: "SKIPPED",
      jobs: 0,
      message:
        "Configure adzunaCountry, ADZUNA_APP_ID, and ADZUNA_APP_KEY to enable this optional source.",
      attributionUrl: "https://www.adzuna.com",
    });
  else
    await run("adzuna", "Adzuna", "https://www.adzuna.com", () =>
      discoverAdzuna(
        {
          appId,
          appKey,
          country: input.adzunaCountry as string,
          location:
            input.locations.find(
              (location) => !/^remote$|^latam$/iu.test(location.trim()),
            ) ?? null,
          queries: input.queries,
        },
        request,
      ),
    );

  for (const targeted of input.targetedSources) {
    const identity =
      targeted.kind === "GREENHOUSE"
        ? targeted.boardToken
        : targeted.kind === "LEVER"
          ? targeted.site
          : targeted.boardName;
    await run(
      `${targeted.kind.toLocaleLowerCase("en-US")}:${identity}`,
      `${targeted.kind[0]}${targeted.kind.slice(1).toLocaleLowerCase("en-US")}/${targeted.company}`,
      null,
      () => discoverTargeted(targeted, request),
    );
  }

  return { jobs, sources };
}
