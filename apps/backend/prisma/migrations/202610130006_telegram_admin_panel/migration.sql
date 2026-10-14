ALTER TABLE "Vacancy" ADD COLUMN "assessmentEditVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TelegramBusinessConnection" ADD COLUMN "screeningAlertsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "TelegramAdminPairing" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAdminPairing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramAdminPairing_tokenHash_key" ON "TelegramAdminPairing"("tokenHash");
CREATE INDEX "TelegramAdminPairing_companyId_userId_expiresAt_idx" ON "TelegramAdminPairing"("companyId", "userId", "expiresAt");
ALTER TABLE "TelegramAdminPairing" ADD CONSTRAINT "TelegramAdminPairing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdminPairing" ADD CONSTRAINT "TelegramAdminPairing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TelegramAdminLink" (
  "userId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "telegramUsername" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAdminLink_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX "TelegramAdminLink_telegramUserId_key" ON "TelegramAdminLink"("telegramUserId");
CREATE INDEX "TelegramAdminLink_companyId_idx" ON "TelegramAdminLink"("companyId");
ALTER TABLE "TelegramAdminLink" ADD CONSTRAINT "TelegramAdminLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdminLink" ADD CONSTRAINT "TelegramAdminLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
