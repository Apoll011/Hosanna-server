-- CreateTable
CREATE TABLE "org_ai_config" (
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKeyCiphertext" TEXT,
    "apiKeyIv" TEXT,
    "apiKeyTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_ai_config_pkey" PRIMARY KEY ("orgId")
);

-- AddForeignKey
ALTER TABLE "org_ai_config" ADD CONSTRAINT "org_ai_config_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
