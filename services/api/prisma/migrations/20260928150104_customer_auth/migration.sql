-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "appleId" TEXT,
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OneTimeCode" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_googleId_key" ON "Customer"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_appleId_key" ON "Customer"("appleId");
