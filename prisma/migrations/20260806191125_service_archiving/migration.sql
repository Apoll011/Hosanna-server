/*
  Warnings:

  - You are about to drop the column `logo` on the `services` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "services" DROP COLUMN "logo";

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "logo" TEXT;
