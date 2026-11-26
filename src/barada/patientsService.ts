import { supabase } from '@/integrations/supabase/client';
import { invokeBackend } from '@/lib/backend';
import { normalizePhone } from './bookingValidation';

export interface PatientRecord {
  id: string;
  fileNumber: string;
  fullName: string;
  phone: string;
  phone2?: string;
  nationalId?: string;
  email?: string;
  age?: number;
  governorate?: string;
  center?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdByStaffId?: string;
  createdByStaffName?: string;
  updatedByStaffId?: string;
  updatedByStaffName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavePatientInput {
  id?: string;
  fullName: string;
  phone: string;
  phone2?: string;
  nationalId?: string;
  email?: string;
  age?: number;
  governorate?: string;
  center?: string;
  address?: string;
  notes?: string;
}

export interface StaffActor {
  userId?: string;
  name: string;
}

let erpSchemaEnsured = false;

export async function ensureClinicErpSchemaReady(): Promise<void> {
  if (erpSchemaEnsured) return;
  try {
    await invokeBackend('ensure-clinic-erp-schema');
    erpSchemaEnsured = true;
  } catch {
    // Fallback gracefully in mock / offline setups
  }
}

export const mapPatientRow = (r: Record<string, unknown>): PatientRecord => ({
  id: String(r.id || ''),
  fileNumber: String(r.file_number || ''),
  fullName: String(r.full_name || ''),
  phone: String(r.phone || ''),
  phone2: r.phone2 ? String(r.phone2) : undefined,
  nationalId: r.national_id ? String(r.national_id) : undefined,
  email: r.email ? String(r.email) : undefined,
  age: typeof r.age === 'number' ? r.age : r.age ? Number(r.age) : undefined,
  governorate: r.governorate ? String(r.governorate) : undefined,
  center: r.center ? String(r.center) : undefined,
  address: r.address ? String(r.address) : undefined,
  notes: r.notes ? String(r.notes) : undefined,
  isActive: r.is_active !== false,
  createdByStaffId: r.created_by_staff_id ? String(r.created_by_staff_id) : undefined,
  createdByStaffName: r.created_by_staff_name ? String(r.created_by_staff_name) : undefined,
  updatedByStaffId: r.updated_by_staff_id ? String(r.updated_by_staff_id) : undefined,
  updatedByStaffName: r.updated_by_staff_name ? String(r.updated_by_staff_name) : undefined,
  createdAt: String(r.created_at || ''),
  updatedAt: String(r.updated_at || ''),
});

export async function recordClinicAudit(entry: {
  actorUserId?: string;
  actorName: string;
  module: 'bookings' | 'patients' | 'accounting' | 'permissions' | 'system';
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  reason?: string;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await supabase.from('clinic_audit_logs' as any).insert({
      actor_user_id: entry.actorUserId || null,
      actor_name: entry.actorName || 'موظف',
      module: entry.module,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId || null,
      summary: entry.summary,
      reason: entry.reason || null,
      previous_values: entry.previousValues || null,
      new_values: entry.newValues || null,
    } as any);
  } catch {
    // Non-blocking audit helper
  }
}

export async function listPatients(): Promise<PatientRecord[]> {
  await ensureClinicErpSchemaReady();
  const { data, error } = await supabase
    .from('patients' as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as Record<string, unknown>[]).map((r) => mapPatientRow(r)) : [];
}

export async function findDuplicatePatient(
  phone: string,
  nationalId?: string,
  excludeId?: string,
): Promise<PatientRecord | null> {
  const normPhone = normalizePhone(phone);
  const cleanNatId = (nationalId || '').trim();
  const { data } = await supabase.from('patients' as any).select('*');
  const rows = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
  const matched = rows.find((r) => {
    if (excludeId && String(r.id) === excludeId) return false;
    const rowPhone = normalizePhone(String(r.phone || ''));
    const rowPhone2 = normalizePhone(String(r.phone2 || ''));
    if (normPhone && (rowPhone === normPhone || rowPhone2 === normPhone)) return true;
    if (cleanNatId && String(r.national_id || '').trim() === cleanNatId) return true;
    return false;
  });
  return matched ? mapPatientRow(matched) : null;
}

export function searchPatientsInMemory(patients: PatientRecord[], query: string): PatientRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return patients;
  const qDigits = normalizePhone(q);
  return patients.filter((p) => {
    if (p.fullName.toLowerCase().includes(q)) return true;
    if (p.fileNumber.toLowerCase().includes(q)) return true;
    if (p.nationalId && p.nationalId.toLowerCase().includes(q)) return true;
    if (qDigits && (normalizePhone(p.phone).includes(qDigits) || (p.phone2 && normalizePhone(p.phone2).includes(qDigits)))) {
      return true;
    }
    return false;
  });
}

export async function savePatientRecord(
  input: SavePatientInput,
  actor: StaffActor,
): Promise<PatientRecord> {
  await ensureClinicErpSchemaReady();
  const normPhone = normalizePhone(input.phone);
  const normPhone2 = input.phone2 ? normalizePhone(input.phone2) : undefined;
  const composedAddress =
    input.address?.trim() ||
    [input.governorate?.trim(), input.center?.trim()].filter(Boolean).join(' - ') ||
    undefined;

  const duplicate = await findDuplicatePatient(normPhone, input.nationalId, input.id);
  if (duplicate) {
    throw new Error(`يوجد ملف مريض مسجل مسبقاً بنفس البيانات (${duplicate.fullName} - ${duplicate.phone})`);
  }

  if (input.id) {
    const updatePayload = {
      full_name: input.fullName.trim(),
      phone: normPhone,
      phone2: normPhone2 || null,
      national_id: input.nationalId?.trim() || null,
      email: input.email?.trim() || null,
      age: input.age ?? null,
      governorate: input.governorate?.trim() || null,
      center: input.center?.trim() || null,
      address: composedAddress || null,
      notes: input.notes?.trim() || null,
      updated_by_staff_id: actor.userId || null,
      updated_by_staff_name: actor.name,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('patients' as any)
      .update(updatePayload as any)
      .eq('id', input.id)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || 'تعذر تحديث ملف المريض');
    const mapped = mapPatientRow(data as unknown as Record<string, unknown>);
    await recordClinicAudit({
      actorUserId: actor.userId,
      actorName: actor.name,
      module: 'patients',
      action: 'PATIENT_UPDATED',
      entityType: 'patient',
      entityId: mapped.id,
      summary: `تحديث بيانات المريض ${mapped.fullName} (${mapped.phone})`,
      newValues: updatePayload as Record<string, unknown>,
    });
    return mapped;
  }

  const fileNumber = `PAT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const insertPayload = {
    id: crypto.randomUUID(),
    file_number: fileNumber,
    full_name: input.fullName.trim(),
    phone: normPhone,
    phone2: normPhone2 || null,
    national_id: input.nationalId?.trim() || null,
    email: input.email?.trim() || null,
    age: input.age ?? null,
    governorate: input.governorate?.trim() || null,
    center: input.center?.trim() || null,
    address: composedAddress || null,
    notes: input.notes?.trim() || null,
    is_active: true,
    created_by_staff_id: actor.userId || null,
    created_by_staff_name: actor.name,
    updated_by_staff_id: actor.userId || null,
    updated_by_staff_name: actor.name,
  };
  const { data, error } = await supabase
    .from('patients' as any)
    .insert(insertPayload as any)
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || 'تعذر تسجيل ملف المريض');
  const mapped = mapPatientRow(data as unknown as Record<string, unknown>);
  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'patients',
    action: 'PATIENT_CREATED',
    entityType: 'patient',
    entityId: mapped.id,
    summary: `تسجيل مريض جديد: ${mapped.fullName} (${mapped.phone})`,
    newValues: insertPayload as Record<string, unknown>,
  });
  return mapped;
}

export async function ensurePatientForStaffBooking(
  input: SavePatientInput,
  actor: StaffActor,
): Promise<PatientRecord | null> {
  try {
    const existing = await findDuplicatePatient(input.phone, input.nationalId);
    if (existing) return existing;
    return await savePatientRecord(input, actor);
  } catch {
    return null;
  }
}
