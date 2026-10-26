-- A shop can register without an email (unique when given).
ALTER TABLE "Shop" ALTER COLUMN "email" DROP NOT NULL;
