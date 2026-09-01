-- CreateTable
CREATE TABLE "agenda_events" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "reminder" JSONB NOT NULL DEFAULT '{"enabled":false,"label":""}',
    "linkedServiceId" TEXT,
    "responsibilities" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "_deleted" BOOLEAN NOT NULL DEFAULT false,
    "purge_at" TIMESTAMP(3),

    CONSTRAINT "agenda_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agenda_events_orgId_idx" ON "agenda_events"("orgId");

-- CreateIndex
CREATE INDEX "agenda_events_replication_idx" ON "agenda_events"("orgId", "updatedAt", "id");

-- AddForeignKey
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_linkedServiceId_fkey" FOREIGN KEY ("linkedServiceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
