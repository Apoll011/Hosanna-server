-- CreateTable
CREATE TABLE "agenda_reminder_dispatches" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "daysUntil" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_reminder_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agenda_reminder_dispatches_sentAt_idx" ON "agenda_reminder_dispatches"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "agenda_reminder_dispatches_eventId_userId_daysUntil_key" ON "agenda_reminder_dispatches"("eventId", "userId", "daysUntil");

-- CreateIndex
CREATE INDEX "agenda_events_org_deleted_date_idx" ON "agenda_events"("orgId", "_deleted", "date");

-- CreateIndex
CREATE INDEX "session_user_notify_idx" ON "session"("userId", "notify");

-- AddForeignKey
ALTER TABLE "agenda_reminder_dispatches" ADD CONSTRAINT "agenda_reminder_dispatches_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "agenda_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_reminder_dispatches" ADD CONSTRAINT "agenda_reminder_dispatches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
