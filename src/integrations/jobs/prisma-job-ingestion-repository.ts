import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { DeduplicationCandidate } from "@/core/domain/jobs/deduplication";
import {
  normalizeCompany,
  normalizeJobTitle,
} from "@/core/domain/jobs/normalization";
import { JOB_EVIDENCE_VERSION } from "@/core/domain/jobs/job-evidence";
import type { JobIngestionRepository } from "@/features/jobs/ingest-normalized-job";
import { databaseClient } from "@/lib/db/client";

function rawHash(payload: Readonly<Record<string, unknown>>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function json(value: unknown) {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function canonicalData(
  canonical: Parameters<
    JobIngestionRepository["createCanonicalWithSource"]
  >[0]["normalized"]["canonical"],
  contentHash: string,
) {
  return {
    company: canonical.company,
    normalizedCompany: normalizeCompany(canonical.company),
    title: canonical.title,
    normalizedTitle: normalizeJobTitle(canonical.title),
    description: canonical.description,
    canonicalApplicationUrl: canonical.canonicalApplicationUrl,
    locations: json(canonical.locations),
    remoteType: canonical.remoteType,
    employmentType: canonical.employmentType,
    seniority: canonical.seniority,
    salaryMin: canonical.salaryMin,
    salaryMax: canonical.salaryMax,
    salaryCurrency: canonical.salaryCurrency,
    salaryInterval: canonical.salaryInterval,
    requirements: json(canonical.requirements),
    preferredRequirements: json(canonical.preferredRequirements),
    skills: json(canonical.skills),
    educationRequirements: json(canonical.educationRequirements),
    experienceRequirements: json(canonical.experienceRequirements),
    workAuthorization: json(canonical.workAuthorization),
    sponsorship: json(canonical.sponsorship),
    postedAt: canonical.postedAt,
    expiresAt: canonical.expiresAt,
    contentHash,
    evidenceVersion: JOB_EVIDENCE_VERSION,
  };
}

function candidate(
  job: {
    id: string;
    canonicalApplicationUrl: string | null;
    company: string;
    title: string;
    description: string | null;
    locations: Prisma.JsonValue | null;
    seniority: string | null;
    contentHash: string;
    postedAt: Date | null;
    lastSeenAt: Date;
    status: "ACTIVE" | "STALE" | "EXPIRED" | "CLOSED";
    sourceRecords: readonly { source: string; externalId: string }[];
  },
  preferredSource?: { source: string; externalId: string },
): DeduplicationCandidate {
  const source =
    job.sourceRecords.find(
      (record) =>
        record.source === preferredSource?.source &&
        record.externalId === preferredSource.externalId,
    ) ?? job.sourceRecords[0];
  return {
    id: job.id,
    applicationUrl: job.canonicalApplicationUrl,
    company: job.company,
    title: job.title,
    description: job.description,
    locations: Array.isArray(job.locations)
      ? job.locations.filter(
          (value): value is string => typeof value === "string",
        )
      : null,
    seniority: job.seniority,
    contentHash: job.contentHash,
    postedAt: job.postedAt,
    lastSeenAt: job.lastSeenAt,
    status: job.status,
    source: source?.source ?? "UNKNOWN",
    externalId: source?.externalId ?? job.id,
  };
}

export class PrismaJobIngestionRepository implements JobIngestionRepository {
  async findCanonicalRefreshTarget(jobId: string) {
    const job = await databaseClient().job.findFirst({
      where: { id: jobId, status: "ACTIVE" },
      select: {
        id: true,
        company: true,
        contentHash: true,
        evidenceVersion: true,
        sourceRecords: {
          orderBy: { firstSeenAt: "asc" },
          take: 1,
          select: {
            applicationUrl: true,
            externalId: true,
            source: true,
            sourceUrl: true,
          },
        },
      },
    });
    if (!job?.sourceRecords[0]) return null;
    return {
      id: job.id,
      company: job.company,
      contentHash: job.contentHash,
      evidenceVersion: job.evidenceVersion,
      primarySource: job.sourceRecords[0],
    };
  }

  async findDeduplicationCandidates(input: {
    applicationUrl: string | null;
    company: string;
    source: string;
    externalId: string;
    title: string;
  }) {
    const jobs = await databaseClient().job.findMany({
      where: {
        OR: [
          {
            sourceRecords: {
              some: { source: input.source, externalId: input.externalId },
            },
          },
          ...(input.applicationUrl
            ? [{ canonicalApplicationUrl: input.applicationUrl }]
            : []),
          {
            normalizedCompany: normalizeCompany(input.company),
            normalizedTitle: normalizeJobTitle(input.title),
          },
        ],
      },
      include: {
        sourceRecords: { select: { source: true, externalId: true } },
      },
      take: 30,
    });
    return jobs.map((job) =>
      candidate(job, { source: input.source, externalId: input.externalId }),
    );
  }

  async createCanonicalWithSource(
    input: Parameters<JobIngestionRepository["createCanonicalWithSource"]>[0],
  ) {
    const { canonical, source } = input.normalized;
    const created = await databaseClient().job.create({
      data: {
        ...canonicalData(canonical, input.contentHash),
        firstSeenAt: input.observedAt,
        lastSeenAt: input.observedAt,
        lastVerifiedAt: input.observedAt,
        sourceRecords: {
          create: {
            source: source.source,
            externalId: source.externalId,
            sourceUrl: source.sourceUrl,
            applicationUrl: source.applicationUrl,
            rawPayload: source.payload as Prisma.InputJsonValue,
            contentHash: rawHash(source.payload),
            firstSeenAt: input.observedAt,
            lastSeenAt: input.observedAt,
            lastVerifiedAt: input.observedAt,
          },
        },
      },
      select: { id: true },
    });
    return created.id;
  }

  async mergeSourceAssociation(
    input: Parameters<JobIngestionRepository["mergeSourceAssociation"]>[0],
  ) {
    const { canonical, source } = input.normalized;
    const db = databaseClient();
    await db.$transaction(async (transaction) => {
      const current = await transaction.job.findUniqueOrThrow({
        where: { id: input.canonicalJobId },
        select: {
          contentHash: true,
          evidenceVersion: true,
          sourceRecords: {
            orderBy: { firstSeenAt: "asc" },
            select: { externalId: true, source: true },
            take: 1,
          },
        },
      });
      const canonicalSource = current.sourceRecords[0];
      const refreshesCanonicalSource =
        canonicalSource?.source === source.source &&
        canonicalSource.externalId === source.externalId;
      const contentChanged =
        refreshesCanonicalSource &&
        (current.contentHash !== input.contentHash ||
          current.evidenceVersion !== JOB_EVIDENCE_VERSION);
      await transaction.job.update({
        where: { id: input.canonicalJobId },
        data: {
          ...(refreshesCanonicalSource
            ? canonicalData(canonical, input.contentHash)
            : {}),
          lastSeenAt: input.observedAt,
          lastVerifiedAt: input.observedAt,
          status: "ACTIVE",
        },
      });
      if (contentChanged) {
        await transaction.jobMatchAnalysis.deleteMany({
          where: { jobId: input.canonicalJobId },
        });
      }
      await transaction.jobSourceRecord.upsert({
        where: {
          source_externalId: {
            source: source.source,
            externalId: source.externalId,
          },
        },
        create: {
          jobId: input.canonicalJobId,
          source: source.source,
          externalId: source.externalId,
          sourceUrl: source.sourceUrl,
          applicationUrl: source.applicationUrl,
          rawPayload: source.payload as Prisma.InputJsonValue,
          contentHash: rawHash(source.payload),
          firstSeenAt: input.observedAt,
          lastSeenAt: input.observedAt,
          lastVerifiedAt: input.observedAt,
        },
        update: {
          sourceUrl: source.sourceUrl,
          applicationUrl: source.applicationUrl,
          rawPayload: source.payload as Prisma.InputJsonValue,
          contentHash: rawHash(source.payload),
          lastSeenAt: input.observedAt,
          lastVerifiedAt: input.observedAt,
        },
      });
    });
  }
}
