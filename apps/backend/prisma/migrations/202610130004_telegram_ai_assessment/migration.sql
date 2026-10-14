-- AlterEnum
ALTER TYPE "TelegramApplyStep" ADD VALUE 'ASSESSMENT';
ALTER TYPE "TelegramApplyStep" ADD VALUE 'CONTACT_PHONE';

-- AlterTable
ALTER TABLE "Vacancy" ADD COLUMN "assessmentQuestions" JSONB;
ALTER TABLE "Vacancy" ADD COLUMN "assessmentRevision" INTEGER;

-- AlterTable
ALTER TABLE "TelegramApplySession" ADD COLUMN "currentQuestionIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TelegramApplySession" ADD COLUMN "answers" JSONB;
ALTER TABLE "TelegramApplySession" ADD COLUMN "phone" TEXT;

-- AlterTable
ALTER TABLE "Application" ADD COLUMN "assessmentScore" INTEGER;
ALTER TABLE "Application" ADD COLUMN "assessmentResult" JSONB;
