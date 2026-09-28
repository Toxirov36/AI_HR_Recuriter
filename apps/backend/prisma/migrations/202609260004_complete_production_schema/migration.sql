-- Reconcile features previously present only in development databases.
-- IF NOT EXISTS also supports development databases updated with db push.
-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'INTERVIEWER';

-- DropForeignKey
ALTER TABLE "CandidateEvent" DROP CONSTRAINT IF EXISTS "CandidateEvent_candidateId_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Resume" DROP CONSTRAINT IF EXISTS "Resume_candidateId_companyId_fkey";

-- DropForeignKey
ALTER TABLE "TelegramBusinessConnection" DROP CONSTRAINT IF EXISTS "TelegramBusinessConnection_companyId_fkey";

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "isAnonymized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "isOcrProcessed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "retentionDays" INTEGER NOT NULL DEFAULT 180;

-- AlterTable
ALTER TABLE "TelegramBusinessConnection" ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT,
ADD COLUMN IF NOT EXISTS "userId" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "mfaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TelegramConnectRequest" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "telegramUsername" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramConnectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramConnectRequest_token_key" ON "TelegramConnectRequest"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TelegramConnectRequest_token_idx" ON "TelegramConnectRequest"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TelegramConnectRequest_companyId_idx" ON "TelegramConnectRequest"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TelegramConnectRequest_telegramUserId_idx" ON "TelegramConnectRequest"("telegramUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_companyId_action_idx" ON "AuditLog"("companyId", "action");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TelegramBusinessConnection_userId_idx" ON "TelegramBusinessConnection"("userId");

-- AddForeignKey
ALTER TABLE "Resume" DROP CONSTRAINT IF EXISTS "Resume_candidateId_companyId_fkey";
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvent" DROP CONSTRAINT IF EXISTS "CandidateEvent_candidateId_companyId_fkey";
ALTER TABLE "CandidateEvent" ADD CONSTRAINT "CandidateEvent_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBusinessConnection" DROP CONSTRAINT IF EXISTS "TelegramBusinessConnection_companyId_fkey";
ALTER TABLE "TelegramBusinessConnection" ADD CONSTRAINT "TelegramBusinessConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBusinessConnection" DROP CONSTRAINT IF EXISTS "TelegramBusinessConnection_userId_fkey";
ALTER TABLE "TelegramBusinessConnection" ADD CONSTRAINT "TelegramBusinessConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramConnectRequest" DROP CONSTRAINT IF EXISTS "TelegramConnectRequest_companyId_fkey";
ALTER TABLE "TelegramConnectRequest" ADD CONSTRAINT "TelegramConnectRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramConnectRequest" DROP CONSTRAINT IF EXISTS "TelegramConnectRequest_userId_fkey";
ALTER TABLE "TelegramConnectRequest" ADD CONSTRAINT "TelegramConnectRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_companyId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_userId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

