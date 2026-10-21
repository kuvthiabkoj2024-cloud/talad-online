-- Admin roles become editable records (§2.1 RBAC): a named set of permissions per role,
-- optionally overridden per admin. The built-in roles keep their ids' meaning via `key`.

-- The enum type shares the new table's name: move it aside first.
ALTER TYPE "AdminRole" RENAME TO "AdminRole_old";

CREATE TABLE "AdminRole" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSuper" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminRole_key_key" ON "AdminRole"("key");
CREATE UNIQUE INDEX "AdminRole_name_key" ON "AdminRole"("name");

-- The built-in roles, with what they could open before.
INSERT INTO "AdminRole" ("id", "key", "name", "description", "permissions", "isSuper", "updatedAt") VALUES
  ('01a00000-0000-7000-8000-000000000001', 'SUPER_ADMIN', 'Super Admin', 'Everything, including admins and roles.', ARRAY[]::TEXT[], true, CURRENT_TIMESTAMP),
  ('01a00000-0000-7000-8000-000000000002', 'SUPPORT', 'Support', 'Shops, products, customers, orders and disputes.',
    ARRAY['dashboard','shops','shops.review','products','customers','orders','disputes'], false, CURRENT_TIMESTAMP),
  ('01a00000-0000-7000-8000-000000000003', 'FINANCE', 'Finance', 'Payouts, reports, orders and shop commission.',
    ARRAY['dashboard','reports','shops','shops.commission','orders','payouts'], false, CURRENT_TIMESTAMP);

ALTER TABLE "AdminUser"
  ADD COLUMN "roleId" TEXT,
  ADD COLUMN "customPermissions" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "AdminUser" u SET "roleId" = r."id" FROM "AdminRole" r WHERE r."key" = u."role"::TEXT;

ALTER TABLE "AdminUser" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "AdminUser" DROP COLUMN "role";
DROP TYPE "AdminRole_old";

CREATE INDEX "AdminUser_roleId_idx" ON "AdminUser"("roleId");
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
