import { ConversationList } from '@/components/chat/conversation-list';

/** The shop's chats with its customers (Seller Center → Messages). */
export default function SellerMessagesScreen() {
  return <ConversationList side="shop" />;
}
