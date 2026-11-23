-- When the shop first opened the order.
ALTER TABLE "ShopOrder" ADD COLUMN "shopSeenAt" TIMESTAMP(3);
