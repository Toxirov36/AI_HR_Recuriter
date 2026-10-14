CREATE TYPE "PublicationPlatform" AS ENUM ('TELEGRAM', 'HEADHUNTER');
CREATE TYPE "PublicationStatus" AS ENUM ('PENDING_APPROVAL', 'QUEUED', 'PUBLISHED', 'FAILED', 'UNKNOWN', 'STALE', 'CLOSED');
CREATE TYPE "TelegramApplyStep" AS ENUM ('PRIVACY', 'AI_CONSENT', 'DOCUMENT');

ALTER TABLE "Vacancy" ADD COLUMN "hhAreaId" TEXT;
ALTER TABLE "Vacancy" ADD COLUMN "hhProfessionalRoleId" TEXT;
ALTER TABLE "Vacancy" ADD COLUMN "hhExperienceId" TEXT;
ALTER TABLE "Vacancy" ADD COLUMN "hhEmploymentId" TEXT;
ALTER TABLE "Vacancy" ADD COLUMN "hhScheduleId" TEXT;
ALTER TABLE "Vacancy" ADD COLUMN "hhSearchCount" INTEGER;
ALTER TABLE "Vacancy" ADD COLUMN "hhSearchedAt" TIMESTAMP(3);
ALTER TABLE "Vacancy" ADD COLUMN "hhSearchError" TEXT;
ALTER TABLE "Application" ADD COLUMN "aiConsentGranted" BOOLEAN;

CREATE TABLE "TelegramChannel" (
  "id" SERIAL NOT NULL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "chatId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "username" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramChannel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TelegramChannel_chatId_key" ON "TelegramChannel"("chatId");
CREATE INDEX "TelegramChannel_companyId_idx" ON "TelegramChannel"("companyId");

CREATE TABLE "HeadHunterConnection" (
  "companyId" INTEGER NOT NULL PRIMARY KEY,
  "connectedByUserId" INTEGER NOT NULL,
  "employerId" TEXT NOT NULL,
  "managerId" TEXT NOT NULL,
  "accessTokenEncrypted" TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HeadHunterConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HeadHunterConnection_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "VacancyPublication" (
  "id" SERIAL NOT NULL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "vacancyId" INTEGER NOT NULL,
  "platform" "PublicationPlatform" NOT NULL,
  "destinationKey" TEXT NOT NULL,
  "channelId" INTEGER,
  "status" "PublicationStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approvedRevision" INTEGER,
  "approvedPayload" JSONB,
  "externalId" TEXT,
  "externalUrl" TEXT,
  "error" TEXT,
  "approvedById" INTEGER,
  "approvedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VacancyPublication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VacancyPublication_vacancyId_companyId_fkey" FOREIGN KEY ("vacancyId", "companyId") REFERENCES "Vacancy"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VacancyPublication_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VacancyPublication_vacancyId_platform_destinationKey_key" ON "VacancyPublication"("vacancyId", "platform", "destinationKey");
CREATE INDEX "VacancyPublication_companyId_status_idx" ON "VacancyPublication"("companyId", "status");

CREATE TABLE "TelegramApplySession" (
  "telegramUserId" TEXT NOT NULL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "vacancyId" INTEGER NOT NULL,
  "step" "TelegramApplyStep" NOT NULL,
  "privacyAcceptedAt" TIMESTAMP(3),
  "aiConsentAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramApplySession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TelegramApplySession_vacancyId_companyId_fkey" FOREIGN KEY ("vacancyId", "companyId") REFERENCES "Vacancy"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TelegramApplySession_companyId_expiresAt_idx" ON "TelegramApplySession"("companyId", "expiresAt");
