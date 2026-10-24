-- Remember which HR Business connection each candidate wrote to, so notifications try that connection first
-- instead of every connection of the company in turn.
CREATE TABLE "TelegramBusinessChat" (
    "companyId" INTEGER NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramBusinessChat_pkey" PRIMARY KEY ("companyId", "telegramUserId")
);
CREATE INDEX "TelegramBusinessChat_connectionId_idx" ON "TelegramBusinessChat"("connectionId");
ALTER TABLE "TelegramBusinessChat" ADD CONSTRAINT "TelegramBusinessChat_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "TelegramBusinessConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
