-- Opt-in automatic Telegram channel posting for vacancies that become ACTIVE.
ALTER TABLE "Company" ADD COLUMN "telegramAutoPublish" BOOLEAN NOT NULL DEFAULT false;
