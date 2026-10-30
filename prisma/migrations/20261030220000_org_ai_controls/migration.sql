-- AlterTable
ALTER TABLE "org_ai_config"
  ADD COLUMN IF NOT EXISTS "maxToolCalls" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS "temperature" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "maxOutputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "instructions" TEXT,
  ADD COLUMN IF NOT EXISTS "memoryEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE IF NOT EXISTS "org_ai_memory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'admin',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_ai_memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "org_ai_memory_orgId_createdAt_idx" ON "org_ai_memory"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "org_ai_memory" ADD CONSTRAINT "org_ai_memory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
