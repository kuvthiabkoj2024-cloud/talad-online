-- CreateEnum
CREATE TYPE "CodTransferStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundSlipKey" TEXT;

-- CreateTable
CREATE TABLE "CodTransfer" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "slipKey" TEXT NOT NULL,
    "note" TEXT,
    "status" "CodTransferStatus" NOT NULL DEFAULT 'SUBMITTED',
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodTransfer_shopId_month_idx" ON "CodTransfer"("shopId", "month");

-- CreateIndex
CREATE INDEX "CodTransfer_status_createdAt_idx" ON "CodTransfer"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CodTransfer" ADD CONSTRAINT "CodTransfer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

