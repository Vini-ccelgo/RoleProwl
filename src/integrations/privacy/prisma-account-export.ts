import "server-only";
import {
  ACCOUNT_EXPORT_SCHEMA_VERSION,
  buildPortableAccountExport,
  sanitizePortableExportValue,
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
        candidateDocuments: {
          select: {
            id: true,
            originalFileName: true,
            format: true,
            status: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
            updatedAt: true,
            extraction: {
              select: {
                status: true,
                extractedText: true,
                characterCount: true,
                pageCount: true,
                errorCode: true,
              },
            },
            proposals: {
              select: {
                id: true,
                factType: true,
                targetPath: true,
                proposedValue: true,
                sourceRegion: true,
                confidence: true,
                status: true,
                acceptedValue: true,
                canonicalType: true,
                canonicalId: true,
                reviewedAt: true,
              },
            },
          },
        },
        jobMatchAnalyses: {
          select: {
            id: true,
            jobId: true,
            qualificationScore: true,
            preferenceScore: true,
            overallFit: true,
            confidence: true,
            evidenceCoverage: true,
            hardConflicts: true,
            conflicts: true,
            strengths: true,
            partialMatches: true,
            gaps: true,
            unknowns: true,
            scoringVersion: true,
            createdAt: true,
            updatedAt: true,
            feedback: {
              select: {
                signalCode: true,
                rating: true,
                note: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
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
  const portableApplications = applications.map(
    ({ documentsSnapshot, submissionPayloadSnapshot, ...application }) => ({
      ...application,
      documentsSnapshot: sanitizePortableExportValue(documentsSnapshot),
      submissionPayloadSnapshot: sanitizePortableExportValue(
        submissionPayloadSnapshot,
      ),
    }),
  );
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
      applications: portableApplications,
      generatedMaterials,
      notifications,
      productEvents,
      auditHistory,
    },
  });
}
