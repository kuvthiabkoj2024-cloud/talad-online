-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "commissionAmount" DECIMAL(14,2),
ADD COLUMN     "commissionRate" DECIMAL(5,2),
ADD COLUMN     "regularPrice" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "ShopOrder" ADD COLUMN     "platformDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Orders placed with a platform coupon: that discount is Taladonline's to fund.
UPDATE "ShopOrder" so SET "platformDiscount" = so."discountTotal"
FROM "CouponRedemption" cr JOIN "Coupon" c ON c.id = cr."couponId"
WHERE cr."orderId" = so."orderId" AND c."shopId" IS NULL AND so."discountTotal" > 0;
