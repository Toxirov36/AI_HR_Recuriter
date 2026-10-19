CREATE TYPE "ChannelDiscoveryStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "TelegramChannelDiscovery" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "vacancyId" INTEGER NOT NULL,
  "vacancyRevision" INTEGER NOT NULL,
  "status" "ChannelDiscoveryStatus" NOT NULL DEFAULT 'QUEUED',
  "results" JSONB,
  "error" TEXT,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramChannelDiscovery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramChannelDiscovery_companyId_vacancyId_createdAt_idx" ON "TelegramChannelDiscovery"("companyId", "vacancyId", "createdAt");
CREATE INDEX "TelegramChannelDiscovery_status_updatedAt_idx" ON "TelegramChannelDiscovery"("status", "updatedAt");
ALTER TABLE "TelegramChannelDiscovery" ADD CONSTRAINT "TelegramChannelDiscovery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelDiscovery" ADD CONSTRAINT "TelegramChannelDiscovery_vacancyId_companyId_fkey" FOREIGN KEY ("vacancyId", "companyId") REFERENCES "Vacancy"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
