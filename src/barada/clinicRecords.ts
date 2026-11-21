// Surgery operations and visitor messages (complaints / suggestions) live in the database so
// every staff device sees the same list and the daily backup includes them. Before this, both
// were kept only in the browser that created them.
import { supabase } from '@/integrations/supabase/client';

const OPS_IMPORTED_KEY = 'barada_operations_imported_v1';
const COMPLAINTS_IMPORTED_KEY = 'barada_complaints_imported_v1';

/** Same numeric id the screens have always used for database rows. */
export const numericId = (uuid: string) => parseInt(String(uuid).slice(-8), 16) || Date.now();

export const mapOperationRow = (o: any) => ({
  id: numericId(o.id),
  dbId: o.id as string,
  patientName: o.patient_name,
  patientPhone: o.patient_phone,
  patientPhone2: o.patient_phone2 || undefined,
  patientEmail: o.patient_email || undefined,
  patientAge: o.patient_age ?? undefined,
  doctorName: o.doctor_name,
  surgeryType: o.surgery_type,
  date: o.date,
  cost: Number(o.cost) || 0,
  reminderSent: !!o.reminder_sent,
  status: (o.status || 'pending') as 'pending' | 'confirmed' | 'cancelled',
  notes: o.notes || undefined,
  contractingCompanyId: o.contracting_company_id ?? undefined,
});

export const mapComplaintRow = (c: any) => ({
  id: numericId(c.id),
  dbId: c.id as string,
  name: c.name,
  phone: c.phone,
  type: (c.type === 'complaint' ? 'complaint' : 'suggestion') as 'suggestion' | 'complaint',
  message: c.message,
  date: c.date,
});

const operationToRow = (op: any) => ({
  patient_name: op.patientName,
  patient_phone: op.patientPhone,
  patient_phone2: op.patientPhone2 || null,
  patient_email: op.patientEmail || null,
  patient_age: op.patientAge !== undefined && op.patientAge !== null && op.patientAge !== '' ? Math.round(Number(op.patientAge)) : null,
  doctor_name: op.doctorName,
  surgery_type: op.surgeryType,
  date: op.date,
  cost: Math.round(Number(op.cost) || 0),
  notes: op.notes || null,
  contracting_company_id: op.contractingCompanyId ?? null,
});

const fail = (action: string, error: any) => {
  console.error(`Operation ${action} failed:`, error);
  const denied = error?.code === '42501' || /row-level security|permission/i.test(error?.message || '');
  alert(denied ? 'مش مسموح لحسابك بالإجراء ده. كلم مدير النظام.' : 'تعذر حفظ التغيير في قاعدة البيانات، حاول مرة أخرى.');
  return null;
};

export async function createOperation(op: any) {
  const { data, error } = await supabase
    .from('operations')
    .insert({ ...operationToRow(op), status: op.status || 'pending', reminder_sent: !!op.reminderSent } as any)
    .select()
    .single();
  return error ? fail('insert', error) : mapOperationRow(data);
}

export async function updateOperation(dbId: string, op: any) {
  const { error } = await supabase
    .from('operations')
    .update({ ...operationToRow(op), updated_at: new Date().toISOString() } as any)
    .eq('id', dbId);
  return error ? fail('update', error) : true;
}

export async function setOperationFields(dbId: string, fields: { status?: string; reminder_sent?: boolean }) {
  const { error } = await supabase
    .from('operations')
    .update({ ...fields, updated_at: new Date().toISOString() } as any)
    .eq('id', dbId);
  return error ? fail('update', error) : true;
}

export async function deleteOperation(dbId: string) {
  const { error } = await supabase.from('operations').delete().eq('id', dbId);
  return error ? fail('delete', error) : true;
}

/** Visitor contact form: saved for the staff (visitors can write but never read messages). */
export async function submitComplaint(form: { name: string; phone: string; type: string; message: string; date?: string }) {
  const { error } = await supabase.from('complaints').insert({
    name: form.name.trim().slice(0, 200),
    phone: form.phone.trim().slice(0, 30),
    type: form.type === 'complaint' ? 'complaint' : 'suggestion',
    message: form.message.trim().slice(0, 5000),
    ...(form.date ? { date: form.date } : {}),
  } as any);
  if (error) console.error('Complaint insert failed:', error);
  return !error;
}

export async function deleteComplaint(dbId: string) {
  const { error } = await supabase.from('complaints').delete().eq('id', dbId);
  if (error) {
    console.error('Complaint delete failed:', error);
    alert('تعذر حذف الرسالة، حاول مرة أخرى.');
    return false;
  }
  return true;
}

export async function markBookingReminderSent(dbId: string) {
  const { error } = await supabase.from('bookings').update({ reminder_sent: true } as any).eq('id', dbId);
  if (error) console.error('Booking reminder flag failed:', error);
}

const readLocal = (key: string): any[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** Snapshot of what this device kept before the database was used (read once at start-up). */
export const readLocalOperations = () => readLocal('barada_operations');
export const readLocalComplaints = () => readLocal('barada_complaints');

/**
 * Copies records that only ever lived on this device into the database, once per device.
 * Rows that already came from the database (dbId, or an id matching a database row) are skipped.
 * Returns how many rows were copied.
 */
export async function importLocalRecords(localOps: any[], localComplaints: any[], dbOps: any[], dbComplaints: any[]) {
  let copied = 0;
  try {
    if (!localStorage.getItem(OPS_IMPORTED_KEY)) {
      const known = new Set(dbOps.map((r: any) => numericId(r.id)));
      const fresh = localOps.filter((o) => o && !o.dbId && !known.has(o.id) && o.patientName && o.doctorName && o.surgeryType && o.date);
      if (fresh.length) {
        const { error } = await supabase.from('operations').insert(
          fresh.map((o) => ({ ...operationToRow(o), status: o.status || 'pending', reminder_sent: !!o.reminderSent })) as any,
        );
        if (error) throw error;
        copied += fresh.length;
      }
      localStorage.setItem(OPS_IMPORTED_KEY, '1');
    }
    if (!localStorage.getItem(COMPLAINTS_IMPORTED_KEY)) {
      const known = new Set(dbComplaints.map((r: any) => numericId(r.id)));
      const fresh = localComplaints.filter((c) => c && !c.dbId && !known.has(c.id) && c.name && c.phone && c.message);
      for (const c of fresh) {
        if (await submitComplaint(c)) copied += 1;
      }
      localStorage.setItem(COMPLAINTS_IMPORTED_KEY, '1');
    }
  } catch (error) {
    console.error('Copying on-device records to the database failed (will retry next visit):', error);
  }
  return copied;
}
