-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "color" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "icon" TEXT NOT NULL DEFAULT 'default';
