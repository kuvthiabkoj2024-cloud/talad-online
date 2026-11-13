import { Conversation } from '@/components/chat/conversation';

/** One private chat with a shop (the customer's side). */
export default function ConversationScreen() {
  return <Conversation side="customer" />;
}
