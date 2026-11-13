import { ConversationList } from '@/components/chat/conversation-list';

/** Private chats with shops (the customer's side). */
export default function MessagesScreen() {
  return <ConversationList side="customer" />;
}
