-- RP-002: RoleProwl-owned identity records. Clerk remains an external provider.
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "authProvider" TEXT NOT NULL,
    "externalAuthId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_authProvider_externalAuthId_key"
ON "User"("authProvider", "externalAuthId");

CREATE INDEX "User_email_idx" ON "User"("email");
