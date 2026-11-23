// Converts the clinic's public database rows (doctors, services, top photos, partners,
// settings) into the shapes the clinic screens use, and back again for saving.
import type { Database } from '@/integrations/supabase/types';

/** Same short number id the screens have always used, derived from the database id. */
export const localIdFromUuid = (uuid: string) => parseInt(uuid.slice(-8), 16) || Date.now();

export const mapDoctorRow = (d: any) => ({
  id: localIdFromUuid(d.id),
  name: d.name,
  specialty: d.specialty,
  image: d.image || '',
  maxPatients: d.max_patients,
  currentBookings: d.current_bookings,
  fee: Number(d.fee),
  rating: Number(d.rating),
  topSpecialties: d.top_specialties || [],
  availableDates: d.available_dates || [],
  patientsPerHour: d.patients_per_hour,
  experience: d.experience,
  education: d.education || '',
  followUpExamCount: d.follow_up_exam_count,
  followUpSurgeryCount: d.follow_up_surgery_count,
  facebookUrl: d.facebook_url || '',
  youtubeUrl: d.youtube_url || '',
  tiktokUrl: d.tiktok_url || '',
  websiteUrl: d.website_url || '',
  instagramUrl: d.instagram_url || '',
  xUrl: d.x_url || '',
});

export const mapServiceRow = (s: any) => ({
  id: localIdFromUuid(s.id),
  title: s.title,
  description: s.description || '',
  iconName: s.icon_name || 'Eye',
  color: s.color || 'text-blue-600',
  price: Number(s.price),
});

export const mapHeroRow = (h: any) => ({ id: localIdFromUuid(h.id), url: h.url, dbId: h.id as string });

export const mapPartnerRow = (p: any) => ({
  id: localIdFromUuid(p.id),
  name: p.name,
  logo: p.logo || '',
  description: p.description || '',
  dbId: p.id as string,
});

/** Contracting company row (full table or the public view without manager details). */
export const mapContractingRow = (c: any) => ({
  id: Number(c.id),
  name: c.name,
  documents: c.documents || [],
  managerName: c.manager_name || undefined,
  managerPhone: c.manager_phone || undefined,
});

export const contractingToRow = (c: {
  name: string;
  documents: string[];
  managerName?: string;
  managerPhone?: string;
  orgType?: string;
  sector?: string;
  governorate?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  contactTitle?: string;
  contactEmail?: string;
  cooperationStartDate?: string;
  relationshipStatus?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  adminNotes?: string;
  isActive?: boolean;
}) => {
  const row: Database['public']['Tables']['contracting_companies']['Insert'] = {
    name: c.name,
    documents: c.documents || [],
    manager_name: c.managerName || null,
    manager_phone: c.managerPhone || null,
  };
  if (c.orgType !== undefined) row.org_type = c.orgType || 'شركة تأمين';
  if (c.sector !== undefined) row.sector = c.sector || null;
  if (c.governorate !== undefined) row.governorate = c.governorate || null;
  if (c.city !== undefined) row.city = c.city || null;
  if (c.address !== undefined) row.address = c.address || null;
  if (c.phone !== undefined) row.phone = c.phone || null;
  if (c.email !== undefined) row.email = c.email || null;
  if (c.website !== undefined) row.website = c.website || null;
  if (c.contactTitle !== undefined) row.contact_title = c.contactTitle || null;
  if (c.contactEmail !== undefined) row.contact_email = c.contactEmail || null;
  if (c.cooperationStartDate !== undefined) row.cooperation_start_date = c.cooperationStartDate || null;
  if (c.relationshipStatus !== undefined) row.relationship_status = c.relationshipStatus || 'نشط';
  if (c.assignedStaffId !== undefined) row.assigned_staff_id = c.assignedStaffId || null;
  if (c.assignedStaffName !== undefined) row.assigned_staff_name = c.assignedStaffName || null;
  if (c.adminNotes !== undefined) row.admin_notes = c.adminNotes || null;
  if (c.isActive !== undefined) row.is_active = c.isActive !== false;
  return row;
};

const has = (v: unknown) => v !== null && v !== undefined;

/**
 * Applies a saved settings row on top of the current settings. Only fields the
 * database actually holds replace the current value; empty fields keep it.
 */
export function applySettingsRow<T extends Record<string, any>>(current: T, row: any): T {
  if (!row) return current;
  const next: Record<string, any> = { ...current };
  const map: Record<string, string> = {
    app_name: 'appName',
    hero_title: 'heroTitle',
    hero_description: 'heroDescription',
    logo_url: 'logoUrl',
    phones: 'phones',
    addresses: 'addresses',
    facebook_url: 'facebookUrl',
    whatsapp_number: 'whatsappNumber',
    map_location_url: 'mapLocationUrl',
    language: 'language',
    patient_mode: 'patientMode',
    stats: 'stats',
    working_hours: 'workingHours',
    reminder_settings: 'reminderSettings',
    terms_ar: 'termsAr',
    terms_en: 'termsEn',
    payment_methods: 'paymentMethods',
  };
  for (const [col, key] of Object.entries(map)) {
    if (col in row && has(row[col])) next[key] = row[col];
  }
  return next as T;
}

/** Database columns for saving the settings screen. */
export const settingsToRow = (s: any) => ({
  app_name: s.appName,
  hero_title: s.heroTitle,
  hero_description: s.heroDescription,
  logo_url: s.logoUrl,
  phones: s.phones,
  addresses: s.addresses,
  facebook_url: s.facebookUrl,
  whatsapp_number: s.whatsappNumber,
  map_location_url: s.mapLocationUrl,
  language: s.language,
  patient_mode: s.patientMode,
  stats: s.stats,
  working_hours: s.workingHours,
  reminder_settings: s.reminderSettings,
  terms_ar: s.termsAr,
  terms_en: s.termsEn,
  payment_methods: s.paymentMethods,
});
