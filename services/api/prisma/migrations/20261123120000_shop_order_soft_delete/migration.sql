-- Super Admin soft delete (test orders): hidden from the admin console, kept in the database.
ALTER TABLE "ShopOrder" ADD COLUMN "deletedAt" TIMESTAMP(3);
