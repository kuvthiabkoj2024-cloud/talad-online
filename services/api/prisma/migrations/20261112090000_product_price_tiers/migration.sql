-- Bulk pricing: cheaper per unit from a quantity (see PriceTier in @talad/shared).
ALTER TABLE "Product" ADD COLUMN "priceTiers" JSONB;
