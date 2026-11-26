export type AccountType = 'cashbox' | 'bank';
export type AccountingPaymentMethod = 'cash' | 'instapay' | 'wallet' | 'paymob' | 'bank_transfer' | 'card' | 'other';
export type RevenueSourceType = 'booking' | 'operation' | 'direct' | 'contracting' | 'offer' | 'other';
export type PostingStatus = 'posted' | 'reversed';
export type ExpensePaymentStatus = 'unpaid' | 'partial' | 'paid';
export type VoucherKind = 'receipt' | 'disbursement';

export interface AccountingAttachment {
  name: string;
  url?: string;
  size?: number;
  uploadedAt: string;
}

export interface AccountingCategory {
  id: string;
  kind: 'revenue' | 'expense';
  code: string;
  nameAr: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  displayOrder: number;
}

export interface AccountingAccount {
  id: string;
  accountType: AccountType;
  name: string;
  code?: string;
  bankName?: string;
  accountNumber?: string;
  currency: string;
  openingBalance: number;
  openingBalanceDate: string;
  notes?: string;
  isActive: boolean;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingRevenue {
  id: string;
  docNumber: string;
  revenueDate: string;
  categoryId?: string;
  categoryName: string;
  revenueSource: RevenueSourceType;
  description: string;
  amount: number;
  paymentMethod: Exclude<AccountingPaymentMethod, 'other'>;
  accountId?: string;
  patientId?: string;
  patientName?: string;
  bookingId?: string;
  operationId?: string;
  doctorName?: string;
  serviceName?: string;
  bookingSource?: 'website' | 'staff' | 'admin';
  contractingCompanyId?: number;
  responsibleStaffId?: string;
  responsibleStaffName?: string;
  notes?: string;
  attachments: AccountingAttachment[];
  status: PostingStatus;
  reversalReason?: string;
  reversedByName?: string;
  reversedAt?: string;
  sourceTable?: string;
  sourceId?: string;
  createdByName?: string;
  createdAt: string;
}

export interface AccountingExpense {
  id: string;
  docNumber: string;
  expenseDate: string;
  categoryId?: string;
  categoryName: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: ExpensePaymentStatus;
  paymentMethod?: AccountingPaymentMethod;
  accountId?: string;
  beneficiary: string;
  invoiceNumber?: string;
  responsibleStaffId?: string;
  responsibleStaffName?: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvedByName?: string;
  approvedAt?: string;
  notes?: string;
  attachments: AccountingAttachment[];
  status: PostingStatus;
  reversalReason?: string;
  reversedByName?: string;
  reversedAt?: string;
  createdByName?: string;
  createdAt: string;
}

export interface AccountingExpensePayment {
  id: string;
  expenseId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: AccountingPaymentMethod;
  accountId: string;
  notes?: string;
  status: PostingStatus;
  createdByName?: string;
  createdAt: string;
}

export interface AccountingTransfer {
  id: string;
  transferNumber: string;
  transferDate: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  notes?: string;
  status: PostingStatus;
  reversalReason?: string;
  createdByName?: string;
  createdAt: string;
}

export interface AccountingVoucher {
  id: string;
  voucherKind: VoucherKind;
  voucherNumber: string;
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
  responsibleStaffId?: string;
  responsibleStaffName?: string;
  notes?: string;
  status: PostingStatus;
  reversalReason?: string;
  createdByName?: string;
  createdAt: string;
}

export interface AccountingAccountTransaction {
  id: string;
  accountId: string;
  transactionDate: string;
  direction: 'in' | 'out';
  entryType:
    | 'revenue'
    | 'revenue_reversal'
    | 'expense_payment'
    | 'expense_reversal'
    | 'transfer_in'
    | 'transfer_out'
    | 'transfer_reversal'
    | 'voucher_receipt'
    | 'voucher_disbursement'
    | 'voucher_reversal'
    | 'opening_adjustment';
  amount: number;
  referenceTable?: string;
  referenceId?: string;
  description: string;
  createdByName?: string;
  createdAt: string;
}

export interface AccountingSettingsRecord {
  id: number;
  clinicTaxNumber?: string;
  fiscalYearStartMonth: number;
  requireExpenseApproval: boolean;
  lockBeforeDate?: string;
  defaultCurrency: string;
  voucherNotesFooter?: string;
}

export interface ClinicAuditLogRecord {
  id: string;
  actorUserId?: string;
  actorName: string;
  module: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  reason?: string;
  createdAt: string;
}

export const PAYMENT_METHOD_LABELS: Record<AccountingPaymentMethod, string> = {
  cash: 'نقداً (خزينة)',
  instapay: 'InstaPay',
  wallet: 'محفظة إلكترونية',
  paymob: 'Paymob / بطاقة إلكترونية',
  bank_transfer: 'تحويل بنكي',
  card: 'بطاقة بنكية (POS)',
  other: 'أخرى',
};

export const REVENUE_SOURCE_LABELS: Record<RevenueSourceType, string> = {
  booking: 'حجز طبي',
  operation: 'عملية جراحية',
  direct: 'إيراد مباشر',
  contracting: 'جهة تعاقد / تأمين',
  offer: 'عرض طبي',
  other: 'أخرى',
};

export const EXPENSE_PAYMENT_STATUS_LABELS: Record<ExpensePaymentStatus, string> = {
  unpaid: 'غير مسدد',
  partial: 'مسدد جزئياً',
  paid: 'مسدد بالكامل',
};

export type AccountingReportId =
  | 'revenues'
  | 'expenses'
  | 'net_profit'
  | 'cashboxes'
  | 'bank_accounts'
  | 'receipt_vouchers'
  | 'disbursement_vouchers'
  | 'receivables_due'
  | 'by_doctor'
  | 'by_service'
  | 'by_booking_source'
  | 'by_contracting'
  | 'monthly_comparison'
  | 'yearly_comparison';

export const ACCOUNTING_REPORT_DEFS: { id: AccountingReportId; label: string; sensitive?: boolean }[] = [
  { id: 'revenues', label: '1. تقرير الإيرادات' },
  { id: 'expenses', label: '2. تقرير المصروفات' },
  { id: 'net_profit', label: '3. تقرير صافي الربح التشغيلي', sensitive: true },
  { id: 'cashboxes', label: '4. تقرير الخزائن' },
  { id: 'bank_accounts', label: '5. تقرير الحسابات البنكية', sensitive: true },
  { id: 'receipt_vouchers', label: '6. تقرير سندات القبض' },
  { id: 'disbursement_vouchers', label: '7. تقرير سندات الصرف' },
  { id: 'receivables_due', label: '8. تقرير المبالغ المستحقة وغير المحصلة' },
  { id: 'by_doctor', label: '9. تقرير الإيرادات حسب الطبيب' },
  { id: 'by_service', label: '10. تقرير الإيرادات حسب الخدمة' },
  { id: 'by_booking_source', label: '11. تقرير الإيرادات حسب مصدر الحجز' },
  { id: 'by_contracting', label: '12. تقرير الإيرادات حسب جهة التعاقد' },
  { id: 'monthly_comparison', label: '13. تقرير مقارنة شهرية', sensitive: true },
  { id: 'yearly_comparison', label: '14. تقرير مقارنة سنوية', sensitive: true },
];
