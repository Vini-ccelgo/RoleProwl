CREATE TYPE "VerificationState" AS ENUM ('UNVERIFIED', 'VERIFIED', 'STALE', 'DISPUTED');
CREATE TYPE "FactSource" AS ENUM ('USER_ENTERED', 'RESUME_EXTRACTED', 'IMPORT', 'SYSTEM_COMPUTED');

CREATE TABLE "CandidateProfile" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL, "professionalTitle" TEXT, "summary" TEXT,
  "phone" TEXT, "location" TEXT, "websiteUrl" TEXT, "linkedInUrl" TEXT,
  "verificationState" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
  "source" "FactSource" NOT NULL DEFAULT 'USER_ENTERED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CandidateProfile_userId_key" ON "CandidateProfile"("userId");

CREATE TABLE "WorkExperience" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "employer" TEXT NOT NULL,
  "title" TEXT NOT NULL, "employmentType" TEXT, "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3), "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "location" TEXT, "description" TEXT, "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "verificationState" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
  "source" "FactSource" NOT NULL DEFAULT 'USER_ENTERED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkExperience_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkExperience_userId_startDate_idx" ON "WorkExperience"("userId", "startDate");

CREATE TABLE "Education" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "institution" TEXT NOT NULL,
  "program" TEXT, "credential" TEXT, "startDate" TIMESTAMP(3), "endDate" TIMESTAMP(3),
  "status" TEXT, "coursework" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "verificationState" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
  "source" "FactSource" NOT NULL DEFAULT 'USER_ENTERED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Education_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Education_userId_idx" ON "Education"("userId");

CREATE TABLE "Skill" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "canonicalName" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL, "category" TEXT, "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "proficiency" TEXT, "experienceMonths" INTEGER,
  "verificationState" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
  "source" "FactSource" NOT NULL DEFAULT 'USER_ENTERED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Skill_userId_normalizedName_key" ON "Skill"("userId", "normalizedName");
CREATE INDEX "Skill_userId_idx" ON "Skill"("userId");

CREATE TABLE "CandidateSkillEvidence" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "skillId" TEXT NOT NULL,
  "evidenceType" TEXT NOT NULL, "evidenceId" TEXT NOT NULL, "description" TEXT,
  "verificationState" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
  "source" "FactSource" NOT NULL DEFAULT 'USER_ENTERED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateSkillEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CandidateSkillEvidence_skillId_evidenceType_evidenceId_key" ON "CandidateSkillEvidence"("skillId", "evidenceType", "evidenceId");
CREATE INDEX "CandidateSkillEvidence_userId_idx" ON "CandidateSkillEvidence"("userId");

CREATE TABLE "Project" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "role" TEXT,
  "description" TEXT, "startDate" TIMESTAMP(3), "endDate" TIMESTAMP(3), "url" TEXT,
  "skills" TEXT[] DEFAULT ARRAY[]::TEXT[], "outcomes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "verificationState" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
  "source" "FactSource" NOT NULL DEFAULT 'USER_ENTERED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

CREATE TABLE "Credential" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "issuer" TEXT,
  "issuedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3), "credentialId" TEXT, "credentialUrl" TEXT,
  "verificationState" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
  "source" "FactSource" NOT NULL DEFAULT 'USER_ENTERED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Credential_userId_idx" ON "Credential"("userId");

CREATE TABLE "CandidatePreferences" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "roleFamilies" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "industries" TEXT[] DEFAULT ARRAY[]::TEXT[], "remotePreference" TEXT,
  "locationPreferences" TEXT[] DEFAULT ARRAY[]::TEXT[], "salaryMinimum" INTEGER,
  "salaryCurrency" TEXT, "employmentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "seniorities" TEXT[] DEFAULT ARRAY[]::TEXT[], "maximumTravelPercent" INTEGER,
  "willingToRelocate" BOOLEAN, "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidatePreferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CandidatePreferences_userId_key" ON "CandidatePreferences"("userId");

CREATE TABLE "WorkAuthorizationProfile" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "countryCode" TEXT NOT NULL,
  "authorizationStatus" TEXT NOT NULL, "requiresSponsorship" BOOLEAN NOT NULL, "notes" TEXT,
  "verificationState" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
  "source" "FactSource" NOT NULL DEFAULT 'USER_ENTERED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkAuthorizationProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkAuthorizationProfile_userId_key" ON "WorkAuthorizationProfile"("userId");

ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkExperience" ADD CONSTRAINT "WorkExperience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Education" ADD CONSTRAINT "Education_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateSkillEvidence" ADD CONSTRAINT "CandidateSkillEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateSkillEvidence" ADD CONSTRAINT "CandidateSkillEvidence_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidatePreferences" ADD CONSTRAINT "CandidatePreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkAuthorizationProfile" ADD CONSTRAINT "WorkAuthorizationProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
