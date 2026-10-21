-- Candidate bot intake (t.me/<bot>?start=join_<companyToken>): hiring fields managed by HR,
-- a public company token for the bot link and a separate session table. Additive only.

CREATE TYPE "TelegramJoinStep" AS ENUM ('PRIVACY', 'FIELD', 'VACANCY', 'NAME', 'PHONE', 'DOCUMENT', 'ASSESSMENT');

-- Existing companies get a random token; new rows get one from the application (uuid()).
ALTER TABLE "Company" ADD COLUMN "publicToken" TEXT;
UPDATE "Company" SET "publicToken" = gen_random_uuid()::text WHERE "publicToken" IS NULL;
ALTER TABLE "Company" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "Company_publicToken_key" ON "Company"("publicToken");

CREATE TABLE "VacancyField" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VacancyField_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VacancyField_id_companyId_key" ON "VacancyField"("id", "companyId");
CREATE UNIQUE INDEX "VacancyField_companyId_name_key" ON "VacancyField"("companyId", "name");
ALTER TABLE "VacancyField" ADD CONSTRAINT "VacancyField_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Vacancy" ADD COLUMN "fieldId" INTEGER;
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_fieldId_companyId_fkey"
  FOREIGN KEY ("fieldId", "companyId") REFERENCES "VacancyField"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TelegramJoinSession" (
    "telegramUserId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "step" "TelegramJoinStep" NOT NULL,
    "fieldId" INTEGER,
    "vacancyId" INTEGER,
    "fullName" TEXT,
    "phone" TEXT,
    "privacyAcceptedAt" TIMESTAMP(3),
    "aiConsentAt" TIMESTAMP(3),
    "applicationId" INTEGER,
    "currentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "answers" JSONB,
    "assessmentQuestions" JSONB,
    "assessmentRevision" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramJoinSession_pkey" PRIMARY KEY ("telegramUserId")
);
CREATE INDEX "TelegramJoinSession_companyId_expiresAt_idx" ON "TelegramJoinSession"("companyId", "expiresAt");
ALTER TABLE "TelegramJoinSession" ADD CONSTRAINT "TelegramJoinSession_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
