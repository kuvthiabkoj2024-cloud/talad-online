-- AlterTable
ALTER TABLE "ShopConversation" ADD COLUMN     "customerReadAt" TIMESTAMP(3),
ADD COLUMN     "shopReadAt" TIMESTAMP(3);

-- Chats with nothing unread on a side count as read up to their last message.
UPDATE "ShopConversation" SET "customerReadAt" = "lastMessageAt" WHERE "customerUnread" = 0;
UPDATE "ShopConversation" SET "shopReadAt" = "lastMessageAt" WHERE "shopUnread" = 0;
