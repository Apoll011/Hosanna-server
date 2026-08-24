-- AlterTable: add purge_at to folders
ALTER TABLE "folders" ADD COLUMN "purge_at" TIMESTAMP(3);

-- AlterTable: add purge_at to songs
ALTER TABLE "songs" ADD COLUMN "purge_at" TIMESTAMP(3);

-- AlterTable: add purge_at to services
ALTER TABLE "services" ADD COLUMN "purge_at" TIMESTAMP(3);
