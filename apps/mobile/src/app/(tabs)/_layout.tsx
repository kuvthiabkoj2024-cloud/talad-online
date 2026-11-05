import { Tabs } from 'expo-router';

import { BottomNav } from '@/components/bottom-nav';

/** Home, Video, Market Chat, Cart and Profile, with the website's bottom bar. */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <BottomNav {...props} />} backBehavior="history" screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="cart" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
