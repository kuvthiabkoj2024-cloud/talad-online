/** Top-level actor types (scope §1). */
export const ACTOR_TYPES = ['ADMIN', 'SHOP', 'CUSTOMER'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** Admin sub-roles for RBAC (scope §2.1). */
export const ADMIN_ROLES = ['SUPER_ADMIN', 'SUPPORT', 'FINANCE'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
