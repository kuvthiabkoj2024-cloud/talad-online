-- AlterTable
ALTER TABLE "AssistantMessage" ADD COLUMN     "chatOrderId" TEXT;

-- AlterTable
ALTER TABLE "ShopMessage" ADD COLUMN     "chatOrderId" TEXT;

-- CreateTable
CREATE TABLE "ChatOrder" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "conversationId" TEXT,
    "createdBy" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "addressId" TEXT,
    "deliveryProviderId" TEXT,
    "paymentMethod" TEXT,
    "slipKey" TEXT,
    "couponCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "orderNumber" TEXT,
    "summary" JSONB,
    "placedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatOrder_customerId_status_idx" ON "ChatOrder"("customerId", "status");

-- CreateIndex
CREATE INDEX "ChatOrder_shopId_status_idx" ON "ChatOrder"("shopId", "status");

-- AddForeignKey
ALTER TABLE "ChatOrder" ADD CONSTRAINT "ChatOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatOrder" ADD CONSTRAINT "ChatOrder_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
