-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'default',
    "icon" TEXT NOT NULL DEFAULT 'default',
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "_deleted" BOOLEAN NOT NULL DEFAULT false,
    "purge_at" TIMESTAMP(3),

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CollectionToSong" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CollectionToSong_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "collections_orgId_idx" ON "collections"("orgId");

-- CreateIndex
CREATE INDEX "collections_replication_idx" ON "collections"("orgId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "_CollectionToSong_B_index" ON "_CollectionToSong"("B");

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CollectionToSong" ADD CONSTRAINT "_CollectionToSong_A_fkey" FOREIGN KEY ("A") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CollectionToSong" ADD CONSTRAINT "_CollectionToSong_B_fkey" FOREIGN KEY ("B") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
