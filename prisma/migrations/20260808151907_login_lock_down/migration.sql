-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "loginFailedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loginLockedUntil" TIMESTAMP(3);
