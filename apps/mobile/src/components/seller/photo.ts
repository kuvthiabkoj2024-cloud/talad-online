import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { shrinkPhoto } from '@/lib/shrink-photo';

export type PickedFile = { uri: string; mimeType?: string | null; fileName?: string | null };

/**
 * A photo from the camera or the gallery (the courier's bill, proof for MC Mart), made smaller
 * when big. Null when cancelled or not allowed (`deniedText` explains how to allow it).
 */
export async function pickPhoto(from: 'camera' | 'gallery', deniedText: string): Promise<PickedFile | null> {
  const permission = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(deniedText);
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
  const res = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets[0]) return null;
  return shrinkPhoto(res.assets[0]);
}
