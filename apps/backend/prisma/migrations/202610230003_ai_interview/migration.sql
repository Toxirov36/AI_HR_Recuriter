-- Optional AI chat interview in the candidate bot, after the test and the written questions.
ALTER TYPE "TelegramJoinStep" ADD VALUE IF NOT EXISTS 'INTERVIEW';
ALTER TYPE "TelegramApplyStep" ADD VALUE IF NOT EXISTS 'INTERVIEW';
ALTER TABLE "Vacancy" ADD COLUMN "aiInterviewEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "interviewFocus" TEXT;
ALTER TABLE "Application" ADD COLUMN "aiInterview" JSONB;
ALTER TABLE "TelegramJoinSession" ADD COLUMN "interviewEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "interviewFocus" TEXT, ADD COLUMN "interviewTurns" JSONB, ADD COLUMN "interviewTurn" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "interviewResult" JSONB;
ALTER TABLE "TelegramApplySession" ADD COLUMN "interviewEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "interviewFocus" TEXT, ADD COLUMN "interviewTurns" JSONB, ADD COLUMN "interviewTurn" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "interviewResult" JSONB;
