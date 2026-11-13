import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import { API_URL, getApiToken } from '@/lib/api';

/**
 * A private photo from the API (a deposit slip, the courier's bill), full screen. These need the
 * sign-in token, which `expo-image` sends as a header.
 */
export function PrivateImage({ path, onClose }: { path: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const token = getApiToken();
  return (
    <Modal visible={!!path} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {path && (
          <Image
            source={{ uri: `${API_URL}${path}`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
            style={styles.image}
            contentFit="contain"
            cachePolicy="none"
          />
        )}
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12} style={[styles.close, { top: insets.top + Spacing.two }]}>
          <Icon name="x" size={28} color="#ffffff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  image: { width: '100%', height: '80%' },
  close: { position: 'absolute', right: Spacing.three },
});
