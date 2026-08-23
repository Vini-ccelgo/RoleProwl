import "server-only";
import {
  ACCOUNT_EXPORT_SCHEMA_VERSION,
  buildPortableAccountExport,
} from "@/features/privacy/account-export";
import { databaseClient } from "@/lib/db/client";

export async function exportAccountData(userId: string) {
  const database = databaseClient();
  const [
    account,
    candidate,
    policy,
    answers,
    applications,
    generatedMaterials,
    notifications,
    productEvents,
    auditHistory,
  ] = await Promise.all([
    database.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        authProvider: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    database.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        candidateProfile: true,
        workExperiences: true,
        educationRecords: true,
        skills: { include: { evidence: true } },
        projects: true,
        credentials: true,
        candidatePreferences: true,
        workAuthorizationProfile: true,
        candidateFacts: true,
        notificationPreferences: true,
        jobSearchState: true,
        jobDispositions: {
          select: {
            status: true,
            createdAt: true,
            updatedAt: true,
            job: { select: { company: true, title: true } },
          },
        },
      },
    }),
    database.applicationPolicy.findUnique({ where: { userId } }),
    database.answerMemory.findMany({ where: { userId } }),
    database.application.findMany({
      where: { userId },
      include: {
        job: {
          select: { company: true, title: true, canonicalApplicationUrl: true },
        },
        events: { orderBy: { createdAt: "asc" } },
        resumeVersion: {
          select: {
            id: true,
            content: true,
            renderedFileName: true,
            generatedAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    Promise.all([
      database.resumeVersion.findMany({
        where: { userId },
        select: {
          id: true,
          targetJobId: true,
          content: true,
          renderedFileName: true,
          generatedAt: true,
        },
      }),
      database.applicationWritingArtifact.findMany({
        where: { userId },
        select: {
          id: true,
          targetJobId: true,
          type: true,
          content: true,
          generatedAt: true,
        },
      }),
    ]).then(([resumes, writing]) => ({ resumes, writing })),
    database.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    database.productEvent.findMany({
      where: { userId },
      select: {
        eventType: true,
        entityType: true,
        entityId: true,
        properties: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: "asc" },
    }),
    database.auditEvent.findMany({
      where: { actorUserId: userId },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const exportedAt = new Date();
  await database.auditEvent.create({
    data: {
      actorUserId: userId,
      action: "ACCOUNT_EXPORT_REQUESTED",
      entityType: "user",
      entityId: userId,
      metadata: {
        format: "JSON",
        schemaVersion: ACCOUNT_EXPORT_SCHEMA_VERSION,
      },
    },
  });
  return buildPortableAccountExport({
    exportedAt,
    sections: {
      account,
      candidate,
      policy,
      answers,
      applications,
      generatedMaterials,
      notifications,
      productEvents,
      auditHistory,
    },
  });
}
