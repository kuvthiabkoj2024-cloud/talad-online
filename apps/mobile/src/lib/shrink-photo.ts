import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

/** Uploads stay under 2 MB, so a big phone photo just works (no picking again). */
const MAX_BYTES = 1.9 * 1024 * 1024;

/** What the API accepts (it checks the file's bytes, not its name): anything else is converted. */
const ACCEPTED = /^image\/(jpeg|jpg|png|webp)$/i;
const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;

/** The photo's real format: its MIME type, or else its file name or path. iPhone photos are HEIC. */
function accepted(asset: Pick<ImagePickerAsset, 'uri' | 'mimeType' | 'fileName'>): boolean {
  if (asset.mimeType) return ACCEPTED.test(asset.mimeType);
  return ACCEPTED_EXT.test(asset.fileName ?? asset.uri.split('?')[0]!);
}

/**
 * A picked photo ready to upload: JPEG, PNG or WebP under 2 MB. iPhones keep photos as HEIC
 * (and the picker returns the original file), which the API refuses, so those are converted to
 * JPEG; big photos are also made at most `maxSide` pixels across. A 1600 px JPEG at 80% comes
 * to a few hundred KB.
 */
export async function shrinkPhoto(asset: ImagePickerAsset, maxSide = 1600): Promise<Pick<ImagePickerAsset, 'uri' | 'mimeType' | 'fileName'>> {
  if (accepted(asset) && asset.fileSize !== undefined && asset.fileSize <= MAX_BYTES) return asset;
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > maxSide) context.resize(asset.width >= asset.height ? { width: maxSide } : { height: maxSide });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { uri: saved.uri, mimeType: 'image/jpeg', fileName: 'photo.jpg' };
}
