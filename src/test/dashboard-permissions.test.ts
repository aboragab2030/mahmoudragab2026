import { describe, it, expect } from 'vitest';
import { canAccessSection, firstAccessibleSection, DASHBOARD_PERMISSIONS, SECTION_PERMISSIONS } from '@/barada/permissions';

const staff = (permissions: string[]) => ({ role: 'staff' as const, permissions });

describe('dashboard section permissions', () => {
  it('manager opens every section, including users and electronic payment settings', () => {
    const admin = { role: 'admin' as const, permissions: [] };
    expect(canAccessSection(admin, 'users')).toBe(true);
    expect(canAccessSection(admin, 'paymob-settings')).toBe(true);
    expect(canAccessSection(admin, 'backup')).toBe(true);
  });

  it('staff without the doctors permission cannot open the doctors section', () => {
    expect(canAccessSection(staff(['manage_bookings']), 'doctors')).toBe(false);
    expect(canAccessSection(staff(['manage_doctors']), 'doctors')).toBe(true);
  });

  it('services, photos and complaints are controlled separately', () => {
    const s = staff(['manage_content']);
    expect(canAccessSection(s, 'services')).toBe(true);
    expect(canAccessSection(s, 'hero-images')).toBe(false);
    expect(canAccessSection(s, 'complaints')).toBe(false);
  });

  it('payments opens with either payments or InstaPay review permission', () => {
    expect(canAccessSection(staff(['manage_payments']), 'payments')).toBe(true);
    expect(canAccessSection(staff(['review_instapay']), 'payments')).toBe(true);
    expect(canAccessSection(staff(['manage_bookings']), 'payments')).toBe(false);
  });

  it('staff can never open users or electronic payment settings, even with every permission', () => {
    const all = staff(DASHBOARD_PERMISSIONS.map(p => p.id));
    expect(canAccessSection(all, 'users')).toBe(false);
    expect(canAccessSection(all, 'paymob-settings')).toBe(false);
  });

  it('every permission in the list opens at least one section', () => {
    const used = new Set(Object.values(SECTION_PERMISSIONS).flat());
    for (const p of DASHBOARD_PERMISSIONS) expect(used.has(p.id)).toBe(true);
  });

  it('staff without overview lands on their first allowed section', () => {
    expect(firstAccessibleSection(staff(['manage_reminders', 'manage_bookings']))).toBe('bookings');
    expect(firstAccessibleSection(staff([]))).toBe(null);
  });
});
