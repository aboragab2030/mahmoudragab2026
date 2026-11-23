// One permission per dashboard section, in the same order as the side menu.
// The Users and electronic-payment settings sections stay manager-only because the
// server only lets the manager change passwords, roles and payment keys.

export type DashboardSection =
  | 'overview' | 'doctors' | 'bookings' | 'operations' | 'reminders' | 'patient-stats'
  | 'intelligence' | 'payments' | 'contact-logs' | 'partners' | 'services' | 'offers' | 'medical-videos' | 'hero-images'
  | 'complaints' | 'settings' | 'backup' | 'reports' | 'users' | 'paymob-settings';

export const OFFER_PERMISSIONS: { id: string; label: string; group: string }[] = [
  { id: 'view_offers', label: 'عرض العروض', group: 'العروض' },
  { id: 'create_offers', label: 'إضافة العروض', group: 'العروض' },
  { id: 'edit_offers', label: 'تعديل العروض', group: 'العروض' },
  { id: 'delete_offers', label: 'حذف العروض', group: 'العروض' },
  { id: 'manage_offer_visibility', label: 'التحكم في ظهور العروض', group: 'العروض' },
  { id: 'upload_offer_images', label: 'رفع وتغيير صور العروض', group: 'العروض' },
];

export const MEDICAL_VIDEO_PERMISSIONS: { id: string; label: string; group: string }[] = [
  { id: 'medical_videos_view', label: 'عرض الفيديوهات الطبية', group: 'مكتبة الفيديوهات الطبية' },
  { id: 'medical_videos_create', label: 'إضافة فيديوهات طبية', group: 'مكتبة الفيديوهات الطبية' },
  { id: 'medical_videos_edit', label: 'تعديل الفيديوهات الطبية', group: 'مكتبة الفيديوهات الطبية' },
  { id: 'medical_videos_delete', label: 'حذف الفيديوهات الطبية', group: 'مكتبة الفيديوهات الطبية' },
  { id: 'medical_videos_publish', label: 'نشر وإلغاء نشر الفيديوهات', group: 'مكتبة الفيديوهات الطبية' },
  { id: 'medical_videos_manage_categories', label: 'إدارة أقسام الفيديوهات الطبية', group: 'مكتبة الفيديوهات الطبية' },
  { id: 'medical_videos_upload', label: 'رفع ملفات الفيديو والصور المصغرة', group: 'مكتبة الفيديوهات الطبية' },
  { id: 'medical_videos_manage_featured', label: 'التحكم في الفيديوهات المميزة', group: 'مكتبة الفيديوهات الطبية' },
];

export const DASHBOARD_PERMISSIONS: { id: string; label: string; group?: string }[] = [
  { id: 'view_overview', label: 'نظرة عامة' },
  { id: 'manage_doctors', label: 'إدارة الأطباء' },
  { id: 'manage_bookings', label: 'إدارة الحجوزات' },
  { id: 'manage_operations', label: 'إدارة سجل العمليات' },
  { id: 'manage_reminders', label: 'إدارة التذكيرات' },
  { id: 'view_reports', label: 'إحصائيات المرضى' },
  { id: 'view_intelligence', label: 'الذكاء الإداري' },
  { id: 'manage_payments', label: 'إدارة المدفوعات' },
  { id: 'review_instapay', label: 'مراجعة مدفوعات إنستاباي' },
  { id: 'view_contact_logs', label: 'سجل الاتصالات والتذكيرات' },
  { id: 'manage_partners', label: 'إدارة التعاقدات' },
  { id: 'manage_content', label: 'إدارة الخدمات' },
  ...OFFER_PERMISSIONS,
  ...MEDICAL_VIDEO_PERMISSIONS,
  { id: 'manage_hero_images', label: 'إدارة الصور' },
  { id: 'manage_complaints', label: 'إدارة الشكاوى والمقترحات' },
  { id: 'manage_settings', label: 'الإعدادات العامة' },
  { id: 'manage_backup', label: 'النسخ الاحتياطي' },
];

// A section opens when the user has any one of its permissions; an empty list means manager only.
export const SECTION_PERMISSIONS: Record<DashboardSection, string[]> = {
  overview: ['view_overview'],
  doctors: ['manage_doctors'],
  bookings: ['manage_bookings'],
  operations: ['manage_operations'],
  reminders: ['manage_reminders'],
  'patient-stats': ['view_reports'],
  reports: ['view_reports'],
  intelligence: ['view_intelligence'],
  payments: ['manage_payments', 'review_instapay'],
  'contact-logs': ['view_contact_logs'],
  partners: ['manage_partners'],
  services: ['manage_content'],
  offers: OFFER_PERMISSIONS.map(p => p.id),
  'medical-videos': MEDICAL_VIDEO_PERMISSIONS.map(p => p.id),
  'hero-images': ['manage_hero_images'],
  complaints: ['manage_complaints'],
  settings: ['manage_settings'],
  backup: ['manage_backup'],
  users: [],
  'paymob-settings': [],
};

// Side menu order, used to pick the first section a staff member may open.
export const SECTION_ORDER: DashboardSection[] = [
  'overview', 'doctors', 'bookings', 'operations', 'reminders', 'patient-stats', 'intelligence',
  'payments', 'contact-logs', 'partners', 'services', 'offers', 'medical-videos', 'hero-images', 'complaints', 'users',
  'settings', 'backup', 'paymob-settings',
];

type PermissionUser = { role: 'admin' | 'staff'; permissions: string[] } | null | undefined;

export function canAccessSection(user: PermissionUser, section: DashboardSection): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (section === 'medical-videos') {
    return (user.permissions || []).includes('medical_videos_view');
  }
  const needed = SECTION_PERMISSIONS[section] ?? [];
  return needed.some(p => (user.permissions || []).includes(p));
}

export function firstAccessibleSection(user: PermissionUser): DashboardSection | null {
  return SECTION_ORDER.find(s => canAccessSection(user, s)) ?? null;
}
