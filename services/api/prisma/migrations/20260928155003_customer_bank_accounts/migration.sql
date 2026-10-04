-- CreateTable
CREATE TABLE "CustomerBankAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "qrImageKey" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerBankAccount_customerId_idx" ON "CustomerBankAccount"("customerId");

-- AddForeignKey
ALTER TABLE "CustomerBankAccount" ADD CONSTRAINT "CustomerBankAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
