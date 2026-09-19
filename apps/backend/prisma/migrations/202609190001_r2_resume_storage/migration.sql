ALTER TABLE "Candidate"
ADD COLUMN "resumeObjectKey" TEXT,
ADD COLUMN "resumeSize" INTEGER;

CREATE UNIQUE INDEX "Candidate_resumeObjectKey_key" ON "Candidate"("resumeObjectKey");
