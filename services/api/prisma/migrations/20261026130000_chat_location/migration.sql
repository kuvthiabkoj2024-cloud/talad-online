-- A location shared in a shop chat (e.g. where to deliver).
ALTER TABLE "ShopMessage" ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;
