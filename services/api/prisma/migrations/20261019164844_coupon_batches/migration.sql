-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "batchId" TEXT;

-- CreateIndex
CREATE INDEX "Coupon_batchId_idx" ON "Coupon"("batchId");
