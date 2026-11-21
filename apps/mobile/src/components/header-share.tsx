import { Pressable, Share } from 'react-native';

import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/lib/i18n';

/**
 * A share button for the screen header. The link opens the same page on the website, whose
 * preview (title, description, picture) WhatsApp, Messenger and Facebook show in the chat.
 */
export function HeaderShare({ text, url }: { text: string; url: string }) {
  const theme = useTheme();
  const { t } = useI18n();
  // iOS shows `url` as the link card; Android only sends `message`, so the link goes there too.
  const share = () => void Share.share({ message: `${text}\n${url}`, url }).catch(() => undefined);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t.feed.share} onPress={share} hitSlop={10}>
      <Icon name="share" size={20} color={theme.text} />
    </Pressable>
  );
}
