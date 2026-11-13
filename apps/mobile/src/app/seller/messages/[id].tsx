import { Conversation } from '@/components/chat/conversation';

/** One chat with a customer, answered as the shop. */
export default function SellerConversationScreen() {
  return <Conversation side="shop" />;
}
