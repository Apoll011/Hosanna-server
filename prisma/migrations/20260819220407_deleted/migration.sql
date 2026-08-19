-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "_deleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "_deleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "songs" ADD COLUMN     "_deleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "folders_replication_idx" ON "folders"("orgId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "services_replication_idx" ON "services"("orgId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "songs_replication_idx" ON "songs"("orgId", "updatedAt", "id");
