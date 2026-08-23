"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedActor } from "@/features/accounts/require-authenticated-actor";
import {
  isGreenhouseConfigurationFailure,
  parseGreenhouseBoards,
  runManualDiscovery,
  searchRunIsActive,
} from "@/features/jobs/manual-discovery";
import { PrismaProductAnalyticsProvider } from "@/integrations/analytics/prisma-product-analytics-provider";
import { currentAuthProvider } from "@/integrations/auth/clerk-auth-provider";
import { GreenhouseJobSource } from "@/integrations/jobs/greenhouse-job-source";
import { PrismaJobIngestionRepository } from "@/integrations/jobs/prisma-job-ingestion-repository";
import { PrismaSourceHealthReporter } from "@/integrations/jobs/prisma-source-health-reporter";
import { databaseClient } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";

export interface JobSearchActionState {
  status: "idle" | "running" | "success" | "error";
  message?: string;
  discoveredCount?: number;
  newCount?: number;
}

export async function runJobSearchAction(): Promise<JobSearchActionState> {
  const actionStartedAt = performance.now();
  const actor = await requireAuthenticatedActor(currentAuthProvider());
  const database = databaseClient();
  const startedAt = new Date();
  const claimed = await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.id}))`;
    const current = await transaction.jobSearchState.findUnique({
      where: { userId: actor.id },
      select: { status: true, startedAt: true },
    });
    if (searchRunIsActive(current, startedAt)) return false;
    await transaction.jobSearchState.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, status: "RUNNING", startedAt },
      update: {
        status: "RUNNING",
        startedAt,
        completedAt: null,
        discoveredCount: 0,
        newCount: 0,
        failureCode: null,
        failureMessage: null,
      },
    });
    return true;
  });

  if (!claimed) {
    logger.log("info", "manual_job_search_duplicate_blocked", {
      durationMs: Math.round(performance.now() - actionStartedAt),
    });
    return {
      status: "error",
      message:
        "A search is already running. Wait for it to finish, then retry.",
    };
  }

  try {
    const boards = parseGreenhouseBoards(process.env.GREENHOUSE_BOARDS_JSON);
    if (boards.length === 0) {
      throw new Error("No Greenhouse job boards are configured.");
    }
    const preferences = await database.candidatePreferences.findUnique({
      where: { userId: actor.id },
      select: { roleFamilies: true, locationPreferences: true },
    });
    const result = await runManualDiscovery({
      adapters: boards.map((board) => new GreenhouseJobSource(board)),
      analytics: new PrismaProductAnalyticsProvider(),
      health: new PrismaSourceHealthReporter(),
      repository: new PrismaJobIngestionRepository(),
      query: {
        query: preferences?.roleFamilies[0] ?? "",
        location: preferences?.locationPreferences[0],
      },
    });
    await database.jobSearchState.update({
      where: { userId: actor.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        discoveredCount: result.discoveredCount,
        newCount: result.newCount,
      },
    });
    logger.log("info", "manual_job_search_completed", {
      boardCount: boards.length,
      discoveredCount: result.discoveredCount,
      newCount: result.newCount,
      sourceFailureCount: result.sourceFailureCount,
      discoveryDurationMs: result.discoveryDurationMs,
      ingestionDurationMs: result.ingestionDurationMs,
      durationMs: Math.round(performance.now() - actionStartedAt),
    });
    revalidatePath("/");
    revalidatePath("/jobs");
    return {
      status: "success",
      message: "Search completed.",
      discoveredCount: result.discoveredCount,
      newCount: result.newCount,
    };
  } catch (error) {
    const configurationFailure = isGreenhouseConfigurationFailure(error);
    const message = configurationFailure
      ? "Job search is not configured yet. Add a valid GREENHOUSE_BOARDS_JSON setting."
      : "The public job search could not finish. No applications were submitted; retry when the source is available.";
    await database.jobSearchState.update({
      where: { userId: actor.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        failureCode: configurationFailure
          ? "SOURCE_CONFIGURATION_MISSING"
          : "DISCOVERY_FAILED",
        failureMessage: message,
      },
    });
    logger.log("warn", "manual_job_search_failed", {
      failureCode: configurationFailure
        ? "SOURCE_CONFIGURATION_MISSING"
        : "DISCOVERY_FAILED",
      durationMs: Math.round(performance.now() - actionStartedAt),
    });
    revalidatePath("/");
    return { status: "error", message };
  }
}
