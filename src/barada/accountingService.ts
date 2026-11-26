import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { cairoTodayStr } from './dateUtils';
import { computeBookingExpectedFee } from './bookingValidation';
import { ensureClinicErpSchemaReady, recordClinicAudit, type StaffActor } from './patientsService';
import {
  mapBillingRecord,
  mapBillingTransaction,
  type PatientBillingRecord,
  type PatientBillingTransaction,
} from './patientBillingService';
import {
  EXPENSE_PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  REVENUE_SOURCE_LABELS,
  type AccountingAccount,
  type AccountingAccountTransaction,
  type AccountingAttachment,
  type AccountingCategory,
  type AccountingExpense,
  type AccountingExpensePayment,
  type AccountingPaymentMethod,
  type AccountingReportId,
  type AccountingRevenue,
  type AccountingSettingsRecord,
  type AccountingTransfer,
  type AccountingVoucher,
  type AccountType,
  type ClinicAuditLogRecord,
  type RevenueSourceType,
  type VoucherKind,
} from './accountingTypes';

type Row = Record<string, any>;

export interface AccountingBundle {
  categories: AccountingCategory[];
  accounts: AccountingAccount[];
  revenues: AccountingRevenue[];
  expenses: AccountingExpense[];
  expensePayments: AccountingExpensePayment[];
  transfers: AccountingTransfer[];
  vouchers: AccountingVoucher[];
  transactions: AccountingAccountTransaction[];
  settings: AccountingSettingsRecord;
  auditLogs: ClinicAuditLogRecord[];
  billingRecords: PatientBillingRecord[];
  billingTransactions: PatientBillingTransaction[];
}

export interface ExternalPaymentSourceRow {
  sourceTable: 'payments' | 'instapay_submissions' | 'paymob_payments';
  sourceId: string;
  bookingId?: string;
  patientName: string;
  patientPhone?: string;
  amount: number;
  paymentMethod: Exclude<AccountingPaymentMethod, 'other'>;
  reference: string;
  date: string;
  alreadyLinkedRevenueId?: string;
}

export interface BookingFinancialRow {
  bookingUuid: string;
  numericBookingId: number;
  patientName: string;
  phone: string;
  doctorName: string;
  service: string;
  date: string;
  time: string;
  status: 'confirmed' | 'cancelled';
  bookingType: 'cash' | 'contract';
  bookingSource: 'website' | 'staff' | 'admin';
  contractingCompanyId?: number;
  estimatedValue: number;
  collectedAmount: number;
  recognizedRevenueAmount: number;
  remainingAmount: number;
  needsRefundOrReversal: boolean;
  paymentStatus: string;
  paymentMethod?: string;
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const generateDocNumber = (prefix: string, dateStr?: string): string => {
  const year = (dateStr || cairoTodayStr()).slice(0, 4) || String(new Date().getFullYear());
  const rand = Math.floor(10000 + Math.random() * 90000);
  const ts = String(Date.now()).slice(-3);
  return `${prefix}-${year}-${ts}${rand}`;
};

const mapCategory = (r: Row): AccountingCategory => ({
  id: String(r.id),
  kind: r.kind === 'expense' ? 'expense' : 'revenue',
  code: String(r.code || ''),
  nameAr: String(r.name_ar || ''),
  description: r.description ? String(r.description) : undefined,
  isSystem: Boolean(r.is_system),
  isActive: r.is_active !== false,
  displayOrder: num(r.display_order, 100),
});

const mapAccount = (r: Row): AccountingAccount => ({
  id: String(r.id),
  accountType: r.account_type === 'bank' ? 'bank' : 'cashbox',
  name: String(r.name || ''),
  code: r.code ? String(r.code) : undefined,
  bankName: r.bank_name ? String(r.bank_name) : undefined,
  accountNumber: r.account_number ? String(r.account_number) : undefined,
  currency: String(r.currency || 'EGP'),
  openingBalance: num(r.opening_balance),
  openingBalanceDate: String(r.opening_balance_date || cairoTodayStr()),
  notes: r.notes ? String(r.notes) : undefined,
  isActive: r.is_active !== false,
  createdByName: r.created_by_name ? String(r.created_by_name) : undefined,
  createdAt: String(r.created_at || ''),
  updatedAt: String(r.updated_at || ''),
});

const mapRevenue = (r: Row): AccountingRevenue => ({
  id: String(r.id),
  docNumber: String(r.doc_number || ''),
  revenueDate: String(r.revenue_date || cairoTodayStr()),
  categoryId: r.category_id ? String(r.category_id) : undefined,
  categoryName: String(r.category_name || ''),
  revenueSource: (r.revenue_source as RevenueSourceType) || 'direct',
  description: String(r.description || ''),
  amount: num(r.amount),
  paymentMethod: (r.payment_method as Exclude<AccountingPaymentMethod, 'other'>) || 'cash',
  accountId: r.account_id ? String(r.account_id) : undefined,
  patientId: r.patient_id ? String(r.patient_id) : undefined,
  patientName: r.patient_name ? String(r.patient_name) : undefined,
  bookingId: r.booking_id ? String(r.booking_id) : undefined,
  operationId: r.operation_id ? String(r.operation_id) : undefined,
  doctorName: r.doctor_name ? String(r.doctor_name) : undefined,
  serviceName: r.service_name ? String(r.service_name) : undefined,
  bookingSource: r.booking_source as 'website' | 'staff' | 'admin' | undefined,
  contractingCompanyId: typeof r.contracting_company_id === 'number' ? r.contracting_company_id : undefined,
  responsibleStaffId: r.responsible_staff_id ? String(r.responsible_staff_id) : undefined,
  responsibleStaffName: r.responsible_staff_name ? String(r.responsible_staff_name) : undefined,
  notes: r.notes ? String(r.notes) : undefined,
  attachments: Array.isArray(r.attachments) ? (r.attachments as AccountingAttachment[]) : [],
  status: r.status === 'reversed' ? 'reversed' : 'posted',
  reversalReason: r.reversal_reason ? String(r.reversal_reason) : undefined,
  reversedByName: r.reversed_by_name ? String(r.reversed_by_name) : undefined,
  reversedAt: r.reversed_at ? String(r.reversed_at) : undefined,
  sourceTable: r.source_table ? String(r.source_table) : undefined,
  sourceId: r.source_id ? String(r.source_id) : undefined,
  createdByName: r.created_by_name ? String(r.created_by_name) : undefined,
  createdAt: String(r.created_at || ''),
});

const mapExpense = (r: Row): AccountingExpense => {
  const total = num(r.total_amount);
  const paid = num(r.paid_amount);
  return {
    id: String(r.id),
    docNumber: String(r.doc_number || ''),
    expenseDate: String(r.expense_date || cairoTodayStr()),
    categoryId: r.category_id ? String(r.category_id) : undefined,
    categoryName: String(r.category_name || ''),
    description: String(r.description || ''),
    totalAmount: total,
    paidAmount: paid,
    remainingAmount: r.remaining_amount != null ? num(r.remaining_amount) : Math.max(total - paid, 0),
    paymentStatus: (r.payment_status as 'unpaid' | 'partial' | 'paid') || 'unpaid',
    paymentMethod: r.payment_method as AccountingPaymentMethod | undefined,
    accountId: r.account_id ? String(r.account_id) : undefined,
    beneficiary: String(r.beneficiary || ''),
    invoiceNumber: r.invoice_number ? String(r.invoice_number) : undefined,
    responsibleStaffId: r.responsible_staff_id ? String(r.responsible_staff_id) : undefined,
    responsibleStaffName: r.responsible_staff_name ? String(r.responsible_staff_name) : undefined,
    approvalStatus: (r.approval_status as 'pending' | 'approved' | 'rejected') || 'approved',
    approvedByName: r.approved_by_name ? String(r.approved_by_name) : undefined,
    approvedAt: r.approved_at ? String(r.approved_at) : undefined,
    notes: r.notes ? String(r.notes) : undefined,
    attachments: Array.isArray(r.attachments) ? (r.attachments as AccountingAttachment[]) : [],
    status: r.status === 'reversed' ? 'reversed' : 'posted',
    reversalReason: r.reversal_reason ? String(r.reversal_reason) : undefined,
    reversedByName: r.reversed_by_name ? String(r.reversed_by_name) : undefined,
    reversedAt: r.reversed_at ? String(r.reversed_at) : undefined,
    createdByName: r.created_by_name ? String(r.created_by_name) : undefined,
    createdAt: String(r.created_at || ''),
  };
};

const mapExpensePayment = (r: Row): AccountingExpensePayment => ({
  id: String(r.id),
  expenseId: String(r.expense_id),
  paymentDate: String(r.payment_date || cairoTodayStr()),
  amount: num(r.amount),
  paymentMethod: (r.payment_method as AccountingPaymentMethod) || 'cash',
  accountId: String(r.account_id),
  notes: r.notes ? String(r.notes) : undefined,
  status: r.status === 'reversed' ? 'reversed' : 'posted',
  createdByName: r.created_by_name ? String(r.created_by_name) : undefined,
  createdAt: String(r.created_at || ''),
});

const mapTransfer = (r: Row): AccountingTransfer => ({
  id: String(r.id),
  transferNumber: String(r.transfer_number || ''),
  transferDate: String(r.transfer_date || cairoTodayStr()),
  fromAccountId: String(r.from_account_id),
  toAccountId: String(r.to_account_id),
  amount: num(r.amount),
  notes: r.notes ? String(r.notes) : undefined,
  status: r.status === 'reversed' ? 'reversed' : 'posted',
  reversalReason: r.reversal_reason ? String(r.reversal_reason) : undefined,
  createdByName: r.created_by_name ? String(r.created_by_name) : undefined,
  createdAt: String(r.created_at || ''),
});

const mapVoucher = (r: Row): AccountingVoucher => ({
  id: String(r.id),
  voucherKind: r.voucher_kind === 'disbursement' ? 'disbursement' : 'receipt',
  voucherNumber: String(r.voucher_number || ''),
  voucherDate: String(r.voucher_date || cairoTodayStr()),
  partyName: String(r.party_name || ''),
  amount: num(r.amount),
  reason: String(r.reason || ''),
  paymentMethod: (r.payment_method as AccountingPaymentMethod) || 'cash',
  accountId: r.account_id ? String(r.account_id) : undefined,
  affectsAccount: Boolean(r.affects_account),
  bookingId: r.booking_id ? String(r.booking_id) : undefined,
  patientId: r.patient_id ? String(r.patient_id) : undefined,
  revenueId: r.revenue_id ? String(r.revenue_id) : undefined,
  expenseId: r.expense_id ? String(r.expense_id) : undefined,
  responsibleStaffId: r.responsible_staff_id ? String(r.responsible_staff_id) : undefined,
  responsibleStaffName: r.responsible_staff_name ? String(r.responsible_staff_name) : undefined,
  notes: r.notes ? String(r.notes) : undefined,
  status: r.status === 'reversed' ? 'reversed' : 'posted',
  reversalReason: r.reversal_reason ? String(r.reversal_reason) : undefined,
  createdByName: r.created_by_name ? String(r.created_by_name) : undefined,
  createdAt: String(r.created_at || ''),
});

const mapTxn = (r: Row): AccountingAccountTransaction => ({
  id: String(r.id),
  accountId: String(r.account_id),
  transactionDate: String(r.transaction_date || cairoTodayStr()),
  direction: r.direction === 'out' ? 'out' : 'in',
  entryType: r.entry_type as AccountingAccountTransaction['entryType'],
  amount: num(r.amount),
  referenceTable: r.reference_table ? String(r.reference_table) : undefined,
  referenceId: r.reference_id ? String(r.reference_id) : undefined,
  description: String(r.description || ''),
  createdByName: r.created_by_name ? String(r.created_by_name) : undefined,
  createdAt: String(r.created_at || ''),
});

export async function loadAccountingBundle(): Promise<AccountingBundle> {
  await ensureClinicErpSchemaReady();

  const [
    catRes,
    accRes,
    revRes,
    expRes,
    expPayRes,
    trfRes,
    vchRes,
    txnRes,
    setRes,
    auditRes,
    billRecRes,
    billTxnRes,
  ] = await Promise.all([
    supabase.from('accounting_categories' as any).select('*').order('display_order', { ascending: true }),
    supabase.from('accounting_accounts' as any).select('*').order('created_at', { ascending: true }),
    supabase.from('accounting_revenues' as any).select('*').order('revenue_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('accounting_expenses' as any).select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('accounting_expense_payments' as any).select('*').order('payment_date', { ascending: false }),
    supabase.from('accounting_transfers' as any).select('*').order('transfer_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('accounting_vouchers' as any).select('*').order('voucher_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('accounting_account_transactions' as any).select('*').order('transaction_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('accounting_settings' as any).select('*').eq('id', 1).maybeSingle(),
    supabase.from('clinic_audit_logs' as any).select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('patient_billing_records' as any).select('*').order('appointment_date', { ascending: false }).order('booking_created_at', { ascending: false }),
    supabase.from('patient_billing_transactions' as any).select('*').order('created_at', { ascending: false }).limit(500),
  ]);

  const sRow = (setRes.data || {}) as Row;
  return {
    categories: Array.isArray(catRes.data) ? catRes.data.map(mapCategory) : [],
    accounts: Array.isArray(accRes.data) ? accRes.data.map(mapAccount) : [],
    revenues: Array.isArray(revRes.data) ? revRes.data.map(mapRevenue) : [],
    expenses: Array.isArray(expRes.data) ? expRes.data.map(mapExpense) : [],
    expensePayments: Array.isArray(expPayRes.data) ? expPayRes.data.map(mapExpensePayment) : [],
    transfers: Array.isArray(trfRes.data) ? trfRes.data.map(mapTransfer) : [],
    vouchers: Array.isArray(vchRes.data) ? vchRes.data.map(mapVoucher) : [],
    transactions: Array.isArray(txnRes.data) ? txnRes.data.map(mapTxn) : [],
    settings: {
      id: 1,
      clinicTaxNumber: sRow.clinic_tax_number ? String(sRow.clinic_tax_number) : undefined,
      fiscalYearStartMonth: num(sRow.fiscal_year_start_month, 1),
      requireExpenseApproval: Boolean(sRow.require_expense_approval),
      lockBeforeDate: sRow.lock_before_date ? String(sRow.lock_before_date) : undefined,
      defaultCurrency: String(sRow.default_currency || 'EGP'),
      voucherNotesFooter: sRow.voucher_notes_footer ? String(sRow.voucher_notes_footer) : undefined,
    },
    auditLogs: Array.isArray(auditRes.data)
      ? auditRes.data.map((r: Row) => ({
          id: String(r.id),
          actorUserId: r.actor_user_id ? String(r.actor_user_id) : undefined,
          actorName: String(r.actor_name || ''),
          module: String(r.module || ''),
          action: String(r.action || ''),
          entityType: String(r.entity_type || ''),
          entityId: r.entity_id ? String(r.entity_id) : undefined,
          summary: String(r.summary || ''),
          reason: r.reason ? String(r.reason) : undefined,
          createdAt: String(r.created_at || ''),
        }))
      : [],
    billingRecords: Array.isArray(billRecRes.data) ? billRecRes.data.map(mapBillingRecord) : [],
    billingTransactions: Array.isArray(billTxnRes.data) ? billTxnRes.data.map(mapBillingTransaction) : [],
  };
}

export function computeAccountBalance(
  account: AccountingAccount,
  transactions: AccountingAccountTransaction[],
): number {
  let balance = account.openingBalance;
  for (const t of transactions) {
    if (t.accountId !== account.id) continue;
    if (t.direction === 'in') balance += t.amount;
    else balance -= t.amount;
  }
  return Math.round(balance * 100) / 100;
}

export async function createAccountingAccount(
  input: {
    accountType: AccountType;
    name: string;
    code?: string;
    bankName?: string;
    accountNumber?: string;
    openingBalance: number;
    openingBalanceDate: string;
    notes?: string;
  },
  actor: StaffActor,
): Promise<AccountingAccount> {
  const payload = {
    id: crypto.randomUUID(),
    account_type: input.accountType,
    name: input.name.trim(),
    code: input.code?.trim() || null,
    bank_name: input.accountType === 'bank' ? (input.bankName?.trim() || null) : null,
    account_number: input.accountType === 'bank' ? (input.accountNumber?.trim() || null) : null,
    currency: 'EGP',
    opening_balance: Math.max(num(input.openingBalance), 0),
    opening_balance_date: input.openingBalanceDate || cairoTodayStr(),
    notes: input.notes?.trim() || null,
    is_active: true,
    created_by: actor.userId || null,
    created_by_name: actor.name,
    updated_by: actor.userId || null,
    updated_by_name: actor.name,
  };
  const { data, error } = await supabase
    .from('accounting_accounts' as any)
    .insert(payload as any)
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || 'تعذر إنشاء الحساب المالي');
  const mapped = mapAccount(data as Row);
  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'ACCOUNT_CREATED',
    entityType: 'accounting_account',
    entityId: mapped.id,
    summary: `إنشاء ${mapped.accountType === 'cashbox' ? 'خزينة' : 'حساب بنكي'}: ${mapped.name} برصيد افتتاحي ${mapped.openingBalance} ج.م`,
    newValues: payload,
  });
  return mapped;
}

export async function updateAccountOpeningBalance(
  account: AccountingAccount,
  newOpeningBalance: number,
  reason: string,
  actor: StaffActor,
): Promise<void> {
  if (!reason.trim()) throw new Error('يجب كتابة سبب تعديل الرصيد الافتتاحي');
  if (newOpeningBalance < 0) throw new Error('الرصيد الافتتاحي لا يمكن أن يكون سالباً');
  const { error } = await supabase
    .from('accounting_accounts' as any)
    .update({
      opening_balance: newOpeningBalance,
      updated_by: actor.userId || null,
      updated_by_name: actor.name,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', account.id);
  if (error) throw new Error(error.message || 'تعذر تحديث الرصيد الافتتاحي');
  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'OPENING_BALANCE_UPDATED',
    entityType: 'accounting_account',
    entityId: account.id,
    summary: `تعديل الرصيد الافتتاحي للحساب ${account.name} من ${account.openingBalance} إلى ${newOpeningBalance}`,
    reason: reason.trim(),
    previousValues: { opening_balance: account.openingBalance },
    newValues: { opening_balance: newOpeningBalance },
  });
}

export async function recordAccountingRevenue(
  input: {
    revenueDate: string;
    categoryId?: string;
    categoryName: string;
    revenueSource: RevenueSourceType;
    description: string;
    amount: number;
    paymentMethod: Exclude<AccountingPaymentMethod, 'other'>;
    accountId: string;
    patientId?: string;
    patientName?: string;
    bookingId?: string;
    operationId?: string;
    doctorName?: string;
    serviceName?: string;
    bookingSource?: 'website' | 'staff' | 'admin';
    contractingCompanyId?: number;
    notes?: string;
    attachments?: AccountingAttachment[];
    sourceTable?: string;
    sourceId?: string;
  },
  actor: StaffActor,
  options?: { issueReceiptVoucher?: boolean },
): Promise<AccountingRevenue> {
  if (input.amount <= 0) throw new Error('مبلغ الإيراد يجب أن يكون أكبر من صفر');
  if (!input.accountId) throw new Error('يرجى تحديد الخزينة أو الحساب البنكي المستلم');

  const id = crypto.randomUUID();
  const docNumber = generateDocNumber('REV', input.revenueDate);
  const payload = {
    id,
    doc_number: docNumber,
    revenue_date: input.revenueDate || cairoTodayStr(),
    category_id: input.categoryId || null,
    category_name: input.categoryName.trim(),
    revenue_source: input.revenueSource,
    description: input.description.trim(),
    amount: Math.round(num(input.amount) * 100) / 100,
    payment_method: input.paymentMethod,
    account_id: input.accountId,
    patient_id: input.patientId || null,
    patient_name: input.patientName?.trim() || null,
    booking_id: input.bookingId || null,
    operation_id: input.operationId || null,
    doctor_name: input.doctorName?.trim() || null,
    service_name: input.serviceName?.trim() || null,
    booking_source: input.bookingSource || null,
    contracting_company_id: input.contractingCompanyId ?? null,
    responsible_staff_id: actor.userId || null,
    responsible_staff_name: actor.name,
    notes: input.notes?.trim() || null,
    attachments: input.attachments || [],
    status: 'posted',
    source_table: input.sourceTable || null,
    source_id: input.sourceId || null,
    created_by: actor.userId || null,
    created_by_name: actor.name,
  };

  const { data, error } = await supabase
    .from('accounting_revenues' as any)
    .insert(payload as any)
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || 'تعذر تسجيل الإيراد');
  const rev = mapRevenue(data as Row);

  const { error: txnErr } = await supabase.from('accounting_account_transactions' as any).insert({
    id: crypto.randomUUID(),
    account_id: input.accountId,
    transaction_date: rev.revenueDate,
    direction: 'in',
    entry_type: 'revenue',
    amount: rev.amount,
    reference_table: 'accounting_revenues',
    reference_id: rev.id,
    description: `${rev.docNumber} - ${rev.description}`,
    created_by: actor.userId || null,
    created_by_name: actor.name,
  } as any);
  if (txnErr) {
    throw new Error(txnErr.message || 'تم تسجيل الإيراد لكن تعذر ترحيله إلى حركة الحساب');
  }

  if (options?.issueReceiptVoucher) {
    await createVoucherRecord(
      {
        voucherKind: 'receipt',
        voucherDate: rev.revenueDate,
        partyName: rev.patientName || rev.description,
        amount: rev.amount,
        reason: rev.description,
        paymentMethod: rev.paymentMethod,
        accountId: rev.accountId,
        affectsAccount: false, // Account already credited above by revenue entry!
        bookingId: rev.bookingId,
        patientId: rev.patientId,
        revenueId: rev.id,
        notes: `مرتبط بقيد الإيراد ${rev.docNumber}`,
      },
      actor,
    );
  }

  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'REVENUE_POSTED',
    entityType: 'accounting_revenue',
    entityId: rev.id,
    summary: `تسجيل إيراد ${rev.docNumber}: ${rev.description} بقيمة ${rev.amount} ج.م`,
    newValues: payload,
  });

  return rev;
}

export async function reverseAccountingRevenue(
  revenue: AccountingRevenue,
  reason: string,
  actor: StaffActor,
): Promise<void> {
  if (revenue.status === 'reversed') throw new Error('تم عكس هذا الإيراد مسبقاً');
  if (!reason.trim()) throw new Error('يرجى كتابة سبب إلغاء / عكس قيد الإيراد');

  const { error } = await supabase
    .from('accounting_revenues' as any)
    .update({
      status: 'reversed',
      reversal_reason: reason.trim(),
      reversed_by: actor.userId || null,
      reversed_by_name: actor.name,
      reversed_at: new Date().toISOString(),
      updated_by: actor.userId || null,
      updated_by_name: actor.name,
    } as any)
    .eq('id', revenue.id);
  if (error) throw new Error(error.message || 'تعذر عكس قيد الإيراد');

  if (revenue.accountId) {
    await supabase.from('accounting_account_transactions' as any).insert({
      id: crypto.randomUUID(),
      account_id: revenue.accountId,
      transaction_date: cairoTodayStr(),
      direction: 'out',
      entry_type: 'revenue_reversal',
      amount: revenue.amount,
      reference_table: 'accounting_revenues',
      reference_id: revenue.id,
      description: `عكس إيراد ${revenue.docNumber}: ${reason.trim()}`,
      created_by: actor.userId || null,
      created_by_name: actor.name,
    } as any);
  }

  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'REVENUE_REVERSED',
    entityType: 'accounting_revenue',
    entityId: revenue.id,
    summary: `عكس قيد الإيراد ${revenue.docNumber} بقيمة ${revenue.amount} ج.م`,
    reason: reason.trim(),
  });
}

export async function recordAccountingExpense(
  input: {
    expenseDate: string;
    categoryId?: string;
    categoryName: string;
    description: string;
    totalAmount: number;
    paidNowAmount: number;
    paymentMethod?: AccountingPaymentMethod;
    accountId?: string;
    beneficiary: string;
    invoiceNumber?: string;
    notes?: string;
    attachments?: AccountingAttachment[];
    requireApproval?: boolean;
  },
  actor: StaffActor,
  options?: { issueDisbursementVoucher?: boolean },
): Promise<AccountingExpense> {
  const total = Math.round(num(input.totalAmount) * 100) / 100;
  const paidNow = Math.round(num(input.paidNowAmount) * 100) / 100;
  if (total <= 0) throw new Error('إجمالي المصروف يجب أن يكون أكبر من صفر');
  if (paidNow < 0 || paidNow > total) throw new Error('المبلغ المسدد لا يمكن أن يتجاوز إجمالي المصروف');
  if (paidNow > 0 && !input.accountId) {
    throw new Error('يرجى تحديد الخزينة أو الحساب البنكي للسداد');
  }

  const paymentStatus = paidNow === 0 ? 'unpaid' : paidNow < total ? 'partial' : 'paid';
  const docNumber = generateDocNumber('EXP', input.expenseDate);
  const expenseId = crypto.randomUUID();

  const payload = {
    id: expenseId,
    doc_number: docNumber,
    expense_date: input.expenseDate || cairoTodayStr(),
    category_id: input.categoryId || null,
    category_name: input.categoryName.trim(),
    description: input.description.trim(),
    total_amount: total,
    paid_amount: paidNow,
    payment_status: paymentStatus,
    payment_method: paidNow > 0 ? (input.paymentMethod || 'cash') : null,
    account_id: paidNow > 0 ? (input.accountId || null) : null,
    beneficiary: input.beneficiary.trim(),
    invoice_number: input.invoiceNumber?.trim() || null,
    responsible_staff_id: actor.userId || null,
    responsible_staff_name: actor.name,
    approval_status: input.requireApproval && paidNow === 0 ? 'pending' : 'approved',
    approved_by_name: input.requireApproval && paidNow === 0 ? null : actor.name,
    approved_at: input.requireApproval && paidNow === 0 ? null : new Date().toISOString(),
    notes: input.notes?.trim() || null,
    attachments: input.attachments || [],
    status: 'posted',
    created_by: actor.userId || null,
    created_by_name: actor.name,
  };

  const { data, error } = await supabase
    .from('accounting_expenses' as any)
    .insert(payload as any)
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || 'تعذر تسجيل المصروف');
  const expense = mapExpense(data as Row);

  if (paidNow > 0 && input.accountId) {
    const payId = crypto.randomUUID();
    await supabase.from('accounting_expense_payments' as any).insert({
      id: payId,
      expense_id: expense.id,
      payment_date: expense.expenseDate,
      amount: paidNow,
      payment_method: input.paymentMethod || 'cash',
      account_id: input.accountId,
      notes: 'دفعة عند التسجيل',
      status: 'posted',
      created_by: actor.userId || null,
      created_by_name: actor.name,
    } as any);

    await supabase.from('accounting_account_transactions' as any).insert({
      id: crypto.randomUUID(),
      account_id: input.accountId,
      transaction_date: expense.expenseDate,
      direction: 'out',
      entry_type: 'expense_payment',
      amount: paidNow,
      reference_table: 'accounting_expense_payments',
      reference_id: payId,
      description: `${expense.docNumber} - سداد مصروف: ${expense.description}`,
      created_by: actor.userId || null,
      created_by_name: actor.name,
    } as any);

    if (options?.issueDisbursementVoucher) {
      await createVoucherRecord(
        {
          voucherKind: 'disbursement',
          voucherDate: expense.expenseDate,
          partyName: expense.beneficiary,
          amount: paidNow,
          reason: expense.description,
          paymentMethod: input.paymentMethod || 'cash',
          accountId: input.accountId,
          affectsAccount: false,
          expenseId: expense.id,
          notes: `مرتبط بالمصروف ${expense.docNumber}`,
        },
        actor,
      );
    }
  }

  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'EXPENSE_CREATED',
    entityType: 'accounting_expense',
    entityId: expense.id,
    summary: `تسجيل مصروف ${expense.docNumber}: ${expense.description} (الإجمالي ${total} / المسدد ${paidNow} ج.م)`,
    newValues: payload,
  });

  return expense;
}

export async function payExistingExpense(
  expense: AccountingExpense,
  input: {
    amount: number;
    paymentDate: string;
    paymentMethod: AccountingPaymentMethod;
    accountId: string;
    notes?: string;
    issueDisbursementVoucher?: boolean;
  },
  actor: StaffActor,
): Promise<void> {
  if (expense.status === 'reversed') throw new Error('لا يمكن سداد مصروف معكوس');
  const payAmt = Math.round(num(input.amount) * 100) / 100;
  if (payAmt <= 0 || payAmt > expense.remainingAmount + 0.001) {
    throw new Error(`المبلغ المدفوع يجب أن يكون بين 1 و ${expense.remainingAmount} ج.م`);
  }
  if (!input.accountId) throw new Error('يرجى اختيار الحساب أو الخزينة');

  const newPaid = Math.round((expense.paidAmount + payAmt) * 100) / 100;
  const newStatus = newPaid >= expense.totalAmount - 0.001 ? 'paid' : 'partial';

  const payId = crypto.randomUUID();
  const { error: payErr } = await supabase.from('accounting_expense_payments' as any).insert({
    id: payId,
    expense_id: expense.id,
    payment_date: input.paymentDate || cairoTodayStr(),
    amount: payAmt,
    payment_method: input.paymentMethod,
    account_id: input.accountId,
    notes: input.notes?.trim() || null,
    status: 'posted',
    created_by: actor.userId || null,
    created_by_name: actor.name,
  } as any);
  if (payErr) throw new Error(payErr.message || 'تعذر تسجيل دفعة المصروف');

  const { error: updErr } = await supabase
    .from('accounting_expenses' as any)
    .update({
      paid_amount: newPaid,
      payment_status: newStatus,
      account_id: input.accountId,
      payment_method: input.paymentMethod,
      updated_by: actor.userId || null,
      updated_by_name: actor.name,
    } as any)
    .eq('id', expense.id);
  if (updErr) throw new Error(updErr.message || 'تعذر تحديث رصيد المصروف');

  await supabase.from('accounting_account_transactions' as any).insert({
    id: crypto.randomUUID(),
    account_id: input.accountId,
    transaction_date: input.paymentDate || cairoTodayStr(),
    direction: 'out',
    entry_type: 'expense_payment',
    amount: payAmt,
    reference_table: 'accounting_expense_payments',
    reference_id: payId,
    description: `${expense.docNumber} - سداد دفعة مصروف: ${expense.description}`,
    created_by: actor.userId || null,
    created_by_name: actor.name,
  } as any);

  if (input.issueDisbursementVoucher) {
    await createVoucherRecord(
      {
        voucherKind: 'disbursement',
        voucherDate: input.paymentDate || cairoTodayStr(),
        partyName: expense.beneficiary,
        amount: payAmt,
        reason: `سداد ${expense.description} (${expense.docNumber})`,
        paymentMethod: input.paymentMethod,
        accountId: input.accountId,
        affectsAccount: false,
        expenseId: expense.id,
      },
      actor,
    );
  }

  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'EXPENSE_PAYMENT_POSTED',
    entityType: 'accounting_expense',
    entityId: expense.id,
    summary: `سداد ${payAmt} ج.م على المصروف ${expense.docNumber} (المتبقي ${Math.max(expense.totalAmount - newPaid, 0)} ج.م)`,
  });
}

export async function reverseAccountingExpense(
  expense: AccountingExpense,
  payments: AccountingExpensePayment[],
  reason: string,
  actor: StaffActor,
): Promise<void> {
  if (expense.status === 'reversed') throw new Error('تم عكس هذا المصروف مسبقاً');
  if (!reason.trim()) throw new Error('يرجى إدخال سبب عكس المصروف');

  const { error } = await supabase
    .from('accounting_expenses' as any)
    .update({
      status: 'reversed',
      reversal_reason: reason.trim(),
      reversed_by: actor.userId || null,
      reversed_by_name: actor.name,
      reversed_at: new Date().toISOString(),
    } as any)
    .eq('id', expense.id);
  if (error) throw new Error(error.message || 'تعذر عكس المصروف');

  const activePayments = payments.filter((p) => p.expenseId === expense.id && p.status === 'posted');
  for (const p of activePayments) {
    await supabase
      .from('accounting_expense_payments' as any)
      .update({ status: 'reversed' } as any)
      .eq('id', p.id);

    await supabase.from('accounting_account_transactions' as any).insert({
      id: crypto.randomUUID(),
      account_id: p.accountId,
      transaction_date: cairoTodayStr(),
      direction: 'in',
      entry_type: 'expense_reversal',
      amount: p.amount,
      reference_table: 'accounting_expense_payments',
      reference_id: p.id,
      description: `عكس سداد مصروف ${expense.docNumber}: ${reason.trim()}`,
      created_by: actor.userId || null,
      created_by_name: actor.name,
    } as any);
  }

  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'EXPENSE_REVERSED',
    entityType: 'accounting_expense',
    entityId: expense.id,
    summary: `عكس المصروف ${expense.docNumber} وإرجاع المبالغ المسددة (${expense.paidAmount} ج.م)`,
    reason: reason.trim(),
  });
}

export async function createAccountTransfer(
  input: {
    transferDate: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    notes?: string;
  },
  actor: StaffActor,
): Promise<AccountingTransfer> {
  if (!input.fromAccountId || !input.toAccountId) throw new Error('يرجى تحديد الحساب المحول منه والمحول إليه');
  if (input.fromAccountId === input.toAccountId) throw new Error('لا يمكن التحويل إلى نفس الحساب');
  const amt = Math.round(num(input.amount) * 100) / 100;
  if (amt <= 0) throw new Error('مبلغ التحويل يجب أن يكون أكبر من صفر');

  const id = crypto.randomUUID();
  const transferNumber = generateDocNumber('TRF', input.transferDate);
  const payload = {
    id,
    transfer_number: transferNumber,
    transfer_date: input.transferDate || cairoTodayStr(),
    from_account_id: input.fromAccountId,
    to_account_id: input.toAccountId,
    amount: amt,
    notes: input.notes?.trim() || null,
    status: 'posted',
    created_by: actor.userId || null,
    created_by_name: actor.name,
  };
  const { data, error } = await supabase
    .from('accounting_transfers' as any)
    .insert(payload as any)
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || 'تعذر تنفيذ التحويل بين الحسابات');

  await supabase.from('accounting_account_transactions' as any).insert([
    {
      id: crypto.randomUUID(),
      account_id: input.fromAccountId,
      transaction_date: payload.transfer_date,
      direction: 'out',
      entry_type: 'transfer_out',
      amount: amt,
      reference_table: 'accounting_transfers',
      reference_id: id,
      description: `تحويل صادر ${transferNumber}`,
      created_by: actor.userId || null,
      created_by_name: actor.name,
    },
    {
      id: crypto.randomUUID(),
      account_id: input.toAccountId,
      transaction_date: payload.transfer_date,
      direction: 'in',
      entry_type: 'transfer_in',
      amount: amt,
      reference_table: 'accounting_transfers',
      reference_id: id,
      description: `تحويل وارد ${transferNumber}`,
      created_by: actor.userId || null,
      created_by_name: actor.name,
    },
  ] as any);

  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'TRANSFER_CREATED',
    entityType: 'accounting_transfer',
    entityId: id,
    summary: `تحويل مالي ${transferNumber} بقيمة ${amt} ج.م (لا يُحتسب ضمن الإيرادات أو المصروفات)`,
    newValues: payload,
  });

  return mapTransfer(data as Row);
}

export async function createVoucherRecord(
  input: {
    voucherKind: VoucherKind;
    voucherDate: string;
    partyName: string;
    amount: number;
    reason: string;
    paymentMethod: AccountingPaymentMethod;
    accountId?: string;
    affectsAccount: boolean;
    bookingId?: string;
    patientId?: string;
    revenueId?: string;
    expenseId?: string;
    notes?: string;
  },
  actor: StaffActor,
): Promise<AccountingVoucher> {
  const amt = Math.round(num(input.amount) * 100) / 100;
  if (amt <= 0) throw new Error('قيمة السند يجب أن تكون أكبر من صفر');
  if (input.affectsAccount && !input.accountId) {
    throw new Error('يرجى تحديد الخزينة أو الحساب البنكي للسند');
  }

  const id = crypto.randomUUID();
  const voucherNumber = generateDocNumber(
    input.voucherKind === 'receipt' ? 'RCV' : 'PAY',
    input.voucherDate,
  );

  const payload = {
    id,
    voucher_kind: input.voucherKind,
    voucher_number: voucherNumber,
    voucher_date: input.voucherDate || cairoTodayStr(),
    party_name: input.partyName.trim(),
    amount: amt,
    reason: input.reason.trim(),
    payment_method: input.paymentMethod,
    account_id: input.accountId || null,
    affects_account: input.affectsAccount,
    booking_id: input.bookingId || null,
    patient_id: input.patientId || null,
    revenue_id: input.revenueId || null,
    expense_id: input.expenseId || null,
    responsible_staff_id: actor.userId || null,
    responsible_staff_name: actor.name,
    notes: input.notes?.trim() || null,
    status: 'posted',
    created_by: actor.userId || null,
    created_by_name: actor.name,
  };

  const { data, error } = await supabase
    .from('accounting_vouchers' as any)
    .insert(payload as any)
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || 'تعذر حفظ السند');

  if (input.affectsAccount && input.accountId) {
    await supabase.from('accounting_account_transactions' as any).insert({
      id: crypto.randomUUID(),
      account_id: input.accountId,
      transaction_date: payload.voucher_date,
      direction: input.voucherKind === 'receipt' ? 'in' : 'out',
      entry_type: input.voucherKind === 'receipt' ? 'voucher_receipt' : 'voucher_disbursement',
      amount: amt,
      reference_table: 'accounting_vouchers',
      reference_id: id,
      description: `${voucherNumber} - ${input.partyName.trim()} (${input.reason.trim()})`,
      created_by: actor.userId || null,
      created_by_name: actor.name,
    } as any);
  }

  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: input.voucherKind === 'receipt' ? 'RECEIPT_VOUCHER_CREATED' : 'DISBURSEMENT_VOUCHER_CREATED',
    entityType: 'accounting_voucher',
    entityId: id,
    summary: `إصدار ${input.voucherKind === 'receipt' ? 'سند قبض' : 'سند صرف'} ${voucherNumber} بمبلغ ${amt} ج.م`,
    newValues: payload,
  });

  return mapVoucher(data as Row);
}

export async function loadUnlinkedConfirmedPayments(
  revenues: AccountingRevenue[],
): Promise<ExternalPaymentSourceRow[]> {
  const linkedKeys = new Set(
    revenues
      .filter((r) => r.status === 'posted' && r.sourceTable && r.sourceId)
      .map((r) => `${r.sourceTable}:${r.sourceId}`),
  );

  const [payRes, instaRes, paymobRes] = await Promise.all([
    supabase.from('payments').select('*').eq('status', 'paid').order('created_at', { ascending: false }).limit(300),
    supabase.from('instapay_submissions' as any).select('*').eq('status', 'PAID').order('created_at', { ascending: false }).limit(300),
    supabase.from('paymob_payments' as any).select('*').eq('status', 'paid').order('created_at', { ascending: false }).limit(300),
  ]);

  const results: ExternalPaymentSourceRow[] = [];
  const linkedPaymentsFromChildren = new Set<string>();

  for (const row of ((instaRes.data || []) as Row[])) {
    if (row.payment_id) linkedPaymentsFromChildren.add(String(row.payment_id));
    const key = `instapay_submissions:${row.id}`;
    if (linkedKeys.has(key)) continue;
    if (row.payment_id && linkedKeys.has(`payments:${row.payment_id}`)) continue;
    results.push({
      sourceTable: 'instapay_submissions',
      sourceId: String(row.id),
      bookingId: row.booking_id ? String(row.booking_id) : undefined,
      patientName: String(row.booking_ref || 'تحويل إنستاباي'),
      amount: num(row.verified_amount ?? row.amount_due),
      paymentMethod: 'instapay',
      reference: String(row.transaction_ref || row.booking_ref || ''),
      date: String(row.reviewed_at || row.created_at || cairoTodayStr()).slice(0, 10),
    });
  }

  for (const row of ((paymobRes.data || []) as Row[])) {
    if (row.payment_id) linkedPaymentsFromChildren.add(String(row.payment_id));
    const key = `paymob_payments:${row.id}`;
    if (linkedKeys.has(key)) continue;
    if (row.payment_id && linkedKeys.has(`payments:${row.payment_id}`)) continue;
    results.push({
      sourceTable: 'paymob_payments',
      sourceId: String(row.id),
      bookingId: row.booking_id ? String(row.booking_id) : undefined,
      patientName: String(row.reference || 'دفع Paymob'),
      amount: Math.round((num(row.amount_cents) / 100) * 100) / 100,
      paymentMethod: row.source_type === 'wallet' ? 'wallet' : 'paymob',
      reference: String(row.reference || row.transaction_id || ''),
      date: String(row.updated_at || row.created_at || cairoTodayStr()).slice(0, 10),
    });
  }

  for (const row of ((payRes.data || []) as Row[])) {
    if (linkedPaymentsFromChildren.has(String(row.id))) continue;
    const key = `payments:${row.id}`;
    if (linkedKeys.has(key)) continue;
    results.push({
      sourceTable: 'payments',
      sourceId: String(row.id),
      bookingId: row.booking_id ? String(row.booking_id) : undefined,
      patientName: String(row.patient_name || ''),
      patientPhone: row.patient_phone ? String(row.patient_phone) : undefined,
      amount: num(row.amount),
      paymentMethod:
        row.payment_type === 'instapay'
          ? 'instapay'
          : row.payment_type === 'wallet'
            ? 'wallet'
            : 'paymob',
      reference: String(row.transaction_id || ''),
      date: String(row.matched_at || row.created_at || cairoTodayStr()).slice(0, 10),
    });
  }

  return results;
}

export function buildBookingFinancialRows(params: {
  rawBookings: Row[];
  doctors: { name: string; fee: number }[];
  services: { title: string; price: number }[];
  revenues: AccountingRevenue[];
  externalPayments: ExternalPaymentSourceRow[];
}): BookingFinancialRow[] {
  const { rawBookings, doctors, services, revenues, externalPayments } = params;
  return rawBookings.map((b) => {
    const uuid = String(b.id);
    const doctor = doctors.find((d) => d.name === b.doctor_name);
    const estimatedValue = computeBookingExpectedFee(String(b.service || ''), doctor, services);
    const postedRevs = revenues.filter((r) => r.status === 'posted' && r.bookingId === uuid);
    const recognizedRevenueAmount = postedRevs.reduce((acc, r) => acc + r.amount, 0);
    const pendingExt = externalPayments
      .filter((p) => p.bookingId === uuid)
      .reduce((acc, p) => acc + p.amount, 0);
    const collectedAmount =
      recognizedRevenueAmount > 0 || pendingExt > 0
        ? recognizedRevenueAmount + pendingExt
        : b.payment_status === 'paid' && b.status !== 'cancelled'
          ? estimatedValue
          : 0;
    const status = b.status === 'cancelled' ? 'cancelled' : 'confirmed';
    const remainingAmount =
      status === 'cancelled' ? 0 : Math.max(estimatedValue - collectedAmount, 0);
    return {
      bookingUuid: uuid,
      numericBookingId: parseInt(uuid.slice(-8), 16) || 0,
      patientName: String(b.patient_name || ''),
      phone: String(b.phone || ''),
      doctorName: String(b.doctor_name || ''),
      service: String(b.service || ''),
      date: String(b.date || ''),
      time: String(b.time || ''),
      status,
      bookingType: b.booking_type === 'contract' ? 'contract' : 'cash',
      bookingSource: (b.booking_source as 'website' | 'staff' | 'admin') || 'website',
      contractingCompanyId: typeof b.contracting_company_id === 'number' ? b.contracting_company_id : undefined,
      estimatedValue,
      collectedAmount,
      recognizedRevenueAmount,
      remainingAmount,
      needsRefundOrReversal: status === 'cancelled' && recognizedRevenueAmount > 0,
      paymentStatus: String(b.payment_status || 'pending'),
      paymentMethod: b.payment_method ? String(b.payment_method) : undefined,
    };
  });
}

export function computeAccountingDashboardMetrics(params: {
  bundle: AccountingBundle;
  bookingFinancials: BookingFinancialRow[];
  startDate: string;
  endDate: string;
  todayStr?: string;
}) {
  const { bundle, bookingFinancials, startDate, endDate } = params;
  const todayStr = params.todayStr || cairoTodayStr();
  const monthPrefix = todayStr.slice(0, 7);

  const postedRevenues = bundle.revenues.filter((r) => r.status === 'posted');
  const postedExpenses = bundle.expenses.filter((e) => e.status === 'posted');

  const inRange = (d: string) => (!startDate || d >= startDate) && (!endDate || d <= endDate);

  const periodRevenues = postedRevenues.filter((r) => inRange(r.revenueDate));
  const periodExpenses = postedExpenses.filter((e) => inRange(e.expenseDate));

  const dailyRevenues = postedRevenues
    .filter((r) => r.revenueDate === todayStr)
    .reduce((s, r) => s + r.amount, 0);
  const monthlyRevenues = postedRevenues
    .filter((r) => r.revenueDate.startsWith(monthPrefix))
    .reduce((s, r) => s + r.amount, 0);

  const dailyExpenses = postedExpenses
    .filter((e) => e.expenseDate === todayStr)
    .reduce((s, e) => s + e.totalAmount, 0);
  const monthlyExpenses = postedExpenses
    .filter((e) => e.expenseDate.startsWith(monthPrefix))
    .reduce((s, e) => s + e.totalAmount, 0);

  const periodRefundTxns = (bundle.billingTransactions || []).filter(
    (t) =>
      t.transactionKind === 'refund' &&
      t.status === 'confirmed' &&
      inRange((t.createdAt || '').slice(0, 10)) &&
      // Only subtract partial refunds not already reversed on accounting_revenues
      bundle.revenues.some((r) => r.bookingId === t.bookingId && r.status === 'posted'),
  );
  const periodPartialRefunds = periodRefundTxns.reduce((s, t) => s + t.amount, 0);

  const periodRevenueTotal = Math.max(periodRevenues.reduce((s, r) => s + r.amount, 0) - periodPartialRefunds, 0);
  const periodExpenseTotal = periodExpenses.reduce((s, e) => s + e.totalAmount, 0);
  const netOperatingProfit = periodRevenueTotal - periodExpenseTotal;

  const cashboxBalance = bundle.accounts
    .filter((a) => a.accountType === 'cashbox' && a.isActive)
    .reduce((s, a) => s + computeAccountBalance(a, bundle.transactions), 0);

  const bankBalance = bundle.accounts
    .filter((a) => a.accountType === 'bank' && a.isActive)
    .reduce((s, a) => s + computeAccountBalance(a, bundle.transactions), 0);

  const uncollectedBookingReceivables = bookingFinancials
    .filter((b) => b.status === 'confirmed' && inRange(b.date))
    .reduce((s, b) => s + b.remainingAmount, 0);

  const unpaidExpensePayables = postedExpenses.reduce((s, e) => s + e.remainingAmount, 0);

  const paidBookingsCount = bookingFinancials.filter(
    (b) => b.status === 'confirmed' && inRange(b.date) && (b.paymentStatus === 'paid' || b.recognizedRevenueAmount > 0),
  ).length;
  const unpaidBookingsCount = bookingFinancials.filter(
    (b) => b.status === 'confirmed' && inRange(b.date) && b.paymentStatus !== 'paid' && b.recognizedRevenueAmount === 0,
  ).length;

  const groupSum = (fn: (r: AccountingRevenue) => string) => {
    const map = new Map<string, { label: string; amount: number; count: number }>();
    for (const r of periodRevenues) {
      const k = fn(r);
      const cur = map.get(k) || { label: k, amount: 0, count: 0 };
      cur.amount += r.amount;
      cur.count += 1;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  };

  return {
    dailyRevenues,
    monthlyRevenues,
    dailyExpenses,
    monthlyExpenses,
    periodRevenueTotal,
    periodExpenseTotal,
    netOperatingProfit,
    cashboxBalance,
    bankBalance,
    uncollectedBookingReceivables,
    unpaidExpensePayables,
    paidBookingsCount,
    unpaidBookingsCount,
    revenueByDoctor: groupSum((r) => r.doctorName || 'غير محدد بطبيب'),
    revenueByService: groupSum((r) => r.serviceName || r.categoryName || 'أخرى'),
    revenueByBookingSource: groupSum((r) =>
      r.bookingSource === 'website'
        ? 'الموقع الإلكتروني'
        : r.bookingSource === 'staff'
          ? 'حجوزات الموظفين'
          : r.bookingSource === 'admin'
            ? 'حجوزات الإدارة'
            : 'إيراد مباشر / أخرى',
    ),
  };
}

export function exportRowsToCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const esc = (v: string | number) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportRowsToExcel(filename: string, title: string, headers: string[], rows: (string | number)[][]): void {
  const cleanTitle = DOMPurify.sanitize(title);
  const table = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" lang="ar" dir="rtl"><head><meta charset="utf-8" /><title>${cleanTitle}</title></head><body><h3>${cleanTitle}</h3><table border="1"><thead><tr>${headers.map((h) => `<th>${DOMPurify.sanitize(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${DOMPurify.sanitize(String(c ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
  const blob = new Blob(['\uFEFF' + table], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function approveAccountingExpense(
  expense: AccountingExpense,
  decision: 'approved' | 'rejected',
  actor: StaffActor,
): Promise<void> {
  if (expense.status === 'reversed') throw new Error('لا يمكن اعتماد مصروف معكوس');
  const { error } = await supabase
    .from('accounting_expenses' as any)
    .update({
      approval_status: decision,
      approved_by_name: actor.name,
      approved_at: new Date().toISOString(),
      updated_by: actor.userId || null,
      updated_by_name: actor.name,
    } as any)
    .eq('id', expense.id);
  if (error) throw new Error(error.message || 'تعذر تحديث حالة اعتماد المصروف');
  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: decision === 'approved' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
    entityType: 'accounting_expense',
    entityId: expense.id,
    summary: `${decision === 'approved' ? 'اعتماد' : 'رفض'} المصروف ${expense.docNumber} (${expense.description})`,
  });
}

export async function reverseAccountingTransfer(
  transfer: AccountingTransfer,
  reason: string,
  actor: StaffActor,
): Promise<void> {
  if (transfer.status === 'reversed') throw new Error('تم عكس هذا التحويل مسبقاً');
  if (!reason.trim()) throw new Error('يرجى إدخال سبب عكس التحويل');

  const { error } = await supabase
    .from('accounting_transfers' as any)
    .update({
      status: 'reversed',
      reversal_reason: reason.trim(),
    } as any)
    .eq('id', transfer.id);
  if (error) throw new Error(error.message || 'تعذر عكس التحويل');

  await supabase.from('accounting_account_transactions' as any).insert([
    {
      id: crypto.randomUUID(),
      account_id: transfer.fromAccountId,
      transaction_date: cairoTodayStr(),
      direction: 'in',
      entry_type: 'transfer_reversal',
      amount: transfer.amount,
      reference_table: 'accounting_transfers',
      reference_id: transfer.id,
      description: `عكس تحويل صادر ${transfer.transferNumber}: ${reason.trim()}`,
      created_by: actor.userId || null,
      created_by_name: actor.name,
    },
    {
      id: crypto.randomUUID(),
      account_id: transfer.toAccountId,
      transaction_date: cairoTodayStr(),
      direction: 'out',
      entry_type: 'transfer_reversal',
      amount: transfer.amount,
      reference_table: 'accounting_transfers',
      reference_id: transfer.id,
      description: `عكس تحويل وارد ${transfer.transferNumber}: ${reason.trim()}`,
      created_by: actor.userId || null,
      created_by_name: actor.name,
    },
  ] as any);

  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'TRANSFER_REVERSED',
    entityType: 'accounting_transfer',
    entityId: transfer.id,
    summary: `عكس التحويل ${transfer.transferNumber} بمبلغ ${transfer.amount} ج.م`,
    reason: reason.trim(),
  });
}

export async function reverseAccountingVoucher(
  voucher: AccountingVoucher,
  reason: string,
  actor: StaffActor,
): Promise<void> {
  if (voucher.status === 'reversed') throw new Error('تم عكس هذا السند مسبقاً');
  if (!reason.trim()) throw new Error('يرجى إدخال سبب عكس السند');

  const { error } = await supabase
    .from('accounting_vouchers' as any)
    .update({
      status: 'reversed',
      reversal_reason: reason.trim(),
    } as any)
    .eq('id', voucher.id);
  if (error) throw new Error(error.message || 'تعذر عكس السند');

  if (voucher.affectsAccount && voucher.accountId) {
    await supabase.from('accounting_account_transactions' as any).insert({
      id: crypto.randomUUID(),
      account_id: voucher.accountId,
      transaction_date: cairoTodayStr(),
      direction: voucher.voucherKind === 'receipt' ? 'out' : 'in',
      entry_type: 'voucher_reversal',
      amount: voucher.amount,
      reference_table: 'accounting_vouchers',
      reference_id: voucher.id,
      description: `عكس سند ${voucher.voucherNumber}: ${reason.trim()}`,
      created_by: actor.userId || null,
      created_by_name: actor.name,
    } as any);
  }

  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'VOUCHER_REVERSED',
    entityType: 'accounting_voucher',
    entityId: voucher.id,
    summary: `عكس السند ${voucher.voucherNumber} بمبلغ ${voucher.amount} ج.م`,
    reason: reason.trim(),
  });
}

export async function createAccountingCategory(
  input: { kind: 'revenue' | 'expense'; nameAr: string; code?: string; description?: string },
  actor: StaffActor,
): Promise<AccountingCategory> {
  const cleanName = input.nameAr.trim();
  if (!cleanName) throw new Error('يرجى إدخال اسم التصنيف');
  const id = crypto.randomUUID();
  const code = (input.code?.trim() || `${input.kind === 'revenue' ? 'REV' : 'EXP'}_${Date.now().toString().slice(-5)}`).toUpperCase();
  const payload = {
    id,
    kind: input.kind,
    code,
    name_ar: cleanName,
    description: input.description?.trim() || null,
    is_system: false,
    is_active: true,
    display_order: 150,
  };
  const { data, error } = await supabase
    .from('accounting_categories' as any)
    .insert(payload as any)
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || 'تعذر إضافة التصنيف');
  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'CATEGORY_CREATED',
    entityType: 'accounting_category',
    entityId: id,
    summary: `إضافة تصنيف ${input.kind === 'revenue' ? 'إيراد' : 'مصروف'}: ${cleanName}`,
  });
  return mapCategory(data as Row);
}

export async function toggleAccountingCategory(
  category: AccountingCategory,
  isActive: boolean,
  actor: StaffActor,
): Promise<void> {
  const { error } = await supabase
    .from('accounting_categories' as any)
    .update({ is_active: isActive } as any)
    .eq('id', category.id);
  if (error) throw new Error(error.message || 'تعذر تحديث حالة التصنيف');
  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'CATEGORY_TOGGLED',
    entityType: 'accounting_category',
    entityId: category.id,
    summary: `${isActive ? 'تفعيل' : 'تعطيل'} التصنيف ${category.nameAr}`,
  });
}

export async function updateAccountingSettings(
  settings: Partial<AccountingSettingsRecord>,
  actor: StaffActor,
): Promise<void> {
  const payload = {
    id: 1,
    clinic_tax_number: settings.clinicTaxNumber?.trim() || null,
    fiscal_year_start_month: Math.min(Math.max(Number(settings.fiscalYearStartMonth || 1), 1), 12),
    require_expense_approval: Boolean(settings.requireExpenseApproval),
    lock_before_date: settings.lockBeforeDate || null,
    default_currency: settings.defaultCurrency || 'EGP',
    voucher_notes_footer: settings.voucherNotesFooter?.trim() || null,
    updated_by: actor.userId || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('accounting_settings' as any)
    .upsert(payload as any, { onConflict: 'id' });
  if (error) throw new Error(error.message || 'تعذر حفظ إعدادات الحسابات');
  await recordClinicAudit({
    actorUserId: actor.userId,
    actorName: actor.name,
    module: 'accounting',
    action: 'SETTINGS_UPDATED',
    entityType: 'accounting_settings',
    entityId: '1',
    summary: 'تحديث إعدادات النظام المحاسبي',
    newValues: payload,
  });
}

export interface AccountingReportFilters {
  startDate: string;
  endDate: string;
  doctorName?: string;
  serviceName?: string;
  paymentMethod?: string;
  accountId?: string;
  bookingSource?: string;
  contractingCompanyId?: string;
  staffName?: string;
}

export interface BuiltAccountingReport {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  summaryItems: { label: string; value: string }[];
  restricted?: boolean;
}

export function buildAccountingReportData(params: {
  reportId: AccountingReportId;
  bundle: AccountingBundle;
  bookingFinancials: BookingFinancialRow[];
  contractingList: { id: number; name: string }[];
  filters: AccountingReportFilters;
  canViewSensitive: boolean;
}): BuiltAccountingReport {
  const { reportId, bundle, bookingFinancials, contractingList, filters, canViewSensitive } = params;

  const sensitiveReports: AccountingReportId[] = [
    'net_profit',
    'bank_accounts',
    'monthly_comparison',
    'yearly_comparison',
  ];
  if (sensitiveReports.includes(reportId) && !canViewSensitive) {
    return {
      title: 'بيانات مالية مقيدة الصلاحية',
      headers: ['الحالة'],
      rows: [['ليست لديك صلاحية عرض البيانات المالية الحساسة لهذا التقرير']],
      summaryItems: [],
      restricted: true,
    };
  }

  const inDateRange = (d: string) =>
    (!filters.startDate || d >= filters.startDate) && (!filters.endDate || d <= filters.endDate);

  const accountNameById = new Map(bundle.accounts.map((a) => [a.id, a.name]));
  const companyNameById = new Map(contractingList.map((c) => [c.id, c.name]));

  const filteredRevs = bundle.revenues.filter((r) => {
    if (r.status !== 'posted') return false;
    if (!inDateRange(r.revenueDate)) return false;
    if (filters.doctorName && (r.doctorName || '') !== filters.doctorName) return false;
    if (filters.serviceName && (r.serviceName || '') !== filters.serviceName) return false;
    if (filters.paymentMethod && r.paymentMethod !== filters.paymentMethod) return false;
    if (filters.accountId && (r.accountId || '') !== filters.accountId) return false;
    if (filters.bookingSource && (r.bookingSource || '') !== filters.bookingSource) return false;
    if (filters.contractingCompanyId && String(r.contractingCompanyId || '') !== filters.contractingCompanyId) return false;
    if (filters.staffName && (r.responsibleStaffName || r.createdByName || '') !== filters.staffName) return false;
    return true;
  });

  const filteredExps = bundle.expenses.filter((e) => {
    if (e.status !== 'posted') return false;
    if (!inDateRange(e.expenseDate)) return false;
    if (filters.paymentMethod && (e.paymentMethod || '') !== filters.paymentMethod) return false;
    if (filters.accountId && (e.accountId || '') !== filters.accountId) return false;
    if (filters.staffName && (e.responsibleStaffName || e.createdByName || '') !== filters.staffName) return false;
    return true;
  });

  switch (reportId) {
    case 'revenues': {
      const total = filteredRevs.reduce((s, r) => s + r.amount, 0);
      return {
        title: 'تقرير الإيرادات',
        headers: ['رقم القيد', 'التاريخ', 'التصنيف', 'المصدر', 'البيان', 'طريقة الدفع', 'الحساب', 'المبلغ (ج.م)', 'الموظف'],
        rows: filteredRevs.map((r) => [
          r.docNumber,
          r.revenueDate,
          r.categoryName,
          REVENUE_SOURCE_LABELS[r.revenueSource] || r.revenueSource,
          r.description,
          PAYMENT_METHOD_LABELS[r.paymentMethod] || r.paymentMethod,
          (r.accountId && accountNameById.get(r.accountId)) || '-',
          r.amount,
          r.responsibleStaffName || r.createdByName || '-',
        ]),
        summaryItems: [
          { label: 'عدد قيود الإيراد', value: String(filteredRevs.length) },
          { label: 'إجمالي الإيرادات', value: `${total.toLocaleString('en-US')} ج.م` },
        ],
      };
    }

    case 'expenses': {
      const total = filteredExps.reduce((s, e) => s + e.totalAmount, 0);
      const paid = filteredExps.reduce((s, e) => s + e.paidAmount, 0);
      const rem = filteredExps.reduce((s, e) => s + e.remainingAmount, 0);
      return {
        title: 'تقرير المصروفات',
        headers: ['رقم القيد', 'التاريخ', 'التصنيف', 'المستفيد', 'البيان', 'الإجمالي', 'المسدد', 'المتبقي', 'الحالة'],
        rows: filteredExps.map((e) => [
          e.docNumber,
          e.expenseDate,
          e.categoryName,
          e.beneficiary,
          e.description,
          e.totalAmount,
          e.paidAmount,
          e.remainingAmount,
          EXPENSE_PAYMENT_STATUS_LABELS[e.paymentStatus],
        ]),
        summaryItems: [
          { label: 'إجمالي المصروفات', value: `${total.toLocaleString('en-US')} ج.م` },
          { label: 'المسدد', value: `${paid.toLocaleString('en-US')} ج.م` },
          { label: 'المتبقي غير المسدد', value: `${rem.toLocaleString('en-US')} ج.م` },
        ],
      };
    }

    case 'net_profit': {
      const revTotal = filteredRevs.reduce((s, r) => s + r.amount, 0);
      const expTotal = filteredExps.reduce((s, e) => s + e.totalAmount, 0);
      const net = revTotal - expTotal;
      const byDay = new Map<string, { rev: number; exp: number }>();
      for (const r of filteredRevs) {
        const cur = byDay.get(r.revenueDate) || { rev: 0, exp: 0 };
        cur.rev += r.amount;
        byDay.set(r.revenueDate, cur);
      }
      for (const e of filteredExps) {
        const cur = byDay.get(e.expenseDate) || { rev: 0, exp: 0 };
        cur.exp += e.totalAmount;
        byDay.set(e.expenseDate, cur);
      }
      const rows = [...byDay.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([day, val]) => [day, val.rev, val.exp, val.rev - val.exp]);
      return {
        title: 'تقرير صافي الربح التشغيلي',
        headers: ['التاريخ', 'الإيرادات (ج.م)', 'المصروفات (ج.م)', 'صافي الربح (ج.م)'],
        rows,
        summaryItems: [
          { label: 'إجمالي الإيرادات', value: `${revTotal.toLocaleString('en-US')} ج.م` },
          { label: 'إجمالي المصروفات', value: `${expTotal.toLocaleString('en-US')} ج.م` },
          { label: 'صافي الربح التشغيلي', value: `${net.toLocaleString('en-US')} ج.م` },
        ],
      };
    }

    case 'cashboxes':
    case 'bank_accounts': {
      const targetType = reportId === 'cashboxes' ? 'cashbox' : 'bank';
      const accs = bundle.accounts.filter((a) => a.accountType === targetType);
      const rows = accs.map((a) => {
        const txns = bundle.transactions.filter((t) => t.accountId === a.id && inDateRange(t.transactionDate));
        const totalIn = txns.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0);
        const totalOut = txns.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount, 0);
        const currentBal = computeAccountBalance(a, bundle.transactions);
        return [
          a.name,
          a.accountType === 'bank' ? a.bankName || '-' : 'خزينة نقدية',
          a.openingBalance,
          totalIn,
          totalOut,
          currentBal,
          a.isActive ? 'نشط' : 'موقوف',
        ];
      });
      const totalBal = accs.reduce((s, a) => s + computeAccountBalance(a, bundle.transactions), 0);
      return {
        title: reportId === 'cashboxes' ? 'تقرير الخزائن النقدية' : 'تقرير الحسابات البنكية',
        headers: ['اسم الحساب', 'الجهة / النوع', 'الرصيد الافتتاحي', 'إجمالي الوارد (الفترة)', 'إجمالي الصادر (الفترة)', 'الرصيد الحالي', 'الحالة'],
        rows,
        summaryItems: [
          { label: 'عدد الحسابات', value: String(accs.length) },
          { label: 'إجمالي الأرصدة الحالية', value: `${totalBal.toLocaleString('en-US')} ج.م` },
        ],
      };
    }

    case 'receipt_vouchers':
    case 'disbursement_vouchers': {
      const kind = reportId === 'receipt_vouchers' ? 'receipt' : 'disbursement';
      const list = bundle.vouchers.filter(
        (v) =>
          v.voucherKind === kind &&
          v.status === 'posted' &&
          inDateRange(v.voucherDate) &&
          (!filters.paymentMethod || v.paymentMethod === filters.paymentMethod) &&
          (!filters.accountId || (v.accountId || '') === filters.accountId) &&
          (!filters.staffName || (v.responsibleStaffName || v.createdByName || '') === filters.staffName),
      );
      const total = list.reduce((s, v) => s + v.amount, 0);
      return {
        title: kind === 'receipt' ? 'تقرير سندات القبض' : 'تقرير سندات الصرف',
        headers: ['رقم السند', 'التاريخ', kind === 'receipt' ? 'المستلم منه' : 'المصروف له', 'السبب / البيان', 'الوسيلة', 'الحساب', 'المبلغ (ج.م)'],
        rows: list.map((v) => [
          v.voucherNumber,
          v.voucherDate,
          v.partyName,
          v.reason,
          PAYMENT_METHOD_LABELS[v.paymentMethod] || v.paymentMethod,
          (v.accountId && accountNameById.get(v.accountId)) || '-',
          v.amount,
        ]),
        summaryItems: [
          { label: 'عدد السندات', value: String(list.length) },
          { label: 'الإجمالي', value: `${total.toLocaleString('en-US')} ج.م` },
        ],
      };
    }

    case 'receivables_due': {
      const dueBookings = bookingFinancials.filter(
        (b) =>
          b.status === 'confirmed' &&
          b.remainingAmount > 0 &&
          inDateRange(b.date) &&
          (!filters.doctorName || b.doctorName === filters.doctorName) &&
          (!filters.serviceName || b.service === filters.serviceName) &&
          (!filters.bookingSource || b.bookingSource === filters.bookingSource) &&
          (!filters.contractingCompanyId || String(b.contractingCompanyId || '') === filters.contractingCompanyId),
      );
      const unpaidExpenses = filteredExps.filter((e) => e.remainingAmount > 0);
      const totalReceivables = dueBookings.reduce((s, b) => s + b.remainingAmount, 0);
      const totalPayables = unpaidExpenses.reduce((s, e) => s + e.remainingAmount, 0);
      const rows: (string | number)[][] = [
        ...dueBookings.map((b) => [
          'مستحق من حجز',
          b.date,
          b.patientName,
          `${b.doctorName} - ${b.service}`,
          b.estimatedValue,
          b.collectedAmount,
          b.remainingAmount,
        ]),
        ...unpaidExpenses.map((e) => [
          'التزام مصروف',
          e.expenseDate,
          e.beneficiary,
          `${e.categoryName} - ${e.description}`,
          e.totalAmount,
          e.paidAmount,
          e.remainingAmount,
        ]),
      ];
      return {
        title: 'تقرير المبالغ المستحقة وغير المحصلة',
        headers: ['النوع', 'التاريخ', 'الطرف', 'التفاصيل', 'القيمة الإجمالية', 'المحصل / المسدد', 'المتبقي (ج.م)'],
        rows,
        summaryItems: [
          { label: 'مستحقات حجوزات غير محصلة', value: `${totalReceivables.toLocaleString('en-US')} ج.م` },
          { label: 'مصروفات غير مسددة', value: `${totalPayables.toLocaleString('en-US')} ج.م` },
        ],
      };
    }

    case 'by_doctor':
    case 'by_service':
    case 'by_booking_source':
    case 'by_contracting': {
      const map = new Map<string, { count: number; amount: number }>();
      for (const r of filteredRevs) {
        let key = 'أخرى';
        if (reportId === 'by_doctor') key = r.doctorName || 'غير مرتبط بطبيب';
        else if (reportId === 'by_service') key = r.serviceName || r.categoryName || 'غير محدد';
        else if (reportId === 'by_booking_source') {
          key =
            r.bookingSource === 'website'
              ? 'الموقع الإلكتروني'
              : r.bookingSource === 'staff'
                ? 'حجوزات الموظفين'
                : r.bookingSource === 'admin'
                  ? 'حجوزات الإدارة'
                  : 'إيراد مباشر / أخرى';
        } else if (reportId === 'by_contracting') {
          key = r.contractingCompanyId ? (companyNameById.get(r.contractingCompanyId) || `تعاقد #${r.contractingCompanyId}`) : 'حساب خاص / بدون تعاقد';
        }
        const cur = map.get(key) || { count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += r.amount;
        map.set(key, cur);
      }
      const rows = [...map.entries()]
        .sort(([, a], [, b]) => b.amount - a.amount)
        .map(([k, v]) => [k, v.count, v.amount]);
      const grand = filteredRevs.reduce((s, r) => s + r.amount, 0);
      const titleMap: Record<string, string> = {
        by_doctor: 'تقرير الإيرادات حسب الطبيب',
        by_service: 'تقرير الإيرادات حسب الخدمة',
        by_booking_source: 'تقرير الإيرادات حسب مصدر الحجز',
        by_contracting: 'تقرير الإيرادات حسب جهة التعاقد',
      };
      return {
        title: titleMap[reportId],
        headers: ['البند', 'عدد القيود', 'إجمالي الإيراد (ج.م)'],
        rows,
        summaryItems: [
          { label: 'عدد المجموعات', value: String(rows.length) },
          { label: 'الإجمالي العام', value: `${grand.toLocaleString('en-US')} ج.م` },
        ],
      };
    }

    case 'monthly_comparison':
    case 'yearly_comparison': {
      const sliceLen = reportId === 'monthly_comparison' ? 7 : 4;
      const map = new Map<string, { rev: number; exp: number }>();
      for (const r of filteredRevs) {
        const k = r.revenueDate.slice(0, sliceLen);
        const cur = map.get(k) || { rev: 0, exp: 0 };
        cur.rev += r.amount;
        map.set(k, cur);
      }
      for (const e of filteredExps) {
        const k = e.expenseDate.slice(0, sliceLen);
        const cur = map.get(k) || { rev: 0, exp: 0 };
        cur.exp += e.totalAmount;
        map.set(k, cur);
      }
      const rows = [...map.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([period, val]) => [period, val.rev, val.exp, val.rev - val.exp]);
      return {
        title: reportId === 'monthly_comparison' ? 'تقرير المقارنة الشهرية' : 'تقرير المقارنة السنوية',
        headers: [reportId === 'monthly_comparison' ? 'الشهر' : 'السنة', 'الإيرادات (ج.م)', 'المصروفات (ج.م)', 'صافي الربح (ج.م)'],
        rows,
        summaryItems: [{ label: 'عدد الفترات', value: String(rows.length) }],
      };
    }
  }
}

