-- AlterTable
ALTER TABLE "Shop" DROP COLUMN "passwordHash",
DROP COLUMN "totpSecret",
DROP COLUMN "twoFactorMethod",
ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Shop_ownerId_key" ON "Shop"("ownerId");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
