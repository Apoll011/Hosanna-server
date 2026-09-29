-- CreateTable
CREATE TABLE "service_notes" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "elementId" TEXT,
    "body" TEXT NOT NULL,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_notes_orgId_idx" ON "service_notes"("orgId");

-- CreateIndex
CREATE INDEX "service_notes_serviceId_createdAt_idx" ON "service_notes"("serviceId", "createdAt");

-- CreateIndex
CREATE INDEX "service_notes_serviceId_elementId_idx" ON "service_notes"("serviceId", "elementId");

-- CreateIndex
CREATE INDEX "service_notes_authorId_idx" ON "service_notes"("authorId");

-- AddForeignKey
ALTER TABLE "service_notes" ADD CONSTRAINT "service_notes_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_notes" ADD CONSTRAINT "service_notes_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_notes" ADD CONSTRAINT "service_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
