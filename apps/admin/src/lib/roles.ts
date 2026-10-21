import type { Dict } from '@/i18n/en'
import type { AdminRoleInfo } from './types'

/** Built-in roles are shown in the console's language; roles admins made, by their name. */
export function roleName(role: Pick<AdminRoleInfo, 'key' | 'name'>, t: Dict): string {
  return role.key && role.key in t.roles ? t.roles[role.key as keyof Dict['roles']] : role.name
}
