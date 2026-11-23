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

export const PARTNER_PERMISSIONS: { id: string; label: string; group: string }[] = [
  { id: 'manage_partners', label: 'الوصول الأساسي لشركاء النجاح (توافق سابق)', group: 'شركاء النجاح' },
  { id: 'partners_view', label: 'عرض قسم شركاء النجاح', group: 'شركاء النجاح' },
  { id: 'partners_view_dashboard', label: 'عرض لوحة مؤشرات شركاء النجاح', group: 'شركاء النجاح' },
  { id: 'partners_view_organizations', label: 'عرض الجهات المتعاقدة', group: 'شركاء النجاح' },
  { id: 'partners_create_organizations', label: 'إضافة جهة متعاقدة', group: 'شركاء النجاح' },
  { id: 'partners_edit_organizations', label: 'تعديل بيانات جهة متعاقدة', group: 'شركاء النجاح' },
  { id: 'partners_delete_organizations', label: 'حذف جهة متعاقدة', group: 'شركاء النجاح' },
  { id: 'partners_manage_contacts', label: 'إدارة مسؤولي التواصل', group: 'شركاء النجاح' },
  { id: 'partners_view_activities', label: 'عرض الزيارات والاجتماعات', group: 'شركاء النجاح' },
  { id: 'partners_create_activities', label: 'إضافة زيارات واجتماعات', group: 'شركاء النجاح' },
  { id: 'partners_edit_activities', label: 'تعديل الزيارات والاجتماعات', group: 'شركاء النجاح' },
  { id: 'partners_delete_activities', label: 'حذف الزيارات والاجتماعات', group: 'شركاء النجاح' },
  { id: 'partners_view_contracts', label: 'عرض العقود وتفاصيلها', group: 'شركاء النجاح' },
  { id: 'partners_create_contracts', label: 'إنشاء عقود جديدة', group: 'شركاء النجاح' },
  { id: 'partners_edit_contracts', label: 'تعديل العقود', group: 'شركاء النجاح' },
  { id: 'partners_delete_contracts', label: 'حذف العقود', group: 'شركاء النجاح' },
  { id: 'partners_renew_contracts', label: 'تجديد العقود', group: 'شركاء النجاح' },
  { id: 'partners_manage_contract_documents', label: 'إدارة مرفقات العقود والأنشطة', group: 'شركاء النجاح' },
  { id: 'partners_view_referrals', label: 'عرض المرضى المحولين وإحصائياتهم', group: 'شركاء النجاح' },
  { id: 'partners_view_revenue', label: 'عرض إيرادات شركاء النجاح', group: 'شركاء النجاح' },
  { id: 'partners_view_financial_reports', label: 'عرض التقارير المالية للتعاقدات', group: 'شركاء النجاح' },
  { id: 'partners_export_reports', label: 'تصدير وطباعة تقارير شركاء النجاح', group: 'شركاء النجاح' },
  { id: 'partners_view_followups', label: 'عرض مهام المتابعة', group: 'شركاء النجاح' },
  { id: 'partners_create_followups', label: 'إنشاء مهام متابعة', group: 'شركاء النجاح' },
  { id: 'partners_edit_followups', label: 'تعديل وإغلاق مهام المتابعة', group: 'شركاء النجاح' },
  { id: 'partners_assign_followups', label: 'تعيين مهام المتابعة للموظفين', group: 'شركاء النجاح' },
  { id: 'partners_manage_renewal_alerts', label: 'إدارة تنبيهات تجديد العقود', group: 'شركاء النجاح' },
  { id: 'partners_manage_settings', label: 'إدارة إعدادات شركاء النجاح', group: 'شركاء النجاح' },
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
  ...PARTNER_PERMISSIONS,
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
  partners: PARTNER_PERMISSIONS.map(p => p.id),
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
