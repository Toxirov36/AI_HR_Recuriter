CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN');
ALTER TABLE "Company" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "platformRole" "PlatformRole";
CREATE TABLE "PlatformAuditLog" (
  "id" SERIAL NOT NULL,
  "actorId" INTEGER NOT NULL,
  "actorName" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "companyName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "previousActive" BOOLEAN,
  "newActive" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformAuditLog_createdAt_id_idx" ON "PlatformAuditLog"("createdAt", "id");
CREATE INDEX "PlatformAuditLog_companyId_createdAt_idx" ON "PlatformAuditLog"("companyId", "createdAt");
