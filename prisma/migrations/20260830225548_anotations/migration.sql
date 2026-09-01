-- CreateTable
CREATE TABLE "service_song_annotations" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "canvasData" BYTEA NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_song_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_song_annotations_orgId_idx" ON "service_song_annotations"("orgId");

-- CreateIndex
CREATE INDEX "service_song_annotations_serviceId_idx" ON "service_song_annotations"("serviceId");

-- CreateIndex
CREATE INDEX "service_song_annotations_songId_idx" ON "service_song_annotations"("songId");

-- CreateIndex
CREATE INDEX "service_song_annotations_replication_idx" ON "service_song_annotations"("orgId", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_song_annotations_serviceId_songId_key" ON "service_song_annotations"("serviceId", "songId");

-- AddForeignKey
ALTER TABLE "service_song_annotations" ADD CONSTRAINT "service_song_annotations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_song_annotations" ADD CONSTRAINT "service_song_annotations_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_song_annotations" ADD CONSTRAINT "service_song_annotations_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_song_annotations" ADD CONSTRAINT "service_song_annotations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
