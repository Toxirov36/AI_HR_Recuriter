-- HR-written open questions answered in writing by candidates after the test.
ALTER TYPE "TelegramJoinStep" ADD VALUE IF NOT EXISTS 'WRITTEN';
ALTER TYPE "TelegramApplyStep" ADD VALUE IF NOT EXISTS 'WRITTEN';
ALTER TABLE "Vacancy" ADD COLUMN "customQuestions" JSONB;
ALTER TABLE "Application" ADD COLUMN "writtenAnswers" JSONB;
ALTER TABLE "TelegramJoinSession" ADD COLUMN "customQuestions" JSONB, ADD COLUMN "writtenAnswers" JSONB, ADD COLUMN "writtenIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TelegramApplySession" ADD COLUMN "customQuestions" JSONB, ADD COLUMN "writtenAnswers" JSONB, ADD COLUMN "writtenIndex" INTEGER NOT NULL DEFAULT 0;
