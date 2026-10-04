-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "shopOrderId" TEXT,
ADD COLUMN     "slipKey" TEXT,
ADD COLUMN     "slipUploadedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "paymentAccountName" TEXT,
ADD COLUMN     "paymentAccountNumber" TEXT,
ADD COLUMN     "paymentBankCode" TEXT,
ADD COLUMN     "paymentQrKey" TEXT;

-- CreateIndex
CREATE INDEX "Payment_shopOrderId_idx" ON "Payment"("shopOrderId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_shopOrderId_fkey" FOREIGN KEY ("shopOrderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
