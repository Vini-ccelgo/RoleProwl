"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { matchCandidateToJob } from "@/core/domain/matching/match-job";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import {
  buildCandidateMatchSnapshot,
  buildJobMatchSnapshot,
} from "@/features/jobs/build-match-snapshots";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
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
