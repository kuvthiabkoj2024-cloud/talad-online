-- AlterTable
ALTER TABLE "ShopOrder" ADD COLUMN     "payoutId" TEXT;

-- CreateIndex
CREATE INDEX "ShopOrder_payoutId_idx" ON "ShopOrder"("payoutId");

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
