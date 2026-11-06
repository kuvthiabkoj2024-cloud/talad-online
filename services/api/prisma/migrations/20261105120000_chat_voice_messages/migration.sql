-- Voice messages in customer ↔ shop chats: the recording (private storage key) and its length.
ALTER TABLE "ShopMessage" ADD COLUMN "audioKey" TEXT,
ADD COLUMN "audioMs" INTEGER;
