ALTER TABLE "TelegramApplySession" ADD COLUMN "assessmentQuestions" JSONB;
ALTER TABLE "TelegramApplySession" ADD COLUMN "assessmentRevision" INTEGER;

CREATE TABLE "TelegramScreeningAlert" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "chatId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    CONSTRAINT "TelegramScreeningAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramScreeningAlert_applicationId_chatId_key" ON "TelegramScreeningAlert"("applicationId", "chatId");
CREATE INDEX "TelegramScreeningAlert_status_nextAttemptAt_idx" ON "TelegramScreeningAlert"("status", "nextAttemptAt");
CREATE INDEX "TelegramScreeningAlert_companyId_status_idx" ON "TelegramScreeningAlert"("companyId", "status");
ALTER TABLE "TelegramScreeningAlert" ADD CONSTRAINT "TelegramScreeningAlert_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
