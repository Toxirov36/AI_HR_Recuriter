-- Vacancy pay (range or single bound, UZS/USD) or "negotiable".
ALTER TABLE "Vacancy" ADD COLUMN "salaryFrom" INTEGER, ADD COLUMN "salaryTo" INTEGER, ADD COLUMN "salaryCurrency" TEXT, ADD COLUMN "salaryNegotiable" BOOLEAN NOT NULL DEFAULT false;
