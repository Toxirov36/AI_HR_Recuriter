-- Interview scheduling: HR proposes time slots (online via Google Meet or offline), the candidate picks one.
CREATE TYPE "InterviewMode" AS ENUM ('ONLINE', 'OFFLINE');
CREATE TYPE "InterviewStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "Interview" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "organizerId" INTEGER NOT NULL,
    "mode" "InterviewMode" NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'PROPOSED',
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tashkent',
    "location" TEXT,
    "note" TEXT,
    "tokenHash" TEXT NOT NULL,
    "confirmedSlotId" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "meetUrl" TEXT,
    "googleEventId" TEXT,
    "declinedAt" TIMESTAMP(3),
    "declineNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Interview_tokenHash_key" ON "Interview"("tokenHash");
CREATE INDEX "Interview_companyId_status_idx" ON "Interview"("companyId", "status");
CREATE INDEX "Interview_applicationId_idx" ON "Interview"("applicationId");
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InterviewSlot" (
    "id" SERIAL NOT NULL,
    "interviewId" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSlot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InterviewSlot_interviewId_idx" ON "InterviewSlot"("interviewId");
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GoogleCalendarConnection" (
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "GoogleCalendarConnection_companyId_idx" ON "GoogleCalendarConnection"("companyId");
ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
