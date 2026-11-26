// One permission per dashboard section, in the same order as the side menu.
// The Users and electronic-payment settings sections stay manager-only because the
// server only lets the manager change passwords, roles and payment keys.

export type DashboardSection =
  | 'overview' | 'doctors' | 'bookings' | 'operations' | 'reminders' | 'patient-stats'
  | 'intelligence' | 'payments' | 'accounting' | 'contact-logs' | 'partners' | 'services' | 'offers' | 'medical-videos' | 'hero-images'
  | 'complaints' | 'settings' | 'backup' | 'reports' | 'users' | 'paymob-settings';

export const PATIENT_PERMISSIONS: { id: string; label: string; group: string }[] = [
  { id: 'patients_view', label: 'عرض ملفات المرضى', group: 'تسجيل وإدارة المرضى' },
  { id: 'patients_create', label: 'تسجيل مريض جديد', group: 'تسجيل وإدارة المرضى' },
  { id: 'patients_edit', label: 'تعديل بيانات المرضى', group: 'تسجيل وإدارة المرضى' },
  { id: 'patients_search', label: 'البحث عن المرضى', group: 'تسجيل وإدارة المرضى' },
  { id: 'patients_view_history', label: 'عرض سجل حجوزات المريض', group: 'تسجيل وإدارة المرضى' },
];

export const STAFF_BOOKING_PERMISSIONS: { id: string; label: string; group: string }[] = [
  { id: 'staff_bookings_view', label: 'عرض حجوزات الموظفين', group: 'حجوزات الموظفين' },
  { id: 'staff_bookings_create', label: 'إضافة حجز بواسطة الموظف', group: 'حجوزات الموظفين' },
  { id: 'staff_bookings_edit', label: 'تعديل الحجوزات', group: 'حجوزات الموظفين' },
  { id: 'staff_bookings_cancel', label: 'إلغاء الحجوزات', group: 'حجوزات الموظفين' },
  { id: 'staff_bookings_delete', label: 'حذف الحجوزات نهائياً', group: 'حجوزات الموظفين' },
  { id: 'staff_bookings_view_all', label: 'عرض كافة الحجوزات (الموقع والموظفين)', group: 'حجوزات الموظفين' },
  { id: 'staff_bookings_view_own', label: 'عرض حجوزاته فقط', group: 'حجوزات الموظفين' },
  { id: 'staff_bookings_override_rules', label: 'استثناء قيود الحجز (بسبب موثق)', group: 'حجوزات الموظفين' },
  { id: 'staff_bookings_assign_employee', label: 'إسناد الحجز لموظف مسؤول', group: 'حجوزات الموظفين' },
];

export const ACCOUNTING_PERMISSIONS: { id: string; label: string; group: string }[] = [
  { id: 'accounting_view', label: 'عرض قسم الحسابات ولوحة المؤشرات', group: 'قسم الحسابات' },
  { id: 'accounting_manage', label: 'إدارة عامة لقسم الحسابات', group: 'قسم الحسابات' },
  { id: 'accounting_revenue_view', label: 'عرض الإيرادات', group: 'قسم الحسابات' },
  { id: 'accounting_revenue_create', label: 'تسجيل الإيرادات', group: 'قسم الحسابات' },
  { id: 'accounting_revenue_edit', label: 'تعديل بيانات الإيرادات', group: 'قسم الحسابات' },
  { id: 'accounting_revenue_delete', label: 'عكس/إلغاء قيود الإيرادات', group: 'قسم الحسابات' },
  { id: 'accounting_expenses_view', label: 'عرض المصروفات', group: 'قسم الحسابات' },
  { id: 'accounting_expenses_create', label: 'تسجيل المصروفات', group: 'قسم الحسابات' },
  { id: 'accounting_expenses_edit', label: 'تعديل واعتماد المصروفات', group: 'قسم الحسابات' },
  { id: 'accounting_expenses_pay', label: 'سداد المصروفات', group: 'قسم الحسابات' },
  { id: 'accounting_expenses_delete', label: 'عكس/إلغاء قيود المصروفات', group: 'قسم الحسابات' },
  { id: 'accounting_accounts_view', label: 'عرض الخزائن والحسابات البنكية', group: 'قسم الحسابات' },
  { id: 'accounting_accounts_manage', label: 'إدارة الخزائن والحسابات البنكية', group: 'قسم الحسابات' },
  { id: 'accounting_transfers_create', label: 'إجراء التحويلات بين الحسابات', group: 'قسم الحسابات' },
  { id: 'accounting_receipts_create', label: 'إصدار سندات القبض', group: 'قسم الحسابات' },
  { id: 'accounting_receipts_view', label: 'عرض سندات القبض', group: 'قسم الحسابات' },
  { id: 'accounting_disbursements_create', label: 'إصدار سندات الصرف', group: 'قسم الحسابات' },
  { id: 'accounting_disbursements_view', label: 'عرض سندات الصرف', group: 'قسم الحسابات' },
  { id: 'accounting_reports_view', label: 'عرض التقارير المحاسبية', group: 'قسم الحسابات' },
  { id: 'accounting_reports_export', label: 'تصدير وطباعة التقارير المحاسبية', group: 'قسم الحسابات' },
  { id: 'accounting_manage_opening_balances', label: 'إدارة الأرصدة الافتتاحية', group: 'قسم الحسابات' },
  { id: 'accounting_manage_categories', label: 'إدارة تصنيفات الإيرادات والمصروفات', group: 'قسم الحسابات' },
  { id: 'accounting_manage_settings', label: 'إدارة إعدادات الحسابات', group: 'قسم الحسابات' },
  { id: 'accounting_view_sensitive_data', label: 'عرض البيانات والتفاصيل المالية الحساسة', group: 'قسم الحسابات' },
];

export const PATIENT_BILLING_PAYMENT_PERMISSIONS: { id: string; label: string; group: string }[] = [
  { id: 'patient_accounts_view', label: 'عرض حسابات المرضى والمستحقات', group: 'حسابات المرضى وتأكيد المدفوعات' },
  { id: 'patient_accounts_create', label: 'إنشاء قيود حسابات المرضى', group: 'حسابات المرضى وتأكيد المدفوعات' },
  { id: 'patient_accounts_edit', label: 'تعديل حسابات المرضى والخصومات', group: 'حسابات المرضى وتأكيد المدفوعات' },
  { id: 'patient_accounts_view_all', label: 'عرض حسابات كافة المرضى', group: 'حسابات المرضى وتأكيد المدفوعات' },
  { id: 'patient_accounts_view_own', label: 'عرض حسابات حجوزات الموظف فقط', group: 'حسابات المرضى وتأكيد المدفوعات' },
  { id: 'payment_confirm', label: 'تأكيد استلام المدفوعات (كامل)', group: 'حسابات المرضى وتأكيد المدفوعات' },
  { id: 'payment_confirm_partial', label: 'تأكيد استلام مدفوعات جزئية وتحصيل المتبقي', group: 'حسابات المرضى وتأكيد المدفوعات' },
  { id: 'payment_refund', label: 'تسجيل استرداد مبالغ للمرضى', group: 'حسابات المرضى وتأكيد المدفوعات' },
  { id: 'payment_reverse', label: 'عكس وإلغاء معاملات الدفع', group: 'حسابات المرضى وتأكيد المدفوعات' },
  { id: 'payment_view_history', label: 'عرض سجل وتاريخ معاملات الدفع', group: 'حسابات المرضى وتأكيد المدفوعات' },
  { id: 'accounting_view_patient_balances', label: 'عرض أرصدة ومستحقات المرضى في الحسابات والملف', group: 'حسابات المرضى وتأكيد المدفوعات' },
];

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
  ...PATIENT_PERMISSIONS,
  ...STAFF_BOOKING_PERMISSIONS,
  { id: 'manage_operations', label: 'إدارة سجل العمليات' },
  { id: 'manage_reminders', label: 'إدارة التذكيرات' },
  { id: 'view_reports', label: 'إحصائيات المرضى' },
  { id: 'view_intelligence', label: 'الذكاء الإداري' },
  { id: 'manage_payments', label: 'إدارة المدفوعات' },
  { id: 'review_instapay', label: 'مراجعة مدفوعات إنستاباي' },
  ...ACCOUNTING_PERMISSIONS,
  ...PATIENT_BILLING_PAYMENT_PERMISSIONS,
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
  bookings: [
    'manage_bookings',
    ...STAFF_BOOKING_PERMISSIONS.map(p => p.id),
    ...PATIENT_PERMISSIONS.map(p => p.id),
  ],
  operations: ['manage_operations'],
  reminders: ['manage_reminders'],
  'patient-stats': ['view_reports'],
  reports: ['view_reports'],
  intelligence: ['view_intelligence'],
  payments: [
    'manage_payments',
    'review_instapay',
    'payment_confirm',
    'payment_confirm_partial',
    'payment_refund',
    'payment_reverse',
    'payment_view_history',
  ],
  accounting: [
    ...ACCOUNTING_PERMISSIONS.map(p => p.id),
    ...PATIENT_BILLING_PAYMENT_PERMISSIONS.map(p => p.id),
  ],
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
  'payments', 'accounting', 'contact-logs', 'partners', 'services', 'offers', 'medical-videos', 'hero-images', 'complaints', 'users',
  'settings', 'backup', 'paymob-settings',
];

export type PermissionUser = { role: 'admin' | 'staff'; permissions: string[] } | null | undefined;

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

const LEGACY_BOOKING_IMPLIED_PATIENT_PERMS = new Set([
  'patients_view',
  'patients_search',
  'patients_view_history',
]);

const LEGACY_BOOKING_IMPLIED_STAFF_BOOKING_PERMS = new Set([
  'staff_bookings_view',
  'staff_bookings_edit',
  'staff_bookings_cancel',
  'staff_bookings_view_all',
]);

const ACCOUNTING_MANAGE_EXCLUDED_PERMS = new Set([
  'accounting_manage_opening_balances',
  'accounting_manage_settings',
  'accounting_view_sensitive_data',
]);

export function hasPatientPermission(user: PermissionUser, perm: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = user.permissions || [];
  if (perms.includes(perm)) return true;
  return perms.includes('manage_bookings') && LEGACY_BOOKING_IMPLIED_PATIENT_PERMS.has(perm);
}

export function hasStaffBookingPermission(user: PermissionUser, perm: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = user.permissions || [];
  if (perms.includes(perm)) return true;
  return perms.includes('manage_bookings') && LEGACY_BOOKING_IMPLIED_STAFF_BOOKING_PERMS.has(perm);
}

export function hasAccountingPermission(user: PermissionUser, perm: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = user.permissions || [];
  if (perms.includes(perm)) return true;
  return perms.includes('accounting_manage') && !ACCOUNTING_MANAGE_EXCLUDED_PERMS.has(perm);
}

/**
 * Strict permission check for patient billing accounts and payment confirmations/refunds/reversals.
 * Viewing a booking or viewing a patient profile NEVER grants payment confirmation or financial balance access.
 */
export function hasPatientBillingPermission(user: PermissionUser, perm: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = user.permissions || [];
  return perms.includes(perm);
}

