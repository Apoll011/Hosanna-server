-- Better Auth ≥1.7.3 identifies accounts by (providerId, accountId).
-- Drop the 1.7.0–1.7.2 issuer uniqueness requirement and relax the column.
-- See https://better-auth.com/docs/guides/1-7-upgrade-guide

DROP INDEX IF EXISTS "account_issuer_accountId_uidx";

ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;

CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");
