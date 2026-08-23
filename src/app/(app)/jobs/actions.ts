"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireLegitimateDestination } from "@/core/domain/applications/submission";
import { matchCandidateToJob } from "@/core/domain/matching/match-job";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import { startApplication } from "@/features/applications/start-application";
import {
  buildCandidateMatchSnapshot,
  buildJobMatchSnapshot,
} from "@/features/jobs/build-match-snapshots";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { PrismaProductAnalyticsProvider } from "@/integrations/analytics/prisma-product-analytics-provider";
import { PrismaApplicationStartRepository } from "@/integrations/applications/prisma-application-start-repository";
import { PrismaApplicationPacketRepository } from "@/integrations/applications/prisma-application-packet-repository";
import { refreshApplicationPacket } from "@/features/applications/refresh-application-packet";
import { trackProductEvent } from "@/features/analytics/track-product-event";
import { databaseClient } from "@/lib/db/client";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function analyzeJobAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return;
  const db = databaseClient();
  const [job, candidate] = await Promise.all([
    db.job.findUnique({ where: { id: jobId } }),
    db.user.findUnique({
      where: { id: actor.id },
      select: {
        skills: {
          select: {
            canonicalName: true,
            proficiency: true,
            experienceMonths: true,
          },
        },
        workExperiences: {
          select: { startDate: true, endDate: true, isCurrent: true },
        },
        educationRecords: { select: { credential: true } },
        candidatePreferences: {
          select: {
            roleFamilies: true,
            industries: true,
            remotePreference: true,
            locationPreferences: true,
            salaryMinimum: true,
          },
        },
        workAuthorizationProfile: {
          select: {
            countryCode: true,
            authorizationStatus: true,
            requiresSponsorship: true,
          },
        },
      },
    }),
  ]);
  if (!job || !candidate) return;
  const result = matchCandidateToJob(
    buildCandidateMatchSnapshot({
      skills: candidate.skills,
      workExperiences: candidate.workExperiences,
      educationRecords: candidate.educationRecords,
      preferences: candidate.candidatePreferences,
      authorization: candidate.workAuthorizationProfile,
    }),
    buildJobMatchSnapshot(job),
  );
  await db.jobMatchAnalysis.upsert({
    where: {
      userId_jobId_scoringVersion: {
        userId: actor.id,
        jobId,
        scoringVersion: result.scoringVersion,
      },
    },
    create: {
      userId: actor.id,
      jobId,
      ...result,
      hardConflicts: asJson(result.hardConflicts),
      strengths: asJson(result.strengths),
      partialMatches: asJson(result.partialMatches),
      gaps: asJson(result.gaps),
      unknowns: asJson(result.unknowns),
    },
    update: {
      ...result,
      hardConflicts: asJson(result.hardConflicts),
      strengths: asJson(result.strengths),
      partialMatches: asJson(result.partialMatches),
      gaps: asJson(result.gaps),
      unknowns: asJson(result.unknowns),
    },
  });
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard");
}

export async function recordMatchFeedbackAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const analysisId = String(formData.get("analysisId") ?? "");
  const signalCode = String(formData.get("signalCode") ?? "OVERALL");
  const rating = String(formData.get("rating") ?? "");
  if (
    !analysisId ||
    (rating !== "ACCURATE" &&
      rating !== "INACCURATE" &&
      rating !== "NOT_RELEVANT")
  )
    return;
  const analysis = await databaseClient().jobMatchAnalysis.findFirst({
    where: { id: analysisId, userId: actor.id },
    select: { id: true },
  });
  if (!analysis) return;
  await databaseClient().matchFeedback.upsert({
    where: {
      userId_analysisId_signalCode: {
        userId: actor.id,
        analysisId,
        signalCode,
      },
    },
    create: { userId: actor.id, analysisId, signalCode, rating },
    update: { rating },
  });
  revalidatePath("/jobs");
}

export async function setJobDispositionAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const jobId = String(formData.get("jobId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (
    !jobId ||
    (status !== "SHORTLISTED" &&
      status !== "REJECTED" &&
      status !== "UNDECIDED")
  )
    return;
  const job = await databaseClient().job.findUnique({
    where: { id: jobId, status: "ACTIVE" },
    select: {
      id: true,
      applications: {
        where: { userId: actor.id },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!job) return;
  if (status === "REJECTED" && job.applications.length > 0) return;
  if (status === "UNDECIDED") {
    await databaseClient().candidateJobDisposition.deleteMany({
      where: { userId: actor.id, jobId },
    });
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/dashboard");
    return;
  }
  await databaseClient().candidateJobDisposition.upsert({
    where: { userId_jobId: { userId: actor.id, jobId } },
    create: { userId: actor.id, jobId, status },
    update: { status },
  });
  const eventType =
    status === "SHORTLISTED" ? "JOB_SHORTLISTED" : "JOB_REJECTED";
  await trackProductEvent(new PrismaProductAnalyticsProvider(), {
    dedupeKey: `${eventType.toLowerCase().replaceAll("_", "-")}:${actor.id}:${jobId}`,
    entityId: jobId,
    entityType: "job",
    eventType,
    occurredAt: new Date(),
    properties: { surface: "jobs" },
    userId: actor.id,
  });
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard");
}

export async function startApplicationAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return;
  const application = await startApplication({
    jobId,
    repository: new PrismaApplicationStartRepository(),
    userId: actor.id,
  });
  if (application.created)
    await refreshApplicationPacket({
      applicationId: application.applicationId,
      repository: new PrismaApplicationPacketRepository(),
      userId: actor.id,
    });
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  redirect(`/applications/${application.applicationId}`);
}

export async function openEmployerPostingAction(formData: FormData) {
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return;
  const job = await databaseClient().job.findUnique({
    where: { id: jobId, status: "ACTIVE" },
    select: {
      id: true,
      sourceRecords: {
        orderBy: { lastSeenAt: "desc" },
        take: 1,
        select: { applicationUrl: true },
      },
    },
  });
  if (!job?.sourceRecords[0]?.applicationUrl) return;
  const destination = requireLegitimateDestination(
    job.sourceRecords[0].applicationUrl,
  );
  const day = new Date().toISOString().slice(0, 10);
  await trackProductEvent(new PrismaProductAnalyticsProvider(), {
    dedupeKey: `job-viewed:${actor.id}:${jobId}:${day}`,
    entityId: jobId,
    entityType: "job",
    eventType: "JOB_VIEWED",
    occurredAt: new Date(),
    properties: { surface: "jobs" },
    userId: actor.id,
  });
  redirect(destination);
}
