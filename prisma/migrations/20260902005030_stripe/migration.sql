/*
  Warnings:

  - A unique constraint covering the columns `[issuer,accountId]` on the table `account` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[membershipKey]` on the table `teamMember` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `issuer` to the `account` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- add as nullable
ALTER TABLE "account" ADD COLUMN "issuer" TEXT;

-- backfill existing rows
-- for OAuth rows, providerId is a reasonable stand-in unless you track real issuer URLs
UPDATE "account" SET "issuer" = COALESCE("providerId", 'local:credential') WHERE "issuer" IS NULL;

-- now enforce not null
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "team" ADD COLUMN     "memberCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "teamMember" ADD COLUMN     "membershipKey" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "stripeCustomerId" TEXT;

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'incomplete',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN DEFAULT false,
    "cancelAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "seats" INTEGER,
    "billingInterval" TEXT,
    "stripeScheduleId" TEXT,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account"("issuer", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "teamMember_membershipKey_key" ON "teamMember"("membershipKey");
