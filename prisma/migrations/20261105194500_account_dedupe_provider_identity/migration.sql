-- Remove duplicate (providerId, accountId) rows that can appear after partial
-- Better Auth account.create failures. Keep the oldest row per identity key.
DELETE FROM "account" a
USING "account" b
WHERE a."providerId" = b."providerId"
  AND a."accountId" = b."accountId"
  AND a."id" <> b."id"
  AND a."createdAt" > b."createdAt";
