-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "embeddedAt" TIMESTAMP(3),
ADD COLUMN     "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
ADD COLUMN     "embeddingModel" TEXT;

-- CreateIndex
CREATE INDEX "ProductImage_embeddingModel_idx" ON "ProductImage"("embeddingModel");
