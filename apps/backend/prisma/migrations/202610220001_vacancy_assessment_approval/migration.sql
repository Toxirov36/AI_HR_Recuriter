-- HR must approve the AI-generated candidate test before the Telegram bot uses it.
ALTER TABLE "Vacancy" ADD COLUMN "assessmentApprovedAt" TIMESTAMP(3);
