-- 1. Create tenants table and seed the default tenant FIRST
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

INSERT INTO tenants (id, name, slug, "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'default', now(), now());

-- 2. Add tenantId columns as NULLABLE first
ALTER TABLE "admins" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "folders" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "musician_tokens" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "services" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "songs" ADD COLUMN "tenantId" TEXT;

-- 3. Backfill every existing row to the default tenant
UPDATE "admins" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "folders" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "musician_tokens" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "services" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "songs" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;

-- 4. Guard: check for duplicate song paths BEFORE the unique index attempt.
--    If this returns rows, the migration will fail at step 8 — resolve
--    duplicates manually (rename or delete) before proceeding.
--    SELECT "tenantId", path, count(*) FROM songs GROUP BY "tenantId", path HAVING count(*) > 1;

-- 5. Now enforce NOT NULL
ALTER TABLE "admins" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "folders" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "musician_tokens" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "services" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "songs" ALTER COLUMN "tenantId" SET NOT NULL;

-- 6. Settings: migrate the singleton row BEFORE dropping its old PK/column
ALTER TABLE "settings" ADD COLUMN "tenantId" TEXT;

UPDATE "settings" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE id = 'settings';

-- If no row existed yet (fresh install), create one so every tenant has settings
INSERT INTO "settings" ("tenantId", "serverName", "defaultKey", "syncIntervalSeconds",
  "allowPublicRead", "autoBackupEnabled", "maxUploadMB", "updatedAt")
SELECT '00000000-0000-0000-0000-000000000001', 'ChordPro Studio Server', 'G', 30, false, true, 10, now()
WHERE NOT EXISTS (SELECT 1 FROM "settings");

ALTER TABLE "settings" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";
ALTER TABLE "settings" DROP COLUMN "id";
ALTER TABLE "settings" ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("tenantId");

-- 7. Drop old global-uniqueness indexes
DROP INDEX IF EXISTS "admins_email_key";
DROP INDEX IF EXISTS "songs_title_idx";

-- 8. New indexes and unique constraints (run the duplicate check in step 4 first!)
CREATE INDEX "admins_tenantId_idx" ON "admins"("tenantId");
CREATE INDEX "folders_tenantId_idx" ON "folders"("tenantId");
CREATE INDEX "musician_tokens_tenantId_idx" ON "musician_tokens"("tenantId");
CREATE INDEX "services_tenantId_idx" ON "services"("tenantId");
CREATE INDEX "songs_tenantId_idx" ON "songs"("tenantId");
CREATE INDEX "songs_tenantId_title_idx" ON "songs"("tenantId", "title");
CREATE UNIQUE INDEX "songs_tenantId_path_key" ON "songs"("tenantId", "path");
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- 9. Foreign keys last
ALTER TABLE "admins" ADD CONSTRAINT "admins_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folders" ADD CONSTRAINT "folders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "songs" ADD CONSTRAINT "songs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "services" ADD CONSTRAINT "services_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "musician_tokens" ADD CONSTRAINT "musician_tokens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "settings" ADD CONSTRAINT "settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;