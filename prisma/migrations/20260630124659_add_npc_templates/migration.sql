-- AlterTable
ALTER TABLE "Token" ADD COLUMN     "npcTemplateId" TEXT;

-- CreateTable
CREATE TABLE "NpcTemplate" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "sightFt" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "statBlock" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpcTemplate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "NpcTemplate" ADD CONSTRAINT "NpcTemplate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_npcTemplateId_fkey" FOREIGN KEY ("npcTemplateId") REFERENCES "NpcTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
