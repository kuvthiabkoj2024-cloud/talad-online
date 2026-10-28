-- CreateEnum
CREATE TYPE "SlipStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundRef" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PaymentSlip" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "SlipStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSlip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentSlip_orderId_status_idx" ON "PaymentSlip"("orderId", "status");

-- CreateIndex
CREATE INDEX "PaymentSlip_status_createdAt_idx" ON "PaymentSlip"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Orders still waiting with a slip the shop never checked: Taladonline checks them now.
INSERT INTO "PaymentSlip" ("id", "orderId", "key", "status", "createdAt")
SELECT DISTINCT ON (p."slipKey") gen_random_uuid()::text, p."orderId", p."slipKey", 'PENDING', COALESCE(p."slipUploadedAt", p."createdAt")
FROM "Payment" p
JOIN "ShopOrder" so ON so.id = p."shopOrderId"
WHERE p."slipKey" IS NOT NULL AND p.status = 'PENDING' AND so.status = 'PENDING';

-- Finance staff check payments and make refunds.
UPDATE "AdminRole" SET "permissions" = array_append("permissions", 'payments')
WHERE "key" = 'FINANCE' AND NOT ('payments' = ANY("permissions"));

-- Orders already sent: they complete on their own 7 days after shipping (customers can confirm sooner).
UPDATE "ShopOrder" so SET "autoConfirmAt" = h."at" + interval '7 days'
FROM (SELECT "shopOrderId", max("createdAt") AS "at" FROM "OrderStatusHistory" WHERE "toStatus" = 'SHIPPED' GROUP BY "shopOrderId") h
WHERE h."shopOrderId" = so.id AND so.status = 'SHIPPED' AND so."autoConfirmAt" IS NULL;
