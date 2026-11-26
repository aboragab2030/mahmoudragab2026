import { supabase } from '@/integrations/supabase/client';
import { normalizePhone } from './bookingValidation';
import { cairoTodayStr } from './dateUtils';
import { ensureClinicErpSchemaReady } from './patientsService';
import type { AccountingPaymentMethod } from './accountingTypes';

export type PatientFinancialStatus =
  | 'غير مدفوع'
  | 'مدفوع جزئيًا'
  | 'مدفوع بالكامل'
  | 'ملغي'
  | 'مسترد بالكامل'
  | 'مسترد جزئيًا';

export const PATIENT_FINANCIAL_STATUSES: PatientFinancialStatus[] = [
  'غير مدفوع',
  'مدفوع جزئيًا',
  'مدفوع بالكامل',
  'ملغي',
  'مسترد بالكامل',
  'مسترد جزئيًا',
];

export const PATIENT_FINANCIAL_STATUS_BADGE: Record<PatientFinancialStatus, string> = {
  'غير مدفوع': 'bg-rose-50 text-rose-700 border-rose-200',
  'مدفوع جزئيًا': 'bg-amber-50 text-amber-800 border-amber-200',
  'مدفوع بالكامل': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'ملغي': 'bg-slate-100 text-slate-600 border-slate-200',
  'مسترد بالكامل': 'bg-purple-50 text-purple-700 border-purple-200',
  'مسترد جزئيًا': 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

export interface PatientBillingRecord {
  id: string;
  bookingId: string;
  patientId?: string;
  patientName: string;
  patientPhone: string;
  bookingSource: 'website' | 'staff' | 'admin';
  doctorId?: string;
  doctorName: string;
  serviceName: string;
  appointmentDate: string;
  bookingCreatedAt: string;
  originalPrice: number;
  discountAmount: number;
  discountReason?: string;
  finalAmountDue: number;
  paidAmount: number;
  refundedAmount: number;
  remainingBalance: number;
  financialStatus: PatientFinancialStatus;
  bookingStatus: 'confirmed' | 'cancelled';
  createdByStaffId?: string;
  createdByStaffName?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  lastPaymentAt?: string;
  lastPaymentMethod?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientBillingTransaction {
  id: string;
  billingRecordId: string;
  bookingId: string;
  patientId?: string;
  paymentId?: string;
  revenueId?: string;
  transactionKind: 'payment' | 'refund' | 'reversal';
  amount: number;
  paymentMethod: AccountingPaymentMethod;
  accountId?: string;
  transactionRef: string;
  idempotencyKey: string;
  confirmedVia:
    | 'payments_section'
    | 'accounting_section'
    | 'instapay_review'
    | 'paymob_webhook'
    | 'payment_webhook'
    | 'backfill';
  confirmedByStaffId?: string;
  confirmedByStaffName: string;
  notes?: string;
  status: 'confirmed' | 'reversed';
  reversedByStaffId?: string;
  reversedByStaffName?: string;
  reversedAt?: string;
  reversalReason?: string;
  createdAt: string;
}

export interface PatientBillingFilters {
  search?: string;
  bookingSource?: string;
  doctorName?: string;
  serviceName?: string;
  financialStatus?: string;
  staffName?: string;
  startDate?: string;
  endDate?: string;
}

export interface PatientBillingDashboardMetrics {
  totalReceivablesDue: number;
  totalUnpaidAmount: number;
  totalPartialPaidAmount: number;
  totalCollectedAmount: number;
  totalRemainingAmount: number;
  totalRefundedAmount: number;
  unpaidBookingsCount: number;
  fullyPaidBookingsCount: number;
  partiallyPaidBookingsCount: number;
  cancelledBookingsCount: number;
  refundedBookingsCount: number;
}

export interface PatientProfileTransactionHistoryRow {
  rowKey: string;
  bookingId: string;
  bookingDate: string;
  serviceName: string;
  doctorName: string;
  originalPrice: number;
  discountAmount: number;
  finalAmountDue: number;
  paidAmount: number;
  remainingBalance: number;
  paymentDate?: string;
  paymentMethod?: string;
  transactionRef?: string;
  confirmedByStaffName?: string;
  financialStatus: PatientFinancialStatus;
  transactionKind?: 'payment' | 'refund' | 'reversal';
}

export interface PatientProfileAccountingSummary {
  totalDue: number;
  totalPaid: number;
  totalRefunded: number;
  totalRemaining: number;
  totalFinancialBookingsCount: number;
  fullyPaidCount: number;
  partiallyPaidCount: number;
  unpaidCount: number;
  historyRows: PatientProfileTransactionHistoryRow[];
}

type Row = Record<string, any>;

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
};

export const mapBillingRecord = (r: Row): PatientBillingRecord => ({
  id: String(r.id),
  bookingId: String(r.booking_id),
  patientId: r.patient_id ? String(r.patient_id) : undefined,
  patientName: String(r.patient_name || ''),
  patientPhone: String(r.patient_phone || ''),
  bookingSource:
    r.booking_source === 'staff'
      ? 'staff'
      : r.booking_source === 'admin'
        ? 'admin'
        : 'website',
  doctorId: r.doctor_id ? String(r.doctor_id) : undefined,
  doctorName: String(r.doctor_name || ''),
  serviceName: String(r.service_name || ''),
  appointmentDate: String(r.appointment_date || ''),
  bookingCreatedAt: String(r.booking_created_at || r.created_at || ''),
  originalPrice: num(r.original_price),
  discountAmount: num(r.discount_amount),
  discountReason: r.discount_reason ? String(r.discount_reason) : undefined,
  finalAmountDue: num(r.final_amount_due),
  paidAmount: num(r.paid_amount),
  refundedAmount: num(r.refunded_amount),
  remainingBalance: num(r.remaining_balance),
  financialStatus: (r.financial_status as PatientFinancialStatus) || 'غير مدفوع',
  bookingStatus: r.booking_status === 'cancelled' ? 'cancelled' : 'confirmed',
  createdByStaffId: r.created_by_staff_id ? String(r.created_by_staff_id) : undefined,
  createdByStaffName: r.created_by_staff_name ? String(r.created_by_staff_name) : undefined,
  assignedStaffId: r.assigned_staff_id ? String(r.assigned_staff_id) : undefined,
  assignedStaffName: r.assigned_staff_name ? String(r.assigned_staff_name) : undefined,
  lastPaymentAt: r.last_payment_at ? String(r.last_payment_at) : undefined,
  lastPaymentMethod: r.last_payment_method ? String(r.last_payment_method) : undefined,
  createdAt: String(r.created_at || ''),
  updatedAt: String(r.updated_at || ''),
});

export const mapBillingTransaction = (r: Row): PatientBillingTransaction => ({
  id: String(r.id),
  billingRecordId: String(r.billing_record_id),
  bookingId: String(r.booking_id),
  patientId: r.patient_id ? String(r.patient_id) : undefined,
  paymentId: r.payment_id ? String(r.payment_id) : undefined,
  revenueId: r.revenue_id ? String(r.revenue_id) : undefined,
  transactionKind:
    r.transaction_kind === 'refund'
      ? 'refund'
      : r.transaction_kind === 'reversal'
        ? 'reversal'
        : 'payment',
  amount: num(r.amount),
  paymentMethod: (r.payment_method as AccountingPaymentMethod) || 'cash',
  accountId: r.account_id ? String(r.account_id) : undefined,
  transactionRef: String(r.transaction_ref || ''),
  idempotencyKey: String(r.idempotency_key || ''),
  confirmedVia: (r.confirmed_via as PatientBillingTransaction['confirmedVia']) || 'payments_section',
  confirmedByStaffId: r.confirmed_by_staff_id ? String(r.confirmed_by_staff_id) : undefined,
  confirmedByStaffName: String(r.confirmed_by_staff_name || 'موظف معتمد'),
  notes: r.notes ? String(r.notes) : undefined,
  status: r.status === 'reversed' ? 'reversed' : 'confirmed',
  reversedByStaffId: r.reversed_by_staff_id ? String(r.reversed_by_staff_id) : undefined,
  reversedByStaffName: r.reversed_by_staff_name ? String(r.reversed_by_staff_name) : undefined,
  reversedAt: r.reversed_at ? String(r.reversed_at) : undefined,
  reversalReason: r.reversal_reason ? String(r.reversal_reason) : undefined,
  createdAt: String(r.created_at || ''),
});

export async function syncBookingsToPatientBilling(): Promise<number> {
  await ensureClinicErpSchemaReady();
  const { data, error } = await supabase.rpc('sync_all_patient_billing_records' as any);
  if (error) {
    console.warn('sync_all_patient_billing_records warning:', error.message);
    return 0;
  }
  return Number(data || 0);
}

export async function loadPatientBillingRecords(options?: {
  onlyOwnForStaffId?: string;
}): Promise<PatientBillingRecord[]> {
  await ensureClinicErpSchemaReady();
  let query = supabase
    .from('patient_billing_records' as any)
    .select('*')
    .order('appointment_date', { ascending: false })
    .order('booking_created_at', { ascending: false });

  if (options?.onlyOwnForStaffId) {
    const uid = options.onlyOwnForStaffId;
    query = query.or(`created_by_staff_id.eq.${uid},assigned_staff_id.eq.${uid}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'تعذر تحميل حسابات المرضى والمستحقات');
  return Array.isArray(data) ? data.map(mapBillingRecord) : [];
}

export async function loadPatientBillingTransactions(filters?: {
  bookingId?: string;
  patientId?: string;
}): Promise<PatientBillingTransaction[]> {
  await ensureClinicErpSchemaReady();
  let query = supabase
    .from('patient_billing_transactions' as any)
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.bookingId) query = query.eq('booking_id', filters.bookingId);
  if (filters?.patientId) query = query.eq('patient_id', filters.patientId);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'تعذر تحميل سجل المعاملات المالية');
  return Array.isArray(data) ? data.map(mapBillingTransaction) : [];
}

export async function confirmUnifiedBookingPayment(input: {
  bookingId: string;
  amount: number;
  paymentMethod: AccountingPaymentMethod;
  accountId?: string;
  confirmedVia: 'payments_section' | 'accounting_section';
  idempotencyKey?: string;
  transactionRef?: string;
  notes?: string;
  issueVoucher?: boolean;
}): Promise<PatientBillingTransaction> {
  await ensureClinicErpSchemaReady();
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('يجب إدخال مبلغ تحصيل صحيح أكبر من صفر');
  }
  const idem = input.idempotencyKey?.trim() || `confirm:${input.bookingId}:${crypto.randomUUID()}`;

  const { data, error } = await supabase.rpc('confirm_patient_booking_payment' as any, {
    _booking_id: input.bookingId,
    _amount: amount,
    _payment_method: input.paymentMethod,
    _account_id: input.accountId || null,
    _confirmed_via: input.confirmedVia,
    _idempotency_key: idem,
    _transaction_ref: input.transactionRef?.trim() || null,
    _notes: input.notes?.trim() || null,
    _issue_voucher: Boolean(input.issueVoucher),
  } as any);

  if (error || !data) {
    throw new Error(error?.message || 'تعذر تأكيد استلام الدفعة');
  }
  return mapBillingTransaction(data as Row);
}

export async function refundOrReverseBookingPayment(input: {
  bookingId: string;
  mode: 'refund' | 'reversal';
  amount?: number;
  paymentMethod?: AccountingPaymentMethod;
  accountId?: string;
  reason: string;
  targetTransactionId?: string;
  idempotencyKey?: string;
}): Promise<PatientBillingTransaction> {
  await ensureClinicErpSchemaReady();
  const reason = input.reason.trim();
  if (!reason) throw new Error('يجب كتابة سبب الاسترداد أو العكس');

  const idem = input.idempotencyKey?.trim() || `${input.mode}:${input.bookingId}:${crypto.randomUUID()}`;
  const { data, error } = await supabase.rpc('refund_or_reverse_patient_payment' as any, {
    _booking_id: input.bookingId,
    _mode: input.mode,
    _amount: input.amount ?? 0,
    _payment_method: input.paymentMethod || 'cash',
    _account_id: input.accountId || null,
    _reason: reason,
    _target_transaction_id: input.targetTransactionId || null,
    _idempotency_key: idem,
  } as any);

  if (error || !data) {
    throw new Error(error?.message || 'تعذر تنفيذ عملية الاسترداد أو العكس');
  }
  return mapBillingTransaction(data as Row);
}

export async function applyPatientBillingDiscount(input: {
  bookingId: string;
  discount: number;
  reason: string;
}): Promise<PatientBillingRecord> {
  await ensureClinicErpSchemaReady();
  const discount = Math.max(Math.round(Number(input.discount) * 100) / 100, 0);
  const { data, error } = await supabase.rpc('apply_patient_billing_discount' as any, {
    _booking_id: input.bookingId,
    _discount: discount,
    _reason: input.reason.trim(),
  } as any);
  if (error || !data) {
    throw new Error(error?.message || 'تعذر تحديث الخصم');
  }
  return mapBillingRecord(data as Row);
}

export function filterPatientBillingRecords(
  records: PatientBillingRecord[],
  filters: PatientBillingFilters,
): PatientBillingRecord[] {
  const q = (filters.search || '').trim().toLowerCase();
  const qDigits = normalizePhone(q);

  return records.filter((rec) => {
    if (filters.bookingSource && rec.bookingSource !== filters.bookingSource) return false;
    if (filters.doctorName && rec.doctorName !== filters.doctorName) return false;
    if (filters.serviceName && rec.serviceName !== filters.serviceName) return false;
    if (filters.financialStatus && rec.financialStatus !== filters.financialStatus) return false;
    if (
      filters.staffName &&
      (rec.createdByStaffName || '') !== filters.staffName &&
      (rec.assignedStaffName || '') !== filters.staffName
    ) {
      return false;
    }
    if (filters.startDate && rec.appointmentDate < filters.startDate) return false;
    if (filters.endDate && rec.appointmentDate > filters.endDate) return false;
    if (q) {
      const nameMatch = rec.patientName.toLowerCase().includes(q);
      const phoneMatch = qDigits ? normalizePhone(rec.patientPhone).includes(qDigits) : rec.patientPhone.includes(q);
      const docMatch = rec.doctorName.toLowerCase().includes(q);
      const svcMatch = rec.serviceName.toLowerCase().includes(q);
      const idMatch = rec.bookingId.toLowerCase().includes(q);
      if (!nameMatch && !phoneMatch && !docMatch && !svcMatch && !idMatch) return false;
    }
    return true;
  });
}

export function computePatientBillingDashboardMetrics(
  records: PatientBillingRecord[],
  transactions: PatientBillingTransaction[],
  startDate?: string,
  endDate?: string,
): PatientBillingDashboardMetrics {
  const inRange = (d: string) => {
    const day = (d || '').slice(0, 10);
    if (startDate && day < startDate) return false;
    if (endDate && day > endDate) return false;
    return true;
  };

  const filtered = records.filter((r) => inRange(r.appointmentDate || r.bookingCreatedAt || cairoTodayStr()));
  const filteredTxns = transactions.filter((t) => inRange(t.createdAt));

  let totalReceivablesDue = 0;
  let totalUnpaidAmount = 0;
  let totalPartialPaidAmount = 0;
  let totalRemainingAmount = 0;
  let unpaidBookingsCount = 0;
  let fullyPaidBookingsCount = 0;
  let partiallyPaidBookingsCount = 0;
  let cancelledBookingsCount = 0;
  let refundedBookingsCount = 0;

  for (const r of filtered) {
    if (r.bookingStatus !== 'cancelled') {
      totalReceivablesDue += r.finalAmountDue;
      totalRemainingAmount += r.remainingBalance;
    } else {
      cancelledBookingsCount += 1;
    }

    if (r.financialStatus === 'غير مدفوع') {
      totalUnpaidAmount += r.remainingBalance;
      unpaidBookingsCount += 1;
    } else if (r.financialStatus === 'مدفوع جزئيًا') {
      totalPartialPaidAmount += r.paidAmount;
      partiallyPaidBookingsCount += 1;
    } else if (r.financialStatus === 'مدفوع بالكامل') {
      fullyPaidBookingsCount += 1;
    } else if (r.financialStatus === 'مسترد بالكامل' || r.financialStatus === 'مسترد جزئيًا') {
      refundedBookingsCount += 1;
    }
  }

  const grossPaid = filteredTxns
    .filter((t) => t.transactionKind === 'payment' && t.status === 'confirmed')
    .reduce((s, t) => s + t.amount, 0);
  const totalRefundedAmount = filteredTxns
    .filter((t) => t.transactionKind === 'refund' && t.status === 'confirmed')
    .reduce((s, t) => s + t.amount, 0);
  const totalCollectedAmount = Math.max(grossPaid - totalRefundedAmount, 0);

  return {
    totalReceivablesDue: num(totalReceivablesDue),
    totalUnpaidAmount: num(totalUnpaidAmount),
    totalPartialPaidAmount: num(totalPartialPaidAmount),
    totalCollectedAmount: num(totalCollectedAmount),
    totalRemainingAmount: num(totalRemainingAmount),
    totalRefundedAmount: num(totalRefundedAmount),
    unpaidBookingsCount,
    fullyPaidBookingsCount,
    partiallyPaidBookingsCount,
    cancelledBookingsCount,
    refundedBookingsCount,
  };
}

export function computePatientProfileSummary(
  records: PatientBillingRecord[],
  transactions: PatientBillingTransaction[],
  patientId: string | undefined,
  patientPhone: string,
): PatientProfileAccountingSummary {
  const normP = normalizePhone(patientPhone);
  const matchedRecords = records.filter(
    (r) =>
      (patientId && r.patientId === patientId) ||
      (normP && normalizePhone(r.patientPhone) === normP),
  );

  const recIds = new Set(matchedRecords.map((r) => r.bookingId));
  const matchedTxns = transactions.filter((t) => recIds.has(t.bookingId));

  let totalDue = 0;
  let totalPaidGross = 0;
  let totalRefunded = 0;
  let totalRemaining = 0;
  let fullyPaidCount = 0;
  let partiallyPaidCount = 0;
  let unpaidCount = 0;

  const historyRows: PatientProfileTransactionHistoryRow[] = [];

  for (const r of matchedRecords) {
    if (r.bookingStatus !== 'cancelled') {
      totalDue += r.finalAmountDue;
      totalRemaining += r.remainingBalance;
    }
    totalPaidGross += r.paidAmount;
    totalRefunded += r.refundedAmount;

    if (r.financialStatus === 'مدفوع بالكامل') fullyPaidCount += 1;
    else if (r.financialStatus === 'مدفوع جزئيًا') partiallyPaidCount += 1;
    else if (r.financialStatus === 'غير مدفوع') unpaidCount += 1;

    const txnsForBooking = matchedTxns.filter(
      (t) => t.bookingId === r.bookingId && t.status === 'confirmed',
    );
    if (txnsForBooking.length === 0) {
      historyRows.push({
        rowKey: `bill:${r.id}`,
        bookingId: r.bookingId,
        bookingDate: r.appointmentDate,
        serviceName: r.serviceName,
        doctorName: r.doctorName,
        originalPrice: r.originalPrice,
        discountAmount: r.discountAmount,
        finalAmountDue: r.finalAmountDue,
        paidAmount: r.paidAmount,
        remainingBalance: r.remainingBalance,
        financialStatus: r.financialStatus,
      });
    } else {
      for (const tx of txnsForBooking) {
        historyRows.push({
          rowKey: `tx:${tx.id}`,
          bookingId: r.bookingId,
          bookingDate: r.appointmentDate,
          serviceName: r.serviceName,
          doctorName: r.doctorName,
          originalPrice: r.originalPrice,
          discountAmount: r.discountAmount,
          finalAmountDue: r.finalAmountDue,
          paidAmount: tx.amount,
          remainingBalance: r.remainingBalance,
          paymentDate: tx.createdAt,
          paymentMethod: tx.paymentMethod,
          transactionRef: tx.transactionRef,
          confirmedByStaffName: tx.confirmedByStaffName,
          financialStatus: r.financialStatus,
          transactionKind: tx.transactionKind,
        });
      }
    }
  }

  return {
    totalDue: num(totalDue),
    totalPaid: num(Math.max(totalPaidGross - totalRefunded, 0)),
    totalRefunded: num(totalRefunded),
    totalRemaining: num(totalRemaining),
    totalFinancialBookingsCount: matchedRecords.length,
    fullyPaidCount,
    partiallyPaidCount,
    unpaidCount,
    historyRows: historyRows.sort((a, b) =>
      String(b.paymentDate || b.bookingDate).localeCompare(String(a.paymentDate || a.bookingDate)),
    ),
  };
}
