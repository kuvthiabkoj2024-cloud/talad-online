-- AlterTable
ALTER TABLE "ShopMessage" ADD COLUMN     "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ShopFaq" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopFaq_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopFaq_shopId_sortOrder_idx" ON "ShopFaq"("shopId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ShopFaq" ADD CONSTRAINT "ShopFaq_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
