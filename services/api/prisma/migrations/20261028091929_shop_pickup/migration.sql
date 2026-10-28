-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "pickupEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ShopOrder" ADD COLUMN     "pickup" BOOLEAN NOT NULL DEFAULT false;
