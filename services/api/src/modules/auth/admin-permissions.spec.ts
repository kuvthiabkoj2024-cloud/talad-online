import { effectivePermissions } from '@talad/shared';
import { adminCan, type AdminWithRole } from './admin-auth.guard.js';

const admin = (over: Partial<Omit<AdminWithRole, 'role'>> & { role?: Partial<AdminWithRole['role']> } = {}) =>
  ({
    customPermissions: false,
    permissions: [],
    ...over,
    role: { isSuper: false, permissions: ['orders', 'payouts'], ...over.role },
  }) as AdminWithRole;

describe('admin permissions', () => {
  it('uses the role’s permissions by default', () => {
    expect(adminCan(admin(), 'payouts')).toBe(true);
    expect(adminCan(admin(), 'settings')).toBe(false);
  });

  it('uses the admin’s own list when customised (replacing the role’s)', () => {
    const a = admin({ customPermissions: true, permissions: ['settings'] });
    expect(adminCan(a, 'settings')).toBe(true);
    expect(adminCan(a, 'payouts')).toBe(false);
  });

  it('lets a Super Admin do everything', () => {
    expect(adminCan(admin({ role: { isSuper: true, permissions: [] } }), 'audit')).toBe(true);
  });

  it('implies seeing shops when approving them or setting commission', () => {
    expect(effectivePermissions(admin({ role: { permissions: ['shops.review'] } }))).toEqual(['shops', 'shops.review']);
  });

  it('ignores unknown permission names', () => {
    expect(effectivePermissions(admin({ customPermissions: true, permissions: ['orders', 'hack'] }))).toEqual(['orders']);
  });
});
