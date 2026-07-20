-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "ddbCharacterId" TEXT,
ADD COLUMN     "ddbImportedAt" TIMESTAMP(3),
ADD COLUMN     "ddbSheet" JSONB,
ADD COLUMN     "ddbUrl" TEXT;
