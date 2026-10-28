-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "CommissionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "commissionFixed" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "commissionFixed" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "commissionFixed" DECIMAL(14,2),
ADD COLUMN     "commissionRate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "commissionFixed" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "CommissionRequest" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" "CommissionType" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,
    "status" "CommissionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionRequest_status_createdAt_idx" ON "CommissionRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionRequest_productId_createdAt_idx" ON "CommissionRequest"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommissionRequest" ADD CONSTRAINT "CommissionRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRequest" ADD CONSTRAINT "CommissionRequest_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
