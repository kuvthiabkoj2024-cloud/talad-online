-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "adminId" TEXT;

-- CreateIndex
CREATE INDEX "Notification_adminId_readAt_idx" ON "Notification"("adminId", "readAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
