ALTER TABLE "Vacancy" ADD COLUMN "publicToken" TEXT;
UPDATE "Vacancy" SET "publicToken" = gen_random_uuid()::text;
ALTER TABLE "Vacancy" ALTER COLUMN "publicToken" SET NOT NULL;
CREATE UNIQUE INDEX "Vacancy_publicToken_key" ON "Vacancy"("publicToken");

ALTER TABLE "Candidate" ADD COLUMN "publicSubmittedAt" TIMESTAMP(3);
ALTER TABLE "Candidate" ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Candidate" ADD COLUMN "aiConsentAt" TIMESTAMP(3);
ALTER TABLE "Candidate" ADD COLUMN "mergedIntoId" INTEGER;
CREATE INDEX "Candidate_companyId_mergedIntoId_idx" ON "Candidate"("companyId", "mergedIntoId");
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
