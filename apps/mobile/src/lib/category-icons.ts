import type { IconName } from '@/components/icon';

/** Icons by top-level category slug, as on the website, until admins upload category icons (§2.6). */
const ICONS: Record<string, IconName> = {
  food: 'food',
  fashion: 'fashion',
  electronics: 'electronics',
  home: 'furniture',
  beauty: 'beauty',
  baby: 'baby',
  pets: 'pets',
  sports: 'sports',
};

export const categoryIcon = (slug: string): IconName => ICONS[slug] ?? 'tag';
