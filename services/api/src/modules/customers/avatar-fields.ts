import { filePrefix, storageFolder } from '../media/storage-keys.js';

/** Where a customer's uploaded photos are stored (the same as auth's avatarPrefix). */
const avatarPrefix = (customerId: string) => filePrefix(storageFolder.customerProfile(customerId), 'avatar');

/** A social-login picture (e.g. Google) as a link; an uploaded photo isn't a link (see avatarFields). */
export const publicAvatar = (c: { id: string; avatarUrl: string | null }) => (c.avatarUrl && !c.avatarUrl.startsWith(avatarPrefix(c.id)) ? c.avatarUrl : null);

/**
 * A person's photo for public pages (video profile, feed, comments, followers), the same way as
 * their own profile: `avatarUrl` for a social-login picture, or `avatarVersion` for an uploaded
 * photo, which is public at GET /avatars/:id?v=<version> (clients build that link). Both null:
 * initials.
 */
export const avatarFields = (c: { id: string; avatarUrl: string | null }) => {
  const uploaded = !!c.avatarUrl?.startsWith(avatarPrefix(c.id));
  return {
    avatarUrl: uploaded ? null : c.avatarUrl,
    // The object name is a fresh UUID per upload, so it doubles as the cache-busting version.
    avatarVersion: uploaded ? c.avatarUrl!.slice(avatarPrefix(c.id).length).split('.')[0]! : null,
  };
};
