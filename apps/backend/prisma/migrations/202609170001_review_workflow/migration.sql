ALTER TABLE "Application" ADD COLUMN "interviewReview" JSONB,
ADD COLUMN "reviewRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ApplicationStageChange" (
  "id" SERIAL NOT NULL,
  "applicationId" INTEGER NOT NULL,
  "fromStatus" "ApplicationStatus",
  "toStatus" "ApplicationStatus" NOT NULL,
  "actorId" INTEGER NOT NULL,
  "actorName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationStageChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApplicationStageChange_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ApplicationStageChange_applicationId_createdAt_idx" ON "ApplicationStageChange"("applicationId", "createdAt");
