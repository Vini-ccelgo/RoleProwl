CREATE TYPE "ApplicationState" AS ENUM (
  'DISCOVERED',
  'SHORTLISTED',
  'PREPARING',
  'NEEDS_REVIEW',
  'READY',
  'SUBMITTING',
  'SUBMITTED',
  'RESPONSE',
  'INTERVIEW',
  'REJECTED',
  'WITHDRAWN',
  'OFFER',
  'CLOSED',
  'FAILED'
);

CREATE TYPE "SubmissionMechanism" AS ENUM (
  'AUTHORIZED_API',
  'EXTERNAL_APPLICATION',
  'MANUAL_EXTERNAL',
  'UNSUPPORTED'
);

CREATE TYPE "ApplicationEventType" AS ENUM (
  'PREPARED',
  'READY_FOR_EXTERNAL_SUBMISSION',
  'SUBMISSION_STARTED',
  'SUBMISSION_CONFIRMED',
  'SUBMISSION_FAILED',
  'STATE_CHANGED'
);

CREATE TABLE "Application" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "decisionId" TEXT,
  "workflowRunId" TEXT,
  "resumeVersionId" TEXT,
  "state" "ApplicationState" NOT NULL DEFAULT 'PREPARING',
  "fitSnapshot" JSONB NOT NULL,
  "generatedTextSnapshot" JSONB NOT NULL,
  "answersSnapshot" JSONB NOT NULL,
  "documentsSnapshot" JSONB NOT NULL,
  "policyResultSnapshot" JSONB NOT NULL,
  "submissionPayloadSnapshot" JSONB NOT NULL,
  "submissionMechanism" "SubmissionMechanism" NOT NULL,
  "submissionDestination" TEXT,
  "externalSubmissionId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "externalConfirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationEvent" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" "ApplicationEventType" NOT NULL,
  "fromState" "ApplicationState",
  "toState" "ApplicationState" NOT NULL,
  "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Application_workflowRunId_key" ON "Application"("workflowRunId");
CREATE INDEX "Application_userId_state_updatedAt_idx" ON "Application"("userId", "state", "updatedAt");
CREATE INDEX "Application_jobId_idx" ON "Application"("jobId");
CREATE INDEX "Application_decisionId_idx" ON "Application"("decisionId");
CREATE INDEX "ApplicationEvent_applicationId_createdAt_idx" ON "ApplicationEvent"("applicationId", "createdAt");
CREATE INDEX "ApplicationEvent_actorUserId_createdAt_idx" ON "ApplicationEvent"("actorUserId", "createdAt");

ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ApplicationDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "ApplicationWorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
