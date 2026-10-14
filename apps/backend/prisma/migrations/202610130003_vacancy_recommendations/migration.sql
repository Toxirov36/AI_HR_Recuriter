-- CreateTable
CREATE TABLE "VacancyRecommendation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "vacancyId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "mandatoryScore" INTEGER NOT NULL,
    "optionalScore" INTEGER NOT NULL,
    "analysis" JSONB NOT NULL,
    "vacancyRevision" INTEGER NOT NULL,
    "resumeRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VacancyRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VacancyRecommendation_vacancyId_candidateId_key" ON "VacancyRecommendation"("vacancyId", "candidateId");

-- CreateIndex
CREATE INDEX "VacancyRecommendation_companyId_vacancyId_matchScore_idx" ON "VacancyRecommendation"("companyId", "vacancyId", "matchScore");

-- CreateIndex
CREATE INDEX "VacancyRecommendation_candidateId_idx" ON "VacancyRecommendation"("candidateId");

-- AddForeignKey
ALTER TABLE "VacancyRecommendation" ADD CONSTRAINT "VacancyRecommendation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyRecommendation" ADD CONSTRAINT "VacancyRecommendation_vacancyId_companyId_fkey" FOREIGN KEY ("vacancyId", "companyId") REFERENCES "Vacancy"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyRecommendation" ADD CONSTRAINT "VacancyRecommendation_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
