CREATE TYPE "CandidateSource" AS ENUM ('WEBSITE', 'TELEGRAM', 'MANUAL', 'REFERRAL');
CREATE TYPE "ResumeStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "Candidate"
ADD COLUMN "telegramUserId" TEXT,
ADD COLUMN "telegramUsername" TEXT,
ADD COLUMN "source" "CandidateSource" NOT NULL DEFAULT 'WEBSITE';

CREATE UNIQUE INDEX "Candidate_companyId_telegramUserId_key"
ON "Candidate"("companyId", "telegramUserId");

CREATE TABLE "Resume" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "candidateId" INTEGER NOT NULL,
  "fileName" TEXT NOT NULL,
  "objectKey" TEXT,
  "mimeType" TEXT,
  "fileSize" INTEGER,
  "telegramFileId" TEXT,
  "status" "ResumeStatus" NOT NULL DEFAULT 'PENDING',
  "rawText" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Resume_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Resume_objectKey_key" ON "Resume"("objectKey");
CREATE INDEX "Resume_companyId_status_idx" ON "Resume"("companyId", "status");
CREATE INDEX "Resume_candidateId_createdAt_idx" ON "Resume"("candidateId", "createdAt");

CREATE TABLE "CandidateEvent" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "candidateId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateEvent_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE CASCADE
);
CREATE INDEX "CandidateEvent_candidateId_createdAt_idx" ON "CandidateEvent"("candidateId", "createdAt");

CREATE TABLE "TelegramBusinessConnection" (
  "id" TEXT PRIMARY KEY,
  "companyId" INTEGER,
  "telegramUserId" BIGINT NOT NULL,
  "userChatId" BIGINT NOT NULL,
  "canReply" BOOLEAN NOT NULL DEFAULT false,
  "canReadMessages" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramBusinessConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL
);
CREATE INDEX "TelegramBusinessConnection_companyId_idx" ON "TelegramBusinessConnection"("companyId");
CREATE INDEX "TelegramBusinessConnection_telegramUserId_idx" ON "TelegramBusinessConnection"("telegramUserId");

CREATE TABLE "TelegramWebhookUpdate" (
  "updateId" BIGINT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TelegramWebhookUpdate_createdAt_idx" ON "TelegramWebhookUpdate"("createdAt");
