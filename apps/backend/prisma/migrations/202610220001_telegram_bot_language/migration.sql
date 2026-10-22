-- Language chosen by a Telegram user for the candidate bot (uz, ru or tg).
CREATE TABLE "TelegramUserLanguage" (
    "telegramUserId" TEXT NOT NULL,
    "language" TEXT,
    "pendingStart" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUserLanguage_pkey" PRIMARY KEY ("telegramUserId")
);
