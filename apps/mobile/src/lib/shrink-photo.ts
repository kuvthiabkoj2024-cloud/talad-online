import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

/** Profile photos go up under 2 MB, so a big phone photo just works (no picking again). */
const MAX_BYTES = 1.9 * 1024 * 1024;

/**
 * A picked photo, made smaller when it's over 2 MB (or its size is unknown): at most `maxSide`
 * pixels across, saved as JPEG at 80% — a 1600 px photo then comes to a few hundred KB.
 */
export async function shrinkPhoto(asset: ImagePickerAsset, maxSide = 1600): Promise<Pick<ImagePickerAsset, 'uri' | 'mimeType' | 'fileName'>> {
  if (asset.fileSize !== undefined && asset.fileSize <= MAX_BYTES) return asset;
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > maxSide) context.resize(asset.width >= asset.height ? { width: maxSide } : { height: maxSide });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { uri: saved.uri, mimeType: 'image/jpeg', fileName: 'photo.jpg' };
}
