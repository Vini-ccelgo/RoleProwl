CREATE TYPE "ApplicationAutonomyLevel" AS ENUM ('RECOMMEND_ONLY', 'AUTO_PREPARE', 'AUTO_SUBMIT_AUTHORIZED');

CREATE TABLE "ApplicationPolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "allowedRoleFamilies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minimumOverallFit" INTEGER NOT NULL DEFAULT 70,
    "excludedSeniorities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "salaryMinimum" INTEGER,
    "allowedLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requireRemote" BOOLEAN NOT NULL DEFAULT false,
    "allowedEmploymentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rejectAuthorizationConflict" BOOLEAN NOT NULL DEFAULT true,
    "companyBlacklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dailyApplicationLimit" INTEGER NOT NULL DEFAULT 10,
    "autonomyLevel" "ApplicationAutonomyLevel" NOT NULL DEFAULT 'RECOMMEND_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApplicationPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationPolicy_userId_key" ON "ApplicationPolicy"("userId");
ALTER TABLE "ApplicationPolicy" ADD CONSTRAINT "ApplicationPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
