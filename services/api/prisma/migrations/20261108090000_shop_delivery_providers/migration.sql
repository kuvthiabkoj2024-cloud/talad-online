-- Couriers each shop doesn't ship with (empty = all active couriers).
ALTER TABLE "Shop" ADD COLUMN "disabledDeliveryProviderIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
