CREATE TABLE "CompanyFileCleanup" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "companyName" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyFileCleanup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompanyFileCleanup_objectKey_key" ON "CompanyFileCleanup"("objectKey");
CREATE INDEX "CompanyFileCleanup_companyId_idx" ON "CompanyFileCleanup"("companyId");
