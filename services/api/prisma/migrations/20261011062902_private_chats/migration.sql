-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "imageThumb" TEXT,
    "products" JSONB,
    "lang" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopConversation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerUnread" INTEGER NOT NULL DEFAULT 0,
    "shopUnread" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "imageKey" TEXT,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantMessage_customerId_createdAt_idx" ON "AssistantMessage"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ShopConversation_customerId_lastMessageAt_idx" ON "ShopConversation"("customerId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ShopConversation_shopId_lastMessageAt_idx" ON "ShopConversation"("shopId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopConversation_shopId_customerId_key" ON "ShopConversation"("shopId", "customerId");

-- CreateIndex
CREATE INDEX "ShopMessage_conversationId_createdAt_idx" ON "ShopMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopConversation" ADD CONSTRAINT "ShopConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopMessage" ADD CONSTRAINT "ShopMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ShopConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
