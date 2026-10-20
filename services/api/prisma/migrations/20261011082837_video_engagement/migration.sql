-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "videoCommentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "videoShareCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "videoViewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "VideoComment" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VideoComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoComment_productId_parentId_createdAt_idx" ON "VideoComment"("productId", "parentId", "createdAt");

-- CreateIndex
CREATE INDEX "VideoComment_parentId_createdAt_idx" ON "VideoComment"("parentId", "createdAt");

-- AddForeignKey
ALTER TABLE "VideoComment" ADD CONSTRAINT "VideoComment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoComment" ADD CONSTRAINT "VideoComment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoComment" ADD CONSTRAINT "VideoComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "VideoComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
