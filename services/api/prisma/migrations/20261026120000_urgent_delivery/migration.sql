-- Shops can offer their own urgent delivery (zones and prices they set); orders record the choice.
ALTER TABLE "Shop" ADD COLUMN "urgentDelivery" JSONB;
ALTER TABLE "ShopOrder" ADD COLUMN "urgentDelivery" BOOLEAN NOT NULL DEFAULT false;
