-- Customers follow shops (§3.2); the count is kept on the shop for listings.
ALTER TABLE "Shop" ADD COLUMN "followerCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ShopFollow" (
    "customerId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopFollow_pkey" PRIMARY KEY ("customerId","shopId")
);

CREATE INDEX "ShopFollow_shopId_createdAt_idx" ON "ShopFollow"("shopId", "createdAt");

ALTER TABLE "ShopFollow" ADD CONSTRAINT "ShopFollow_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopFollow" ADD CONSTRAINT "ShopFollow_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
