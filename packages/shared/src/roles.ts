/** Top-level actor types (scope §1). */
export const ACTOR_TYPES = ['ADMIN', 'SHOP', 'CUSTOMER'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** Built-in admin roles (scope §2.1); Super Admins can add their own. `AdminRole.key` in the database. */
export const ADMIN_ROLES = ['SUPER_ADMIN', 'SUPPORT', 'FINANCE'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * What an admin may see and do, one per area of the console (§2.1 RBAC). Super Admins have
 * every permission and also manage admins and roles, which no permission grants.
 */
export const ADMIN_PERMISSIONS = [
  'dashboard',
  'reports',
  'shops',
  'shops.review',
  'shops.commission',
  'products',
  'customers',
  'orders',
  'disputes',
  /** Checking customers' transfer slips and refunding cancelled paid orders. */
  'payments',
  'payouts',
  'coupons',
  'catalog',
  'banners',
  'pages',
  'announcements',
  'delivery',
  'settings',
  'audit',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** The permissions grouped as in the console's sidebar, for the permission picker. */
export const ADMIN_PERMISSION_GROUPS: { key: 'overview' | 'marketplace' | 'money' | 'content' | 'system'; permissions: AdminPermission[] }[] = [
  { key: 'overview', permissions: ['dashboard', 'reports'] },
  { key: 'marketplace', permissions: ['shops', 'shops.review', 'shops.commission', 'products', 'customers', 'orders', 'disputes'] },
  { key: 'money', permissions: ['payments', 'payouts', 'coupons'] },
  { key: 'content', permissions: ['catalog', 'banners', 'pages', 'announcements'] },
  { key: 'system', permissions: ['delivery', 'settings', 'audit'] },
];

/** What the built-in roles start with (editable later, except Super Admin). */
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<AdminRole, 'SUPER_ADMIN'>, AdminPermission[]> = {
  SUPPORT: ['dashboard', 'shops', 'shops.review', 'products', 'customers', 'orders', 'disputes'],
  FINANCE: ['dashboard', 'reports', 'shops', 'shops.commission', 'orders', 'payments', 'payouts'],
};

export const isAdminPermission = (p: string): p is AdminPermission => (ADMIN_PERMISSIONS as readonly string[]).includes(p);

/**
 * An admin's permissions: their own list when customised, otherwise their role's. Approving
 * shops or setting commission implies seeing the shop list.
 */
export function effectivePermissions(admin: {
  role: { permissions: readonly string[] };
  customPermissions: boolean;
  permissions: readonly string[];
}): AdminPermission[] {
  const set = new Set((admin.customPermissions ? admin.permissions : admin.role.permissions).filter(isAdminPermission));
  if (set.has('shops.review') || set.has('shops.commission')) set.add('shops');
  return ADMIN_PERMISSIONS.filter((p) => set.has(p));
}
