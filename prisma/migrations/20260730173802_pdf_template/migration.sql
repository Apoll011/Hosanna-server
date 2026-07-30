-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "folderTemplateConfig" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "folderTemplateId" TEXT NOT NULL DEFAULT 'folder-default',
ADD COLUMN     "serviceTemplateConfig" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "serviceTemplateId" TEXT NOT NULL DEFAULT 'service-default',
ADD COLUMN     "songTemplateConfig" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "songTemplateId" TEXT NOT NULL DEFAULT 'song-default';
