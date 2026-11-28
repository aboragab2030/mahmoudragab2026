import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Landmark,
  Lock,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import { withMinSpin } from '@/lib/refreshSpin';
import { addDaysStr, cairoTodayStr } from './dateUtils';
import {
  hasAccountingPermission,
  hasPatientBillingPermission,
  type PermissionUser,
} from './permissions';
import type { StaffActor } from './patientsService';
import {
  PATIENT_FINANCIAL_STATUSES,
  PATIENT_FINANCIAL_STATUS_BADGE,
  applyPatientBillingDiscount,
  computePatientBillingDashboardMetrics,
  confirmUnifiedBookingPayment,
  filterPatientBillingRecords,
  refundOrReverseBookingPayment,
  syncBookingsToPatientBilling,
  type PatientBillingFilters,
  type PatientBillingRecord,
} from './patientBillingService';
import {
  ACCOUNTING_REPORT_DEFS,
  EXPENSE_PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  REVENUE_SOURCE_LABELS,
  type AccountingAccount,
  type AccountingAttachment,
  type AccountingExpense,
  type AccountingPaymentMethod,
  type AccountingReportId,
  type AccountingRevenue,
  type AccountingSettingsRecord,
  type AccountingTransfer,
  type AccountingVoucher,
  type AccountType,
  type RevenueSourceType,
  type VoucherKind,
} from './accountingTypes';
import {
  approveAccountingExpense,
  buildAccountingReportData,
  buildBookingFinancialRows,
  computeAccountBalance,
  computeAccountingDashboardMetrics,
  createAccountingAccount,
  createAccountingCategory,
  createAccountTransfer,
  createVoucherRecord,
  exportRowsToCsv,
  exportRowsToExcel,
  loadAccountingBundle,
  loadUnlinkedConfirmedPayments,
  payExistingExpense,
  recordAccountingExpense,
  recordAccountingRevenue,
  reverseAccountingExpense,
  reverseAccountingRevenue,
  reverseAccountingTransfer,
  reverseAccountingVoucher,
  toggleAccountingCategory,
  updateAccountOpeningBalance,
  updateAccountingSettings,
  type AccountingBundle,
  type AccountingReportFilters,
  type BookingFinancialRow,
  type ExternalPaymentSourceRow,
} from './accountingService';

type AccountingSubTab =
  | 'dashboard'
  | 'patient-accounts'
  | 'revenues'
  | 'expenses'
  | 'accounts'
  | 'vouchers'
  | 'integration'
  | 'reports'
  | 'settings';

interface AccountingHubProps {
  currentUser: PermissionUser & { name: string };
  currentUserUuid?: string;
  rawBookings: any[];
  doctors: { name: string; fee: number }[];
  services: { title: string; price: number }[];
  contractingList: { id: number; name: string }[];
  staffMembers: { user_id: string; name: string }[];
  cardClass: string;
  inputClass: string;
  onPrint: (title: string, contentHtml: string) => void;
  onNotify?: (title: string, message: string, type: 'success' | 'warning' | 'info') => void;
  onRefresh?: () => Promise<void> | void;
}

const fmtMoney = (v: number): string =>
  `${(Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ج.م`;

export const AccountingHub: React.FC<AccountingHubProps> = ({
  currentUser,
  currentUserUuid,
  rawBookings,
  doctors,
  services,
  contractingList,
  staffMembers,
  cardClass,
  inputClass,
  onPrint,
  onNotify,
  onRefresh,
}) => {
  const actor: StaffActor = useMemo(
    () => ({ userId: currentUserUuid, name: currentUser?.name || 'موظف الحسابات' }),
    [currentUserUuid, currentUser?.name],
  );

  const canViewDashboard =
    hasAccountingPermission(currentUser, 'accounting_view') ||
    hasAccountingPermission(currentUser, 'accounting_manage');
  const canViewRevenues = hasAccountingPermission(currentUser, 'accounting_revenue_view');
  const canCreateRevenue = hasAccountingPermission(currentUser, 'accounting_revenue_create');
  const canReverseRevenue = hasAccountingPermission(currentUser, 'accounting_revenue_delete');
  const canViewExpenses = hasAccountingPermission(currentUser, 'accounting_expenses_view');
  const canCreateExpense = hasAccountingPermission(currentUser, 'accounting_expenses_create');
  const canApproveExpense = hasAccountingPermission(currentUser, 'accounting_expenses_edit');
  const canPayExpense = hasAccountingPermission(currentUser, 'accounting_expenses_pay');
  const canReverseExpense = hasAccountingPermission(currentUser, 'accounting_expenses_delete');
  const canViewAccounts = hasAccountingPermission(currentUser, 'accounting_accounts_view');
  const canManageAccounts = hasAccountingPermission(currentUser, 'accounting_accounts_manage');
  const canManageOpeningBalances = hasAccountingPermission(currentUser, 'accounting_manage_opening_balances');
  const canCreateTransfer = hasAccountingPermission(currentUser, 'accounting_transfers_create');
  const canViewReceipts = hasAccountingPermission(currentUser, 'accounting_receipts_view');
  const canCreateReceipt = hasAccountingPermission(currentUser, 'accounting_receipts_create');
  const canViewDisbursements = hasAccountingPermission(currentUser, 'accounting_disbursements_view');
  const canCreateDisbursement = hasAccountingPermission(currentUser, 'accounting_disbursements_create');
  const canViewReports = hasAccountingPermission(currentUser, 'accounting_reports_view');
  const canExportReports = hasAccountingPermission(currentUser, 'accounting_reports_export');
  const canManageCategories = hasAccountingPermission(currentUser, 'accounting_manage_categories');
  const canManageSettings = hasAccountingPermission(currentUser, 'accounting_manage_settings');
  const canViewSensitive = hasAccountingPermission(currentUser, 'accounting_view_sensitive_data');

  // Unified patient billing & payment confirmation strict permissions
  const canViewAllPatientAccounts =
    hasPatientBillingPermission(currentUser, 'patient_accounts_view_all') ||
    hasPatientBillingPermission(currentUser, 'accounting_view_patient_balances');
  const canViewPatientAccounts =
    hasPatientBillingPermission(currentUser, 'patient_accounts_view') ||
    canViewAllPatientAccounts ||
    hasPatientBillingPermission(currentUser, 'patient_accounts_view_own');
  const canViewOwnPatientAccountsOnly =
    hasPatientBillingPermission(currentUser, 'patient_accounts_view_own') && !canViewAllPatientAccounts;
  const canEditPatientAccounts = hasPatientBillingPermission(currentUser, 'patient_accounts_edit');
  const canConfirmFullPayment = hasPatientBillingPermission(currentUser, 'payment_confirm');
  const canConfirmPartialPayment =
    hasPatientBillingPermission(currentUser, 'payment_confirm_partial') || canConfirmFullPayment;
  const canRefundPayment = hasPatientBillingPermission(currentUser, 'payment_refund');
  const canReversePayment = hasPatientBillingPermission(currentUser, 'payment_reverse');
  const canViewBillingHistory =
    hasPatientBillingPermission(currentUser, 'payment_view_history') || canViewPatientAccounts;
  const canViewBalances =
    hasPatientBillingPermission(currentUser, 'accounting_view_patient_balances') || canViewPatientAccounts;

  const availableTabs = useMemo<{ id: AccountingSubTab; label: string; show: boolean }[]>(
    () => [
      { id: 'dashboard', label: 'لوحة الحسابات', show: canViewDashboard || canViewBalances },
      { id: 'patient-accounts', label: 'حسابات المرضى والمستحقات', show: canViewPatientAccounts },
      { id: 'revenues', label: 'الإيرادات', show: canViewRevenues || canCreateRevenue },
      { id: 'expenses', label: 'المصروفات', show: canViewExpenses || canCreateExpense },
      { id: 'accounts', label: 'الخزائن والبنوك', show: canViewAccounts || canManageAccounts || canCreateTransfer },
      {
        id: 'vouchers',
        label: 'سندات القبض والصرف',
        show: canViewReceipts || canCreateReceipt || canViewDisbursements || canCreateDisbursement,
      },
      {
        id: 'integration',
        label: 'تكامل الحجوزات والمدفوعات',
        show: canViewRevenues || canCreateRevenue || canViewDashboard,
      },
      { id: 'reports', label: 'التقارير المحاسبية', show: canViewReports },
      { id: 'settings', label: 'الإعدادات والتدقيق', show: canManageCategories || canManageSettings || canViewSensitive },
    ],
    [
      canViewDashboard,
      canViewBalances,
      canViewPatientAccounts,
      canViewRevenues,
      canCreateRevenue,
      canViewExpenses,
      canCreateExpense,
      canViewAccounts,
      canManageAccounts,
      canCreateTransfer,
      canViewReceipts,
      canCreateReceipt,
      canViewDisbursements,
      canCreateDisbursement,
      canViewReports,
      canManageCategories,
      canManageSettings,
      canViewSensitive,
    ],
  );

  const [subTab, setSubTab] = useState<AccountingSubTab>('dashboard');
  useEffect(() => {
    const allowed = availableTabs.filter((t) => t.show).map((t) => t.id);
    if (allowed.length > 0 && !allowed.includes(subTab)) {
      setSubTab(allowed[0]);
    }
  }, [availableTabs, subTab]);

  const [bundle, setBundle] = useState<AccountingBundle | null>(null);
  const [externalPayments, setExternalPayments] = useState<ExternalPaymentSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const today = cairoTodayStr();
  const [periodPreset, setPeriodPreset] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);

  const applyPreset = (preset: 'today' | 'week' | 'month' | 'year' | 'custom') => {
    setPeriodPreset(preset);
    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'week') {
      setStartDate(addDaysStr(today, -6));
      setEndDate(today);
    } else if (preset === 'month') {
      setStartDate(`${today.slice(0, 7)}-01`);
      setEndDate(today);
    } else if (preset === 'year') {
      setStartDate(`${today.slice(0, 4)}-01-01`);
      setEndDate(today);
    }
  };

  const refreshAccounting = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await loadAccountingBundle();
      setBundle(loaded);
      const unlinked = await loadUnlinkedConfirmedPayments(loaded.revenues);
      setExternalPayments(unlinked);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحميل بيانات قسم الحسابات');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setRefreshingAll(true);
    try {
      await withMinSpin(() =>
        Promise.all([refreshAccounting(), Promise.resolve(onRefresh?.())]),
      );
    } finally {
      setRefreshingAll(false);
    }
  }, [refreshAccounting, onRefresh]);

  useEffect(() => {
    void refreshAccounting();
  }, [refreshAccounting]);

  // Forms state
  const activeAccounts = useMemo(
    () => (bundle?.accounts || []).filter((a) => a.isActive),
    [bundle?.accounts],
  );
  const revenueCategories = useMemo(
    () => (bundle?.categories || []).filter((c) => c.kind === 'revenue' && c.isActive),
    [bundle?.categories],
  );
  const expenseCategories = useMemo(
    () => (bundle?.categories || []).filter((c) => c.kind === 'expense' && c.isActive),
    [bundle?.categories],
  );

  // Revenue form
  const [revDate, setRevDate] = useState(today);
  const [revCategoryId, setRevCategoryId] = useState('');
  const [revSource, setRevSource] = useState<RevenueSourceType>('direct');
  const [revDescription, setRevDescription] = useState('');
  const [revAmount, setRevAmount] = useState('');
  const [revMethod, setRevMethod] = useState<Exclude<AccountingPaymentMethod, 'other'>>('cash');
  const [revAccountId, setRevAccountId] = useState('');
  const [revDoctorName, setRevDoctorName] = useState('');
  const [revServiceName, setRevServiceName] = useState('');
  const [revPatientName, setRevPatientName] = useState('');
  const [revNotes, setRevNotes] = useState('');
  const [revAttachments, setRevAttachments] = useState<AccountingAttachment[]>([]);
  const [revIssueVoucher, setRevIssueVoucher] = useState(false);
  const [revSearch, setRevSearch] = useState('');

  // Expense form
  const [expDate, setExpDate] = useState(today);
  const [expCategoryId, setExpCategoryId] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expTotalAmount, setExpTotalAmount] = useState('');
  const [expPaidNowAmount, setExpPaidNowAmount] = useState('');
  const [expMethod, setExpMethod] = useState<AccountingPaymentMethod>('cash');
  const [expAccountId, setExpAccountId] = useState('');
  const [expBeneficiary, setExpBeneficiary] = useState('');
  const [expInvoiceNum, setExpInvoiceNum] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [expAttachments, setExpAttachments] = useState<AccountingAttachment[]>([]);
  const [expIssueVoucher, setExpIssueVoucher] = useState(false);
  const [expStatusFilter, setExpStatusFilter] = useState<string>('');
  const [payingExpense, setPayingExpense] = useState<AccountingExpense | null>(null);
  const [payAmountInput, setPayAmountInput] = useState('');
  const [payAccountIdInput, setPayAccountIdInput] = useState('');
  const [payMethodInput, setPayMethodInput] = useState<AccountingPaymentMethod>('cash');
  const [payDateInput, setPayDateInput] = useState(today);
  const [payIssueVoucherInput, setPayIssueVoucherInput] = useState(true);

  // Account & transfer forms
  const [accType, setAccType] = useState<AccountType>('cashbox');
  const [accName, setAccName] = useState('');
  const [accCode, setAccCode] = useState('');
  const [accBankName, setAccBankName] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [accOpeningBal, setAccOpeningBal] = useState('0');
  const [accOpeningDate, setAccOpeningDate] = useState(today);
  const [accNotes, setAccNotes] = useState('');
  const [editingOpeningAcc, setEditingOpeningAcc] = useState<AccountingAccount | null>(null);
  const [newOpeningVal, setNewOpeningVal] = useState('');
  const [newOpeningReason, setNewOpeningReason] = useState('');

  const [trfDate, setTrfDate] = useState(today);
  const [trfFromId, setTrfFromId] = useState('');
  const [trfToId, setTrfToId] = useState('');
  const [trfAmount, setTrfAmount] = useState('');
  const [trfNotes, setTrfNotes] = useState('');

  // Vouchers form
  const [vchKind, setVchKind] = useState<VoucherKind>('receipt');
  const [vchDate, setVchDate] = useState(today);
  const [vchParty, setVchParty] = useState('');
  const [vchAmount, setVchAmount] = useState('');
  const [vchReason, setVchReason] = useState('');
  const [vchMethod, setVchMethod] = useState<AccountingPaymentMethod>('cash');
  const [vchAccountId, setVchAccountId] = useState('');
  const [vchAffectsAccount, setVchAffectsAccount] = useState(true);
  const [vchNotes, setVchNotes] = useState('');

  // Reversal modal
  const [reversingTarget, setReversingTarget] = useState<{
    kind: 'revenue' | 'expense' | 'transfer' | 'voucher';
    item: AccountingRevenue | AccountingExpense | AccountingTransfer | AccountingVoucher;
    title: string;
  } | null>(null);
  const [reversalReasonInput, setReversalReasonInput] = useState('');

  // Patient Billing Accounts filters & modals
  const [pbFilters, setPbFilters] = useState<PatientBillingFilters>({});
  const [pbCollectingRecord, setPbCollectingRecord] = useState<PatientBillingRecord | null>(null);
  const [pbCollectAmount, setPbCollectAmount] = useState('');
  const [pbCollectMethod, setPbCollectMethod] = useState<AccountingPaymentMethod>('cash');
  const [pbCollectAccountId, setPbCollectAccountId] = useState('');
  const [pbCollectRef, setPbCollectRef] = useState('');
  const [pbCollectNotes, setPbCollectNotes] = useState('');
  const [pbCollectVoucher, setPbCollectVoucher] = useState(false);

  const [pbDiscountRecord, setPbDiscountRecord] = useState<PatientBillingRecord | null>(null);
  const [pbDiscountVal, setPbDiscountVal] = useState('0');
  const [pbDiscountReason, setPbDiscountReason] = useState('');

  const [pbRefundRecord, setPbRefundRecord] = useState<PatientBillingRecord | null>(null);
  const [pbRefundAmount, setPbRefundAmount] = useState('');
  const [pbRefundMethod, setPbRefundMethod] = useState<AccountingPaymentMethod>('cash');
  const [pbRefundAccountId, setPbRefundAccountId] = useState('');
  const [pbRefundReason, setPbRefundReason] = useState('');

  const [pbHistoryRecord, setPbHistoryRecord] = useState<PatientBillingRecord | null>(null);
  const [pbReverseTarget, setPbReverseTarget] = useState<{ bookingId: string; txId: string; amount: number; ref: string } | null>(null);
  const [pbReverseReason, setPbReverseReason] = useState('');

  // Integration target account
  const [integrationAccountId, setIntegrationAccountId] = useState('');

  // Reports
  const [selectedReport, setSelectedReport] = useState<AccountingReportId>('revenues');
  const [reportFilters, setReportFilters] = useState<AccountingReportFilters>({
    startDate: `${today.slice(0, 7)}-01`,
    endDate: today,
  });

  // Categories & settings forms
  const [newCatKind, setNewCatKind] = useState<'revenue' | 'expense'>('revenue');
  const [newCatName, setNewCatName] = useState('');
  const [settingsDraft, setSettingsDraft] = useState<AccountingSettingsRecord>({
    id: 1,
    fiscalYearStartMonth: 1,
    requireExpenseApproval: false,
    defaultCurrency: 'EGP',
  });

  useEffect(() => {
    if (!bundle) return;
    setSettingsDraft(bundle.settings);
    if (!revCategoryId && revenueCategories[0]) setRevCategoryId(revenueCategories[0].id);
    if (!expCategoryId && expenseCategories[0]) setExpCategoryId(expenseCategories[0].id);
    if (activeAccounts[0]) {
      const defId = activeAccounts[0].id;
      if (!revAccountId) setRevAccountId(defId);
      if (!expAccountId) setExpAccountId(defId);
      if (!vchAccountId) setVchAccountId(defId);
      if (!integrationAccountId) setIntegrationAccountId(defId);
      if (!payAccountIdInput) setPayAccountIdInput(defId);
      if (!pbCollectAccountId) setPbCollectAccountId(defId);
      if (!pbRefundAccountId) setPbRefundAccountId(defId);
      if (!trfFromId) setTrfFromId(defId);
      if (!trfToId && activeAccounts[1]) setTrfToId(activeAccounts[1].id);
    }
  }, [bundle, revenueCategories, expenseCategories, activeAccounts, revCategoryId, expCategoryId, revAccountId, expAccountId, vchAccountId, integrationAccountId, payAccountIdInput, pbCollectAccountId, pbRefundAccountId, trfFromId, trfToId]);

  const bookingFinancials = useMemo(() => {
    if (!bundle) return [];
    return buildBookingFinancialRows({
      rawBookings,
      doctors,
      services,
      revenues: bundle.revenues,
      externalPayments,
    });
  }, [bundle, rawBookings, doctors, services, externalPayments]);

  const visibleBillingRecords = useMemo(() => {
    const all = bundle?.billingRecords || [];
    if (canViewOwnPatientAccountsOnly && currentUserUuid) {
      return all.filter(
        (r) => r.createdByStaffId === currentUserUuid || r.assignedStaffId === currentUserUuid,
      );
    }
    return all;
  }, [bundle?.billingRecords, canViewOwnPatientAccountsOnly, currentUserUuid]);

  const filteredBillingRecords = useMemo(
    () => filterPatientBillingRecords(visibleBillingRecords, pbFilters),
    [visibleBillingRecords, pbFilters],
  );

  const patientBillingMetrics = useMemo(() => {
    if (!bundle) return null;
    return computePatientBillingDashboardMetrics(
      visibleBillingRecords,
      bundle.billingTransactions || [],
      startDate,
      endDate,
    );
  }, [bundle, visibleBillingRecords, startDate, endDate]);

  const dashboardMetrics = useMemo(() => {
    if (!bundle) return null;
    return computeAccountingDashboardMetrics({
      bundle,
      bookingFinancials,
      startDate,
      endDate,
      todayStr: today,
    });
  }, [bundle, bookingFinancials, startDate, endDate, today]);

  const builtReport = useMemo(() => {
    if (!bundle) return null;
    return buildAccountingReportData({
      reportId: selectedReport,
      bundle,
      bookingFinancials,
      contractingList,
      filters: reportFilters,
      canViewSensitive,
    });
  }, [bundle, selectedReport, bookingFinancials, contractingList, reportFilters, canViewSensitive]);

  const handleAttachmentUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<AccountingAttachment[]>>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 600 * 1024) {
      toast.error('حجم المرفق يجب ألا يتجاوز 600 كيلوبايت');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setter((prev) => [
        ...prev,
        {
          name: file.name,
          url: typeof reader.result === 'string' ? reader.result : undefined,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        },
      ]);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) {
      toast.error('يرجى إدخال اسم الخزينة أو الحساب البنكي');
      return;
    }
    const opening = Number(accOpeningBal || 0);
    if (opening > 0 && !canManageOpeningBalances) {
      toast.error('تعيين رصيد افتتاحي يتطلب صلاحية إدارة الأرصدة الافتتاحية');
      return;
    }
    setBusy(true);
    try {
      await createAccountingAccount(
        {
          accountType: accType,
          name: accName,
          code: accCode,
          bankName: accBankName,
          accountNumber: accNumber,
          openingBalance: opening,
          openingBalanceDate: accOpeningDate,
          notes: accNotes,
        },
        actor,
      );
      toast.success('تم إنشاء الحساب المالي بنجاح');
      setAccName('');
      setAccCode('');
      setAccBankName('');
      setAccNumber('');
      setAccOpeningBal('0');
      setAccNotes('');
      await refreshAccounting();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إنشاء الحساب');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordRevenueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cat = revenueCategories.find((c) => c.id === revCategoryId);
    if (!revDescription.trim() || !revAmount || Number(revAmount) <= 0) {
      toast.error('يرجى إدخال بيان الإيراد ومبلغ صحيح أكبر من صفر');
      return;
    }
    if (!revAccountId) {
      toast.error('يرجى إنشاء أو اختيار خزينة / حساب بنكي أولاً');
      return;
    }
    setBusy(true);
    try {
      const created = await recordAccountingRevenue(
        {
          revenueDate: revDate,
          categoryId: cat?.id,
          categoryName: cat?.nameAr || 'إيرادات العيادة',
          revenueSource: revSource,
          description: revDescription,
          amount: Number(revAmount),
          paymentMethod: revMethod,
          accountId: revAccountId,
          patientName: revPatientName || undefined,
          doctorName: revDoctorName || undefined,
          serviceName: revServiceName || undefined,
          notes: revNotes || undefined,
          attachments: revAttachments,
        },
        actor,
        { issueReceiptVoucher: revIssueVoucher && canCreateReceipt },
      );
      toast.success(`تم تسجيل الإيراد ${created.docNumber} بنجاح`);
      onNotify?.('قيد إيراد جديد', `تم تسجيل إيراد ${created.docNumber} بقيمة ${created.amount} ج.م`, 'success');
      setRevDescription('');
      setRevAmount('');
      setRevPatientName('');
      setRevNotes('');
      setRevAttachments([]);
      await refreshAccounting();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تسجيل الإيراد');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cat = expenseCategories.find((c) => c.id === expCategoryId);
    const total = Number(expTotalAmount || 0);
    const paidNow = Number(expPaidNowAmount || 0);
    if (!expDescription.trim() || !expBeneficiary.trim() || total <= 0) {
      toast.error('يرجى إدخال بيان المصروف واسم المستفيد والمبلغ');
      return;
    }
    if (paidNow > 0 && !expAccountId) {
      toast.error('يرجى تحديد الخزينة أو الحساب البنكي للدفع');
      return;
    }
    setBusy(true);
    try {
      const created = await recordAccountingExpense(
        {
          expenseDate: expDate,
          categoryId: cat?.id,
          categoryName: cat?.nameAr || 'مصروفات عامة',
          description: expDescription,
          totalAmount: total,
          paidNowAmount: paidNow,
          paymentMethod: expMethod,
          accountId: paidNow > 0 ? expAccountId : undefined,
          beneficiary: expBeneficiary,
          invoiceNumber: expInvoiceNum,
          notes: expNotes,
          attachments: expAttachments,
          requireApproval: bundle?.settings.requireExpenseApproval,
        },
        actor,
        { issueDisbursementVoucher: expIssueVoucher && canCreateDisbursement },
      );
      toast.success(`تم تسجيل المصروف ${created.docNumber} بنجاح`);
      setExpDescription('');
      setExpTotalAmount('');
      setExpPaidNowAmount('');
      setExpBeneficiary('');
      setExpInvoiceNum('');
      setExpNotes('');
      setExpAttachments([]);
      await refreshAccounting();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تسجيل المصروف');
    } finally {
      setBusy(false);
    }
  };

  const handlePayExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingExpense) return;
    setBusy(true);
    try {
      await payExistingExpense(
        payingExpense,
        {
          amount: Number(payAmountInput || 0),
          paymentDate: payDateInput,
          paymentMethod: payMethodInput,
          accountId: payAccountIdInput,
          issueDisbursementVoucher: payIssueVoucherInput && canCreateDisbursement,
        },
        actor,
      );
      toast.success('تم تسجيل سداد المصروف وتحديث المتبقي');
      setPayingExpense(null);
      await refreshAccounting();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر سداد المصروف');
    } finally {
      setBusy(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const trf = await createAccountTransfer(
        {
          transferDate: trfDate,
          fromAccountId: trfFromId,
          toAccountId: trfToId,
          amount: Number(trfAmount || 0),
          notes: trfNotes,
        },
        actor,
      );
      toast.success(`تم تنفيذ التحويل ${trf.transferNumber} دون التأثير على الأرباح`);
      setTrfAmount('');
      setTrfNotes('');
      await refreshAccounting();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تنفيذ التحويل');
    } finally {
      setBusy(false);
    }
  };

  const handleVoucherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vchParty.trim() || !vchReason.trim() || Number(vchAmount) <= 0) {
      toast.error('يرجى إدخال اسم الطرف والسبب ومبلغ السند');
      return;
    }
    setBusy(true);
    try {
      const created = await createVoucherRecord(
        {
          voucherKind: vchKind,
          voucherDate: vchDate,
          partyName: vchParty,
          amount: Number(vchAmount),
          reason: vchReason,
          paymentMethod: vchMethod,
          accountId: vchAffectsAccount ? vchAccountId : undefined,
          affectsAccount: vchAffectsAccount,
          notes: vchNotes,
        },
        actor,
      );
      toast.success(`تم إصدار ${vchKind === 'receipt' ? 'سند القبض' : 'سند الصرف'} ${created.voucherNumber}`);
      setVchParty('');
      setVchAmount('');
      setVchReason('');
      setVchNotes('');
      await refreshAccounting();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إصدار السند');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReversal = async () => {
    if (!reversingTarget || !bundle) return;
    setBusy(true);
    try {
      if (reversingTarget.kind === 'revenue') {
        await reverseAccountingRevenue(reversingTarget.item as AccountingRevenue, reversalReasonInput, actor);
      } else if (reversingTarget.kind === 'expense') {
        await reverseAccountingExpense(
          reversingTarget.item as AccountingExpense,
          bundle.expensePayments,
          reversalReasonInput,
          actor,
        );
      } else if (reversingTarget.kind === 'transfer') {
        await reverseAccountingTransfer(reversingTarget.item as AccountingTransfer, reversalReasonInput, actor);
      } else if (reversingTarget.kind === 'voucher') {
        await reverseAccountingVoucher(reversingTarget.item as AccountingVoucher, reversalReasonInput, actor);
      }
      toast.success('تم تنفيذ العكس المحاسبي وتوثيق السبب في سجل التدقيق');
      setReversingTarget(null);
      setReversalReasonInput('');
      await refreshAccounting();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر عكس القيد');
    } finally {
      setBusy(false);
    }
  };

  const handlePostExternalPayment = async (ext: ExternalPaymentSourceRow) => {
    if (!integrationAccountId) {
      toast.error('يرجى أولاً إنشاء خزينة أو حساب بنكي في تبويب الخزائن والبنوك');
      return;
    }
    const bookingRow = rawBookings.find((b) => String(b.id) === String(ext.bookingId || ''));
    const cat = revenueCategories.find((c) => c.code === 'REV_BOOKING') || revenueCategories[0];
    setBusy(true);
    try {
      const rev = await recordAccountingRevenue(
        {
          revenueDate: ext.date,
          categoryId: cat?.id,
          categoryName: cat?.nameAr || 'كشف واستشارة',
          revenueSource: bookingRow?.contracting_company_id ? 'contracting' : 'booking',
          description: `ترحيل تحصيل ${PAYMENT_METHOD_LABELS[ext.paymentMethod]} - ${bookingRow?.patient_name || ext.patientName} (${ext.reference || ext.sourceId.slice(0, 8)})`,
          amount: ext.amount,
          paymentMethod: ext.paymentMethod,
          accountId: integrationAccountId,
          bookingId: ext.bookingId,
          patientId: bookingRow?.patient_id || undefined,
          patientName: bookingRow?.patient_name || ext.patientName,
          doctorName: bookingRow?.doctor_name || undefined,
          serviceName: bookingRow?.service || undefined,
          bookingSource: bookingRow?.booking_source || 'website',
          contractingCompanyId: bookingRow?.contracting_company_id || undefined,
          sourceTable: ext.sourceTable,
          sourceId: ext.sourceId,
        },
        actor,
      );
      toast.success(`تم ترحيل الدفعة كإيراد معتمد ${rev.docNumber}`);
      await refreshAccounting();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر ترحيل الدفعة (ربما تم ترحيلها مسبقاً)');
    } finally {
      setBusy(false);
    }
  };

  const handlePostCashBookingRevenue = async (row: BookingFinancialRow) => {
    if (!canConfirmFullPayment && !canConfirmPartialPayment) {
      toast.error('ليست لديك صلاحية تأكيد وتحصيل مدفوعات المرضى');
      return;
    }
    if (!integrationAccountId) {
      toast.error('يرجى أولاً إنشاء خزينة أو حساب بنكي في تبويب الخزائن والبنوك');
      return;
    }
    const billingRow = bundle?.billingRecords.find((r) => r.bookingId === row.bookingUuid);
    const amountDue = billingRow
      ? billingRow.remainingBalance
      : row.remainingAmount > 0
        ? row.remainingAmount
        : row.estimatedValue;
    if (amountDue <= 0) {
      toast.error('قيمة الحجز المستحقة صفر؛ يمكنك تسجيل الإيراد يدوياً من تبويب الإيرادات');
      return;
    }
    setBusy(true);
    try {
      const tx = await confirmUnifiedBookingPayment({
        bookingId: row.bookingUuid,
        amount: amountDue,
        paymentMethod: row.paymentMethod === 'instapay' ? 'instapay' : row.paymentMethod === 'wallet' ? 'wallet' : 'cash',
        accountId: integrationAccountId,
        confirmedVia: 'accounting_section',
        notes: `تحصيل حجز ${row.patientName} - ${row.doctorName} (${row.service})`,
      });
      toast.success(`تم تأكيد تحصيل الحجز (${tx.transactionRef}) وتحديث المدفوعات والحسابات دون تكرار`);
      await Promise.all([refreshAccounting(), Promise.resolve(onRefresh?.())]);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تأكيد تحصيل الحجز');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenPbCollect = (rec: PatientBillingRecord) => {
    setPbCollectingRecord(rec);
    setPbCollectAmount(
      canConfirmFullPayment
        ? String(rec.remainingBalance)
        : String(Math.max(Math.round((rec.remainingBalance / 2) * 100) / 100, 1)),
    );
    setPbCollectMethod(
      (rec.lastPaymentMethod as AccountingPaymentMethod) || 'cash',
    );
    setPbCollectAccountId(activeAccounts[0]?.id || '');
    setPbCollectRef('');
    setPbCollectNotes('');
    setPbCollectVoucher(false);
  };

  const handleSubmitPbCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pbCollectingRecord) return;
    const amt = Math.round(Number(pbCollectAmount) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }
    if (amt > pbCollectingRecord.remainingBalance + 0.01) {
      toast.error(`المبلغ أكبر من المتبقي المستحق (${pbCollectingRecord.remainingBalance} ج.م)`);
      return;
    }
    const isPartial =
      (pbCollectingRecord.finalAmountDue > 0 && amt < pbCollectingRecord.remainingBalance - 0.01) ||
      pbCollectingRecord.paidAmount > 0;
    if (!isPartial && !canConfirmFullPayment) {
      toast.error('صلاحيتك تتيح تأكيد الدفعات الجزئية فقط؛ التحصيل الكامل يتطلب صلاحية payment_confirm');
      return;
    }
    if (isPartial && !canConfirmPartialPayment) {
      toast.error('ليست لديك صلاحية تأكيد السداد الجزئي');
      return;
    }
    setBusy(true);
    try {
      const tx = await confirmUnifiedBookingPayment({
        bookingId: pbCollectingRecord.bookingId,
        amount: amt,
        paymentMethod: pbCollectMethod,
        accountId: pbCollectAccountId || undefined,
        confirmedVia: 'accounting_section',
        transactionRef: pbCollectRef || undefined,
        notes: pbCollectNotes || undefined,
        issueVoucher: pbCollectVoucher,
      });
      toast.success(`تم تأكيد السداد (${tx.transactionRef}) وتحديث سجل المدفوعات والحسابات`);
      onNotify?.('تأكيد سداد', `تم تحصيل ${amt} ج.م للمريض ${pbCollectingRecord.patientName}`, 'success');
      setPbCollectingRecord(null);
      await Promise.all([refreshAccounting(), Promise.resolve(onRefresh?.())]);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تأكيد استلام الدفعة');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitPbDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pbDiscountRecord) return;
    setBusy(true);
    try {
      await applyPatientBillingDiscount({
        bookingId: pbDiscountRecord.bookingId,
        discount: Number(pbDiscountVal || 0),
        reason: pbDiscountReason,
      });
      toast.success('تم تحديث الخصم المعتمد وتعديل المتبقي المستحق');
      setPbDiscountRecord(null);
      await refreshAccounting();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تعديل الخصم');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitPbRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pbRefundRecord) return;
    const netPaid = Math.max(pbRefundRecord.paidAmount - pbRefundRecord.refundedAmount, 0);
    const amt = Math.round(Number(pbRefundAmount) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0 || amt > netPaid + 0.01) {
      toast.error(`يرجى إدخال مبلغ استرداد صحيح لا يتجاوز ${netPaid} ج.م`);
      return;
    }
    setBusy(true);
    try {
      await refundOrReverseBookingPayment({
        bookingId: pbRefundRecord.bookingId,
        mode: 'refund',
        amount: amt,
        paymentMethod: pbRefundMethod,
        accountId: pbRefundAccountId || undefined,
        reason: pbRefundReason,
      });
      toast.success('تم تنفيذ الاسترداد وتحديث رصيد المريض والمدفوعات والحسابات');
      setPbRefundRecord(null);
      await Promise.all([refreshAccounting(), Promise.resolve(onRefresh?.())]);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تنفيذ الاسترداد');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitPbReverse = async () => {
    if (!pbReverseTarget) return;
    setBusy(true);
    try {
      await refundOrReverseBookingPayment({
        bookingId: pbReverseTarget.bookingId,
        mode: 'reversal',
        targetTransactionId: pbReverseTarget.txId,
        reason: pbReverseReason,
      });
      toast.success('تم عكس المعاملة المالية وتوثيق السبب');
      setPbReverseTarget(null);
      setPbReverseReason('');
      await Promise.all([refreshAccounting(), Promise.resolve(onRefresh?.())]);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر عكس المعاملة');
    } finally {
      setBusy(false);
    }
  };

  const printVoucher = (v: AccountingVoucher) => {
    const accName = bundle?.accounts.find((a) => a.id === v.accountId)?.name || 'بدون ربط حسابي مباشر';
    const title = v.voucherKind === 'receipt' ? `سند قبض رقم ${v.voucherNumber}` : `سند صرف رقم ${v.voucherNumber}`;
    onPrint(
      title,
      `
      <div style="border:2px solid #087F8C;padding:18px;border-radius:12px;">
        <h3 style="text-align:center;color:#087F8C;margin-top:0;">${title}</h3>
        <table>
          <tr><th>التاريخ</th><td>${v.voucherDate}</td><th>الحالة</th><td>${v.status === 'posted' ? 'معتمد' : 'معكوس'}</td></tr>
          <tr><th>${v.voucherKind === 'receipt' ? 'استلمنا من السيد/ة' : 'صُرف إلى السيد/ة'}</th><td>${v.partyName}</td><th>المبلغ</th><td><strong>${v.amount.toLocaleString('en-US')} ج.م</strong></td></tr>
          <tr><th>وسيلة الدفع</th><td>${PAYMENT_METHOD_LABELS[v.paymentMethod]}</td><th>الحساب المالي</th><td>${accName}</td></tr>
          <tr><th>السبب / البيان</th><td colspan="3">${v.reason}</td></tr>
          ${v.notes ? `<tr><th>ملاحظات</th><td colspan="3">${v.notes}</td></tr>` : ''}
        </table>
        <div style="display:flex;justify-content:space-between;margin-top:28px;">
          <div>توقيع المستلم: ........................</div>
          <div>المحاسب / المسؤول: ${v.responsibleStaffName || v.createdByName || '-'}</div>
        </div>
        ${bundle?.settings.voucherNotesFooter ? `<p style="margin-top:16px;font-size:9pt;color:#64748b;text-align:center;">${bundle.settings.voucherNotesFooter}</p>` : ''}
      </div>
    `,
    );
  };

  if (availableTabs.filter((t) => t.show).length === 0) {
    return (
      <div className={cardClass}>
        <p className="text-sm font-bold text-red-600">ليست لديك صلاحية الوصول إلى قسم الحسابات.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
      {/* Header & Sub-navigation */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#DFEAF0]">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#087F8C]/10 text-[#087F8C]">
              <Landmark size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#172B3A]">النظام المحاسبي المستقل وإدارة الحسابات</h2>
              <p className="text-xs text-[#718394] font-semibold mt-0.5">
                إيرادات، مصروفات، خزائن وحسابات بنكية، تحويلات، سندات قبض وصرف، وتقارير مالية مرتبطة بالحجوزات والمدفوعات
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            disabled={loading || refreshingAll || busy}
            className="px-4 py-2.5 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0] text-[#087F8C] text-xs font-black flex items-center gap-2 hover:bg-white transition-all disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw size={15} className={loading || refreshingAll ? 'animate-spin' : ''} />
            تحديث الحسابات
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-4">
          {availableTabs
            .filter((t) => t.show)
            .map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                  subTab === tab.id
                    ? 'bg-[#087F8C] text-white border-[#087F8C] shadow-xs'
                    : 'bg-[#F5FAFC] text-[#4A5F72] border-[#DFEAF0] hover:bg-white hover:text-[#087F8C]'
                }`}
              >
                {tab.label}
              </button>
            ))}
        </div>
      </div>

      {/* Empty Accounts Prompt */}
      {!loading && bundle && bundle.accounts.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-amber-900 text-xs font-bold">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <span>
              لا توجد خزائن أو حسابات بنكية مسجلة بعد. للبدء بتسجيل الإيرادات أو سداد المصروفات، قم بإنشاء خزينة أو حساب بنكي حقيقي من تبويب «الخزائن والبنوك».
            </span>
          </div>
          {canManageAccounts && subTab !== 'accounts' && (
            <button
              type="button"
              onClick={() => setSubTab('accounts')}
              className="px-3.5 py-2 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700"
            >
              إضافة خزينة / حساب بنكي
            </button>
          )}
        </div>
      )}

      {/* 1. DASHBOARD SUB-TAB */}
      {subTab === 'dashboard' && dashboardMetrics && bundle && (
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h3 className="text-base font-black text-[#172B3A] flex items-center gap-2">
                <CalendarDays size={18} className="text-[#087F8C]" />
                فلترة المؤشرات المالية
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['today', 'اليوم'],
                    ['week', 'هذا الأسبوع'],
                    ['month', 'هذا الشهر'],
                    ['year', 'هذا العام'],
                    ['custom', 'فترة مخصصة'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                      periodPreset === key
                        ? 'bg-[#087F8C] text-white border-[#087F8C]'
                        : 'bg-[#F5FAFC] text-[#4A5F72] border-[#DFEAF0]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">من تاريخ</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setPeriodPreset('custom');
                    setStartDate(e.target.value);
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">إلى تاريخ</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setPeriodPreset('custom');
                    setEndDate(e.target.value);
                  }}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* 12 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'إيرادات اليوم', val: fmtMoney(dashboardMetrics.dailyRevenues), icon: TrendingUp, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
              { label: 'إيرادات الشهر الحالي', val: fmtMoney(dashboardMetrics.monthlyRevenues), icon: TrendingUp, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
              { label: 'إجمالي إيرادات الفترة', val: fmtMoney(dashboardMetrics.periodRevenueTotal), icon: Banknote, color: 'text-[#087F8C] bg-[#087F8C]/10 border-[#087F8C]/20' },
              { label: 'مصروفات اليوم', val: fmtMoney(dashboardMetrics.dailyExpenses), icon: TrendingDown, color: 'text-rose-700 bg-rose-50 border-rose-200' },
              { label: 'مصروفات الشهر الحالي', val: fmtMoney(dashboardMetrics.monthlyExpenses), icon: TrendingDown, color: 'text-rose-700 bg-rose-50 border-rose-200' },
              { label: 'إجمالي مصروفات الفترة', val: fmtMoney(dashboardMetrics.periodExpenseTotal), icon: Receipt, color: 'text-rose-700 bg-rose-50 border-rose-200' },
              {
                label: 'صافي الربح التشغيلي',
                val: canViewSensitive ? fmtMoney(dashboardMetrics.netOperatingProfit) : 'مقيد الصلاحية',
                icon: Lock,
                color: dashboardMetrics.netOperatingProfit >= 0 ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-red-700 bg-red-50 border-red-200',
              },
              { label: 'إجمالي رصيد الخزائن', val: fmtMoney(dashboardMetrics.cashboxBalance), icon: Wallet, color: 'text-[#087F8C] bg-[#087F8C]/10 border-[#087F8C]/20' },
              {
                label: 'إجمالي أرصدة البنوك',
                val: canViewSensitive ? fmtMoney(dashboardMetrics.bankBalance) : 'مقيد الصلاحية',
                icon: Building2,
                color: 'text-blue-700 bg-blue-50 border-blue-200',
              },
              { label: 'مستحقات حجوزات غير محصلة', val: fmtMoney(dashboardMetrics.uncollectedBookingReceivables), icon: AlertTriangle, color: 'text-amber-700 bg-amber-50 border-amber-200' },
              { label: 'مصروفات غير مسددة بالكامل', val: fmtMoney(dashboardMetrics.unpaidExpensePayables), icon: FileText, color: 'text-orange-700 bg-orange-50 border-orange-200' },
              {
                label: 'الحجوزات المدفوعة / غير المدفوعة',
                val: `${dashboardMetrics.paidBookingsCount} مدفوع / ${dashboardMetrics.unpaidBookingsCount} غير مدفوع`,
                icon: CheckCircle,
                color: 'text-slate-700 bg-slate-50 border-slate-200',
              },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className={`rounded-2xl border p-5 bg-white shadow-xs ${kpi.color.includes('border-') ? '' : 'border-[#DFEAF0]'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#718394]">{kpi.label}</span>
                    <span className={`p-2 rounded-xl border ${kpi.color}`}>
                      <Icon size={16} />
                    </span>
                  </div>
                  <div className="text-lg font-black text-[#172B3A] fv-num">{kpi.val}</div>
                </div>
              );
            })}
          </div>

          {/* Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={cardClass}>
              <h4 className="font-black text-sm text-[#172B3A] mb-3">الإيرادات حسب الطبيب</h4>
              {dashboardMetrics.revenueByDoctor.length === 0 ? (
                <p className="text-xs text-[#718394]">لا توجد قيود إيرادات في الفترة المحددة.</p>
              ) : (
                <div className="space-y-2">
                  {dashboardMetrics.revenueByDoctor.slice(0, 6).map((item) => (
                    <div key={item.label} className="flex justify-between text-xs font-bold bg-[#F5FAFC] px-3 py-2 rounded-xl border border-[#DFEAF0]">
                      <span>{item.label} ({item.count})</span>
                      <span className="text-[#087F8C] fv-num">{fmtMoney(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={cardClass}>
              <h4 className="font-black text-sm text-[#172B3A] mb-3">الإيرادات حسب الخدمة</h4>
              {dashboardMetrics.revenueByService.length === 0 ? (
                <p className="text-xs text-[#718394]">لا توجد قيود إيرادات في الفترة المحددة.</p>
              ) : (
                <div className="space-y-2">
                  {dashboardMetrics.revenueByService.slice(0, 6).map((item) => (
                    <div key={item.label} className="flex justify-between text-xs font-bold bg-[#F5FAFC] px-3 py-2 rounded-xl border border-[#DFEAF0]">
                      <span>{item.label} ({item.count})</span>
                      <span className="text-[#087F8C] fv-num">{fmtMoney(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={cardClass}>
              <h4 className="font-black text-sm text-[#172B3A] mb-3">الإيرادات حسب مصدر الحجز</h4>
              {dashboardMetrics.revenueByBookingSource.length === 0 ? (
                <p className="text-xs text-[#718394]">لا توجد قيود إيرادات في الفترة المحددة.</p>
              ) : (
                <div className="space-y-2">
                  {dashboardMetrics.revenueByBookingSource.map((item) => (
                    <div key={item.label} className="flex justify-between text-xs font-bold bg-[#F5FAFC] px-3 py-2 rounded-xl border border-[#DFEAF0]">
                      <span>{item.label} ({item.count})</span>
                      <span className="text-[#087F8C] fv-num">{fmtMoney(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 7: Patient Billing & Receivables Dashboard Integration */}
          {canViewBalances && patientBillingMetrics && (
            <div className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h4 className="font-black text-base text-[#172B3A] flex items-center gap-2">
                  <Users size={18} className="text-[#087F8C]" />
                  مؤشرات حسابات المرضى والمستحقات
                </h4>
                {canViewPatientAccounts && (
                  <button
                    type="button"
                    onClick={() => setSubTab('patient-accounts')}
                    className="px-3.5 py-1.5 rounded-xl bg-[#087F8C]/10 text-[#087F8C] text-xs font-black hover:bg-[#087F8C]/20"
                  >
                    عرض سجل حسابات المرضى
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                  { label: 'إجمالي مستحقات المرضى', val: fmtMoney(patientBillingMetrics.totalReceivablesDue), cls: 'bg-[#F5FAFC] border-[#DFEAF0] text-[#172B3A]' },
                  { label: 'إجمالي المبالغ غير المدفوعة', val: fmtMoney(patientBillingMetrics.totalUnpaidAmount), cls: 'bg-rose-50/70 border-rose-200 text-rose-700' },
                  { label: 'إجمالي المدفوعات الجزئية', val: fmtMoney(patientBillingMetrics.totalPartialPaidAmount), cls: 'bg-amber-50/70 border-amber-200 text-amber-800' },
                  { label: 'إجمالي المبالغ المحصلة', val: fmtMoney(patientBillingMetrics.totalCollectedAmount), cls: 'bg-emerald-50/70 border-emerald-200 text-emerald-700' },
                  { label: 'إجمالي المبالغ المتبقية', val: fmtMoney(patientBillingMetrics.totalRemainingAmount), cls: 'bg-orange-50/70 border-orange-200 text-orange-700' },
                  { label: 'عدد الحجوزات التي لم يتم سدادها', val: `${patientBillingMetrics.unpaidBookingsCount}`, cls: 'bg-rose-50/50 border-rose-200 text-rose-700' },
                  { label: 'عدد الحجوزات التي تم سدادها بالكامل', val: `${patientBillingMetrics.fullyPaidBookingsCount}`, cls: 'bg-emerald-50/50 border-emerald-200 text-emerald-700' },
                  { label: 'عدد الحجوزات المدفوعة جزئيًا', val: `${patientBillingMetrics.partiallyPaidBookingsCount}`, cls: 'bg-amber-50/50 border-amber-200 text-amber-800' },
                  { label: 'إجمالي المبالغ المستردة', val: `${fmtMoney(patientBillingMetrics.totalRefundedAmount)} (${patientBillingMetrics.refundedBookingsCount})`, cls: 'bg-purple-50/70 border-purple-200 text-purple-700' },
                  { label: 'الحجوزات الملغاة (سجل محفوظ)', val: `${patientBillingMetrics.cancelledBookingsCount}`, cls: 'bg-slate-50 border-slate-200 text-slate-700' },
                ].map((item) => (
                  <div key={item.label} className={`rounded-2xl border p-4 ${item.cls}`}>
                    <div className="text-[11px] font-bold text-[#718394] mb-1">{item.label}</div>
                    <div className="text-base font-black fv-num">{item.val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 1.5 PATIENT ACCOUNTS & RECEIVABLES SUB-TAB (حسابات المرضى والمستحقات) */}
      {subTab === 'patient-accounts' && bundle && canViewPatientAccounts && (
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-black text-[#172B3A] flex items-center gap-2">
                  <Users size={18} className="text-[#087F8C]" />
                  حسابات المرضى والمستحقات ({filteredBillingRecords.length})
                </h3>
                <p className="text-xs text-[#718394] mt-0.5">
                  سجل مالي موحد لكل الحجوزات المستحقة من الموقع أو الموظفين أو الإدارة؛ لا تتغير حالة السداد إلا بمعاملة دفع مؤكدة.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await withMinSpin(async () => {
                        await syncBookingsToPatientBilling();
                        await Promise.all([refreshAccounting(), Promise.resolve(onRefresh?.())]);
                      });
                      toast.success('تمت مزامنة الحجوزات والمستحقات بنجاح');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#087F8C]/10 text-[#087F8C] text-xs font-black flex items-center gap-1.5 hover:bg-[#087F8C]/20 disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                  مزامنة الحجوزات
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const htmlRows = filteredBillingRecords
                      .map(
                        (r) => `<tr>
                          <td>${DOMPurify.sanitize(r.patientName)}</td>
                          <td>${DOMPurify.sanitize(r.patientPhone)}</td>
                          <td>${DOMPurify.sanitize(r.bookingSource === 'staff' ? 'موظف' : r.bookingSource === 'admin' ? 'إدارة' : 'الموقع')}</td>
                          <td>${DOMPurify.sanitize(r.doctorName)}</td>
                          <td>${DOMPurify.sanitize(r.serviceName)}</td>
                          <td>${DOMPurify.sanitize(r.appointmentDate)}</td>
                          <td>${r.originalPrice}</td>
                          <td>${r.discountAmount}</td>
                          <td>${r.finalAmountDue}</td>
                          <td>${r.paidAmount}</td>
                          <td>${r.remainingBalance}</td>
                          <td>${DOMPurify.sanitize(r.financialStatus)}</td>
                        </tr>`,
                      )
                      .join('');
                    onPrint(
                      'تقرير حسابات المرضى والمستحقات',
                      `<table><thead><tr><th>المريض</th><th>الهاتف</th><th>المصدر</th><th>الطبيب</th><th>الخدمة</th><th>تاريخ الموعد</th><th>الأصلي</th><th>الخصم</th><th>الصافي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>${htmlRows}</tbody></table>`,
                    );
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0] text-[#1769AA] text-xs font-black flex items-center gap-1.5 hover:bg-white"
                >
                  <Printer size={14} /> طباعة
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#F5FAFC] p-4 rounded-2xl border border-[#DFEAF0]">
              <div>
                <label className="text-[11px] font-bold text-[#718394] mb-1 flex items-center gap-1">
                  <Search size={12} /> بحث (المريض / الهاتف / الحجز)
                </label>
                <input
                  type="text"
                  value={pbFilters.search || ''}
                  onChange={(e) => setPbFilters((f) => ({ ...f, search: e.target.value }))}
                  placeholder="الاسم أو 01... أو رقم الحجز"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#718394] mb-1 block">مصدر الحجز</label>
                <select
                  value={pbFilters.bookingSource || ''}
                  onChange={(e) => setPbFilters((f) => ({ ...f, bookingSource: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">كل المصادر</option>
                  <option value="website">الموقع الإلكتروني</option>
                  <option value="staff">حجز موظف</option>
                  <option value="admin">حجز إدارة</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#718394] mb-1 block">الحالة المالية</label>
                <select
                  value={pbFilters.financialStatus || ''}
                  onChange={(e) => setPbFilters((f) => ({ ...f, financialStatus: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">كل الحالات</option>
                  {PATIENT_FINANCIAL_STATUSES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#718394] mb-1 block">الطبيب</label>
                <select
                  value={pbFilters.doctorName || ''}
                  onChange={(e) => setPbFilters((f) => ({ ...f, doctorName: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">كل الأطباء</option>
                  {doctors.map((d) => (
                    <option key={d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#718394] mb-1 block">الخدمة الطبية</label>
                <select
                  value={pbFilters.serviceName || ''}
                  onChange={(e) => setPbFilters((f) => ({ ...f, serviceName: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">كل الخدمات</option>
                  {services.map((s) => (
                    <option key={s.title} value={s.title}>{s.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#718394] mb-1 block">الموظف</label>
                <select
                  value={pbFilters.staffName || ''}
                  onChange={(e) => setPbFilters((f) => ({ ...f, staffName: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">كل الموظفين</option>
                  {staffMembers.map((s) => (
                    <option key={s.user_id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#718394] mb-1 block">من تاريخ الموعد</label>
                <input
                  type="date"
                  value={pbFilters.startDate || ''}
                  onChange={(e) => setPbFilters((f) => ({ ...f, startDate: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#718394] mb-1 block">إلى تاريخ الموعد</label>
                <input
                  type="date"
                  value={pbFilters.endDate || ''}
                  onChange={(e) => setPbFilters((f) => ({ ...f, endDate: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            {Object.values(pbFilters).some(Boolean) && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setPbFilters({})}
                  className="text-xs font-bold text-[#087F8C] hover:underline"
                >
                  إعادة ضبط الفلاتر
                </button>
              </div>
            )}
          </div>

          <div className={`${cardClass} overflow-x-auto`}>
            <table className="w-full text-right text-xs">
              <thead className="bg-[#F5FAFC] text-[#718394] border-b border-[#DFEAF0]">
                <tr>
                  <th className="p-3 font-bold">المريض والهاتف</th>
                  <th className="p-3 font-bold">الحجز والمصدر</th>
                  <th className="p-3 font-bold">الطبيب والخدمة</th>
                  <th className="p-3 font-bold">تاريخ الموعد / الإنشاء</th>
                  <th className="p-3 font-bold">السعر الأصلي</th>
                  <th className="p-3 font-bold">الخصم</th>
                  <th className="p-3 font-bold">المستحق النهائي</th>
                  <th className="p-3 font-bold">المدفوع</th>
                  <th className="p-3 font-bold">المتبقي</th>
                  <th className="p-3 font-bold">الحالة</th>
                  <th className="p-3 font-bold text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFEAF0]">
                {filteredBillingRecords.map((rec) => {
                  const netPaid = Math.max(rec.paidAmount - rec.refundedAmount, 0);
                  const canCollect =
                    (canConfirmFullPayment || canConfirmPartialPayment) &&
                    rec.bookingStatus !== 'cancelled' &&
                    rec.remainingBalance > 0;
                  const sourceLabel =
                    rec.bookingSource === 'staff'
                      ? 'حجز موظف'
                      : rec.bookingSource === 'admin'
                        ? 'حجز إدارة'
                        : 'الموقع الإلكتروني';
                  return (
                    <tr key={rec.id} className="hover:bg-[#F5FAFC]/70">
                      <td className="p-3">
                        <div className="font-bold text-[#172B3A]">{rec.patientName}</div>
                        <div className="text-[11px] text-[#718394] fv-num" dir="ltr">{rec.patientPhone || '-'}</div>
                        {rec.patientId && (
                          <div className="text-[10px] text-[#718394] fv-mono">PID: {rec.patientId.slice(0, 8)}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="fv-mono text-[10px] text-[#718394]">#{rec.bookingId.slice(0, 8)}</div>
                        <span
                          className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            rec.bookingSource === 'staff'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : rec.bookingSource === 'admin'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {sourceLabel}
                        </span>
                        {rec.createdByStaffName && (
                          <div className="text-[10px] text-[#087F8C] font-semibold mt-0.5">
                            الموظف: {rec.createdByStaffName}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-[#087F8C]">د. {rec.doctorName}</div>
                        <div className="text-[11px] text-[#718394]">{rec.serviceName}</div>
                      </td>
                      <td className="p-3 fv-num">
                        <div className="font-bold text-[#172B3A]">{rec.appointmentDate}</div>
                        <div className="text-[10px] text-[#718394]">
                          أُنشئ: {rec.bookingCreatedAt.slice(0, 10)}
                        </div>
                      </td>
                      <td className="p-3 fv-num font-semibold">{fmtMoney(rec.originalPrice)}</td>
                      <td className="p-3 fv-num">
                        <span className="font-semibold text-amber-700">{fmtMoney(rec.discountAmount)}</span>
                        {rec.discountReason && (
                          <div className="text-[10px] text-[#718394]">{rec.discountReason}</div>
                        )}
                      </td>
                      <td className="p-3 fv-num font-black text-[#172B3A]">{fmtMoney(rec.finalAmountDue)}</td>
                      <td className="p-3 fv-num">
                        <span className="font-black text-emerald-700">{fmtMoney(rec.paidAmount)}</span>
                        {rec.refundedAmount > 0 && (
                          <div className="text-[10px] font-bold text-purple-700">
                            مسترد: {fmtMoney(rec.refundedAmount)}
                          </div>
                        )}
                      </td>
                      <td className="p-3 fv-num font-black text-rose-700">{fmtMoney(rec.remainingBalance)}</td>
                      <td className="p-3">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-black border ${PATIENT_FINANCIAL_STATUS_BADGE[rec.financialStatus]}`}>
                          {rec.financialStatus}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          {canCollect && (
                            <button
                              type="button"
                              onClick={() => handleOpenPbCollect(rec)}
                              className="px-2.5 py-1 rounded-lg bg-[#087F8C] text-white font-black hover:bg-[#066D78] flex items-center gap-1"
                              title="تأكيد / تحصيل دفعة"
                            >
                              <CreditCard size={12} /> تحصيل
                            </button>
                          )}
                          {canEditPatientAccounts && rec.bookingStatus !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => {
                                setPbDiscountRecord(rec);
                                setPbDiscountVal(String(rec.discountAmount));
                                setPbDiscountReason(rec.discountReason || '');
                              }}
                              className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-bold hover:bg-amber-100"
                            >
                              خصم
                            </button>
                          )}
                          {canRefundPayment && netPaid > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setPbRefundRecord(rec);
                                setPbRefundAmount(String(netPaid));
                                setPbRefundMethod('cash');
                                setPbRefundAccountId(activeAccounts[0]?.id || '');
                                setPbRefundReason('');
                              }}
                              className="px-2 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 font-bold hover:bg-purple-100 flex items-center gap-1"
                            >
                              <RotateCcw size={12} /> استرداد
                            </button>
                          )}
                          {canViewBillingHistory && (
                            <button
                              type="button"
                              onClick={() => setPbHistoryRecord(rec)}
                              className="px-2 py-1 rounded-lg bg-[#F5FAFC] text-[#172B3A] border border-[#DFEAF0] font-bold hover:bg-white"
                            >
                              السجل
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredBillingRecords.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-[#718394] font-bold">
                      لا توجد سجلات مالية مطابقة للبحث. اضغط على «مزامنة الحجوزات» لجلب أحدث الحجوزات.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. REVENUES SUB-TAB */}
      {subTab === 'revenues' && bundle && (
        <div className="space-y-6">
          {canCreateRevenue && (
            <form onSubmit={handleRecordRevenueSubmit} className={cardClass}>
              <h3 className="text-base font-black text-[#172B3A] mb-4 flex items-center gap-2">
                <Plus size={18} className="text-[#087F8C]" />
                تسجيل قيد إيراد جديد
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">التاريخ *</label>
                  <input type="date" value={revDate} onChange={(e) => setRevDate(e.target.value)} className={inputClass} required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">تصنيف الإيراد *</label>
                  <select value={revCategoryId} onChange={(e) => setRevCategoryId(e.target.value)} className={inputClass}>
                    {revenueCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.nameAr}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">مصدر الإيراد</label>
                  <select value={revSource} onChange={(e) => setRevSource(e.target.value as RevenueSourceType)} className={inputClass}>
                    {Object.entries(REVENUE_SOURCE_LABELS).map(([k, lbl]) => (
                      <option key={k} value={k}>{lbl}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الوصف / البيان *</label>
                  <input type="text" value={revDescription} onChange={(e) => setRevDescription(e.target.value)} className={inputClass} placeholder="مثال: رسوم كشف أو خدمة طبية" required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">المبلغ (ج.م) *</label>
                  <input type="number" step="0.01" min="0.01" value={revAmount} onChange={(e) => setRevAmount(e.target.value)} className={`${inputClass} fv-num`} required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">طريقة الدفع *</label>
                  <select value={revMethod} onChange={(e) => setRevMethod(e.target.value as Exclude<AccountingPaymentMethod, 'other'>)} className={inputClass}>
                    {(['cash', 'instapay', 'wallet', 'paymob', 'bank_transfer', 'card'] as const).map((m) => (
                      <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الخزينة / الحساب البنكي المستلم *</label>
                  <select value={revAccountId} onChange={(e) => setRevAccountId(e.target.value)} className={inputClass} required>
                    <option value="">اختر الحساب</option>
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.accountType === 'cashbox' ? 'خزينة' : 'بنك'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">اسم المريض (اختياري)</label>
                  <input type="text" value={revPatientName} onChange={(e) => setRevPatientName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الطبيب (اختياري)</label>
                  <select value={revDoctorName} onChange={(e) => setRevDoctorName(e.target.value)} className={inputClass}>
                    <option value="">بدون ربط بطبيب</option>
                    {doctors.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الخدمة (اختياري)</label>
                  <select value={revServiceName} onChange={(e) => setRevServiceName(e.target.value)} className={inputClass}>
                    <option value="">بدون ربط بخدمة</option>
                    {services.map((s) => <option key={s.title} value={s.title}>{s.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">إيصال / مرفق (اختياري)</label>
                  <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[#087F8C]/40 bg-[#F5FAFC] text-xs font-bold text-[#087F8C] cursor-pointer">
                    <Upload size={16} />
                    <span>إرفاق ملف ({revAttachments.length})</span>
                    <input type="file" onChange={(e) => handleAttachmentUpload(e, setRevAttachments)} className="hidden" />
                  </label>
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs font-bold text-[#718394] mb-1 block">ملاحظات</label>
                  <input type="text" value={revNotes} onChange={(e) => setRevNotes(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {canCreateReceipt ? (
                  <label className="flex items-center gap-2 text-xs font-bold text-[#172B3A] cursor-pointer">
                    <input type="checkbox" checked={revIssueVoucher} onChange={(e) => setRevIssueVoucher(e.target.checked)} className="w-4 h-4 accent-[#087F8C]" />
                    <span>إصدار سند قبض آلي مرتبط بهذا الإيراد (بدون تكرار الرصيد)</span>
                  </label>
                ) : <span />}
                <button type="submit" disabled={busy} className="fv-btn-primary px-6 py-3 rounded-xl font-black text-sm flex items-center gap-2 disabled:opacity-60">
                  <Plus size={16} /> حفظ قيد الإيراد
                </button>
              </div>
            </form>
          )}

          {canViewRevenues && (
            <div className={`${cardClass} overflow-x-auto`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-base font-black text-[#172B3A]">سجل الإيرادات ({bundle.revenues.length})</h3>
                <input
                  type="text"
                  value={revSearch}
                  onChange={(e) => setRevSearch(e.target.value)}
                  placeholder="بحث برقم القيد أو البيان أو المريض..."
                  className={`${inputClass} max-w-xs py-2`}
                />
              </div>
              <table className="w-full text-right text-xs">
                <thead className="bg-[#F5FAFC] text-[#718394] border-b border-[#DFEAF0]">
                  <tr>
                    <th className="p-3 font-bold">رقم القيد</th>
                    <th className="p-3 font-bold">التاريخ</th>
                    <th className="p-3 font-bold">التصنيف والمصدر</th>
                    <th className="p-3 font-bold">البيان</th>
                    <th className="p-3 font-bold">الوسيلة / الحساب</th>
                    <th className="p-3 font-bold">المبلغ</th>
                    <th className="p-3 font-bold">الحالة</th>
                    <th className="p-3 font-bold text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFEAF0]">
                  {bundle.revenues
                    .filter((r) => {
                      const q = revSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        r.docNumber.toLowerCase().includes(q) ||
                        r.description.toLowerCase().includes(q) ||
                        (r.patientName || '').toLowerCase().includes(q)
                      );
                    })
                    .map((r) => {
                      const accName = bundle.accounts.find((a) => a.id === r.accountId)?.name || '-';
                      return (
                        <tr key={r.id} className={r.status === 'reversed' ? 'bg-red-50/40 text-[#718394]' : ''}>
                          <td className="p-3 font-black fv-num">{r.docNumber}</td>
                          <td className="p-3 fv-num">{r.revenueDate}</td>
                          <td className="p-3">
                            <div className="font-bold text-[#172B3A]">{r.categoryName}</div>
                            <div className="text-[11px] text-[#718394]">{REVENUE_SOURCE_LABELS[r.revenueSource]}</div>
                          </td>
                          <td className="p-3">
                            <div>{r.description}</div>
                            {r.patientName && <div className="text-[11px] text-[#087F8C] font-bold">المريض: {r.patientName}</div>}
                            {r.reversalReason && <div className="text-[11px] text-red-600 font-bold">سبب العكس: {r.reversalReason}</div>}
                          </td>
                          <td className="p-3">
                            <div>{PAYMENT_METHOD_LABELS[r.paymentMethod]}</div>
                            <div className="text-[11px] text-[#718394]">{accName}</div>
                          </td>
                          <td className="p-3 font-black text-emerald-700 fv-num">{fmtMoney(r.amount)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${r.status === 'posted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                              {r.status === 'posted' ? 'معتمد' : 'معكوس'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {r.status === 'posted' && canReverseRevenue && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReversingTarget({ kind: 'revenue', item: r, title: `عكس قيد الإيراد ${r.docNumber}` });
                                  setReversalReasonInput('');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 font-bold hover:bg-red-100 inline-flex items-center gap-1"
                              >
                                <Ban size={13} /> عكس القيد
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  {bundle.revenues.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-[#718394] font-bold">لا توجد إيرادات مسجلة حتى الآن.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. EXPENSES SUB-TAB */}
      {subTab === 'expenses' && bundle && (
        <div className="space-y-6">
          {canCreateExpense && (
            <form onSubmit={handleRecordExpenseSubmit} className={cardClass}>
              <h3 className="text-base font-black text-[#172B3A] mb-4 flex items-center gap-2">
                <Plus size={18} className="text-[#087F8C]" />
                تسجيل مصروف جديد (كلي / جزئي / آجل غير مسدد)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">التاريخ *</label>
                  <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className={inputClass} required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">تصنيف المصروف *</label>
                  <select value={expCategoryId} onChange={(e) => setExpCategoryId(e.target.value)} className={inputClass}>
                    {expenseCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.nameAr}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">المستفيد / المورد *</label>
                  <input type="text" value={expBeneficiary} onChange={(e) => setExpBeneficiary(e.target.value)} className={inputClass} placeholder="اسم المورد أو المستلم" required />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-[#718394] mb-1 block">البيان / الوصف *</label>
                  <input type="text" value={expDescription} onChange={(e) => setExpDescription(e.target.value)} className={inputClass} required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">رقم الفاتورة (اختياري)</label>
                  <input type="text" value={expInvoiceNum} onChange={(e) => setExpInvoiceNum(e.target.value)} className={`${inputClass} fv-num`} />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">إجمالي المصروف (ج.م) *</label>
                  <input type="number" step="0.01" min="0.01" value={expTotalAmount} onChange={(e) => setExpTotalAmount(e.target.value)} className={`${inputClass} fv-num`} required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">المسدد الآن (0 = غير مسدد)</label>
                  <input type="number" step="0.01" min="0" value={expPaidNowAmount} onChange={(e) => setExpPaidNowAmount(e.target.value)} className={`${inputClass} fv-num`} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">طريقة السداد</label>
                  <select value={expMethod} onChange={(e) => setExpMethod(e.target.value as AccountingPaymentMethod)} className={inputClass}>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, lbl]) => (
                      <option key={k} value={k}>{lbl}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الخزينة / الحساب البنكي (عند وجود سداد)</label>
                  <select value={expAccountId} onChange={(e) => setExpAccountId(e.target.value)} className={inputClass}>
                    <option value="">اختر الحساب</option>
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">مرفق الفاتورة</label>
                  <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[#087F8C]/40 bg-[#F5FAFC] text-xs font-bold text-[#087F8C] cursor-pointer">
                    <Upload size={16} />
                    <span>إرفاق ملف ({expAttachments.length})</span>
                    <input type="file" onChange={(e) => handleAttachmentUpload(e, setExpAttachments)} className="hidden" />
                  </label>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">ملاحظات</label>
                  <input type="text" value={expNotes} onChange={(e) => setExpNotes(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {canCreateDisbursement ? (
                  <label className="flex items-center gap-2 text-xs font-bold text-[#172B3A] cursor-pointer">
                    <input type="checkbox" checked={expIssueVoucher} onChange={(e) => setExpIssueVoucher(e.target.checked)} className="w-4 h-4 accent-[#087F8C]" />
                    <span>إصدار سند صرف للمبلغ المسدد الآن</span>
                  </label>
                ) : <span />}
                <button type="submit" disabled={busy} className="fv-btn-primary px-6 py-3 rounded-xl font-black text-sm flex items-center gap-2 disabled:opacity-60">
                  <Plus size={16} /> حفظ المصروف
                </button>
              </div>
            </form>
          )}

          {canViewExpenses && (
            <div className={`${cardClass} overflow-x-auto`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-base font-black text-[#172B3A]">سجل المصروفات ({bundle.expenses.length})</h3>
                <select value={expStatusFilter} onChange={(e) => setExpStatusFilter(e.target.value)} className={`${inputClass} max-w-[200px] py-2`}>
                  <option value="">جميع حالات السداد</option>
                  <option value="unpaid">غير مسدد</option>
                  <option value="partial">مسدد جزئياً</option>
                  <option value="paid">مسدد بالكامل</option>
                </select>
              </div>
              <table className="w-full text-right text-xs">
                <thead className="bg-[#F5FAFC] text-[#718394] border-b border-[#DFEAF0]">
                  <tr>
                    <th className="p-3 font-bold">رقم القيد</th>
                    <th className="p-3 font-bold">التاريخ</th>
                    <th className="p-3 font-bold">التصنيف والمستفيد</th>
                    <th className="p-3 font-bold">البيان</th>
                    <th className="p-3 font-bold">الإجمالي</th>
                    <th className="p-3 font-bold">المسدد</th>
                    <th className="p-3 font-bold">المتبقي</th>
                    <th className="p-3 font-bold">الحالة</th>
                    <th className="p-3 font-bold text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFEAF0]">
                  {bundle.expenses
                    .filter((e) => !expStatusFilter || e.paymentStatus === expStatusFilter)
                    .map((exp) => (
                      <tr key={exp.id} className={exp.status === 'reversed' ? 'bg-red-50/40 text-[#718394]' : ''}>
                        <td className="p-3 font-black fv-num">{exp.docNumber}</td>
                        <td className="p-3 fv-num">{exp.expenseDate}</td>
                        <td className="p-3">
                          <div className="font-bold text-[#172B3A]">{exp.categoryName}</div>
                          <div className="text-[11px] text-[#718394]">{exp.beneficiary}</div>
                        </td>
                        <td className="p-3">
                          <div>{exp.description}</div>
                          {exp.reversalReason && <div className="text-[11px] text-red-600 font-bold">سبب العكس: {exp.reversalReason}</div>}
                        </td>
                        <td className="p-3 font-black fv-num">{fmtMoney(exp.totalAmount)}</td>
                        <td className="p-3 font-bold text-emerald-700 fv-num">{fmtMoney(exp.paidAmount)}</td>
                        <td className="p-3 font-bold text-rose-700 fv-num">{fmtMoney(exp.remainingAmount)}</td>
                        <td className="p-3 space-y-1">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black border ${
                            exp.paymentStatus === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : exp.paymentStatus === 'partial'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {EXPENSE_PAYMENT_STATUS_LABELS[exp.paymentStatus]}
                          </span>
                          {exp.approvalStatus === 'pending' && (
                            <div className="text-[10px] font-bold text-amber-700">بانتظار الاعتماد</div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex flex-wrap justify-center gap-1.5">
                            {exp.status === 'posted' && exp.approvalStatus === 'pending' && canApproveExpense && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await approveAccountingExpense(exp, 'approved', actor);
                                  toast.success('تم اعتماد المصروف');
                                  await refreshAccounting();
                                }}
                                className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold"
                              >
                                اعتماد
                              </button>
                            )}
                            {exp.status === 'posted' && exp.remainingAmount > 0 && canPayExpense && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayingExpense(exp);
                                  setPayAmountInput(String(exp.remainingAmount));
                                  setPayAccountIdInput(activeAccounts[0]?.id || '');
                                  setPayDateInput(today);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-[#087F8C]/10 text-[#087F8C] font-bold hover:bg-[#087F8C]/20"
                              >
                                سداد المتبقي
                              </button>
                            )}
                            {exp.status === 'posted' && canReverseExpense && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReversingTarget({ kind: 'expense', item: exp, title: `عكس المصروف ${exp.docNumber}` });
                                  setReversalReasonInput('');
                                }}
                                className="px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 font-bold"
                              >
                                عكس
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {bundle.expenses.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-[#718394] font-bold">لا توجد مصروفات مسجلة حتى الآن.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. ACCOUNTS & TRANSFERS SUB-TAB */}
      {subTab === 'accounts' && bundle && (
        <div className="space-y-6">
          {canViewAccounts && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bundle.accounts.map((acc) => {
                const isRestrictedBank = acc.accountType === 'bank' && !canViewSensitive;
                const bal = computeAccountBalance(acc, bundle.transactions);
                return (
                  <div key={acc.id} className={cardClass}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-md font-black border mb-1 ${acc.accountType === 'cashbox' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                          {acc.accountType === 'cashbox' ? 'خزينة نقدية' : 'حساب بنكي'}
                        </span>
                        <h4 className="font-black text-base text-[#172B3A]">{acc.name}</h4>
                        {acc.bankName && <p className="text-xs text-[#718394]">{acc.bankName} {acc.accountNumber ? `— ${acc.accountNumber}` : ''}</p>}
                      </div>
                      {canManageOpeningBalances && !isRestrictedBank && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingOpeningAcc(acc);
                            setNewOpeningVal(String(acc.openingBalance));
                            setNewOpeningReason('');
                          }}
                          className="text-[11px] font-bold text-[#087F8C] bg-[#087F8C]/10 px-2.5 py-1 rounded-lg hover:bg-[#087F8C]/20"
                        >
                          تعديل الرصيد الافتتاحي
                        </button>
                      )}
                    </div>
                    <div className="pt-3 border-t border-[#DFEAF0] flex items-center justify-between text-xs">
                      <span className="text-[#718394] font-bold">الرصيد الحالي:</span>
                      <span className="text-lg font-black text-[#087F8C] fv-num">
                        {isRestrictedBank ? 'مقيد الصلاحية' : fmtMoney(bal)}
                      </span>
                    </div>
                    {!isRestrictedBank && (
                      <div className="text-[11px] text-[#718394] mt-1 fv-num">
                        رصيد افتتاحي: {fmtMoney(acc.openingBalance)} ({acc.openingBalanceDate})
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {canManageAccounts && (
            <form onSubmit={handleCreateAccountSubmit} className={cardClass}>
              <h3 className="text-base font-black text-[#172B3A] mb-4 flex items-center gap-2">
                <Plus size={18} className="text-[#087F8C]" />
                إضافة خزينة أو حساب بنكي جديد
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">النوع *</label>
                  <select value={accType} onChange={(e) => setAccType(e.target.value as AccountType)} className={inputClass}>
                    <option value="cashbox">خزينة نقدية</option>
                    <option value="bank">حساب بنكي / محفظة</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">اسم الحساب *</label>
                  <input type="text" value={accName} onChange={(e) => setAccName(e.target.value)} className={inputClass} placeholder="مثال: الخزينة الرئيسية" required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الكود (اختياري)</label>
                  <input type="text" value={accCode} onChange={(e) => setAccCode(e.target.value)} className={inputClass} placeholder="CASH-01" />
                </div>
                {accType === 'bank' && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-[#718394] mb-1 block">اسم البنك / المحفظة</label>
                      <input type="text" value={accBankName} onChange={(e) => setAccBankName(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#718394] mb-1 block">رقم الحساب / IBAN</label>
                      <input type="text" value={accNumber} onChange={(e) => setAccNumber(e.target.value)} className={`${inputClass} fv-num`} />
                    </div>
                  </>
                )}
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الرصيد الافتتاحي (ج.م)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!canManageOpeningBalances}
                    value={canManageOpeningBalances ? accOpeningBal : '0'}
                    onChange={(e) => setAccOpeningBal(e.target.value)}
                    className={`${inputClass} fv-num disabled:opacity-60`}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">تاريخ الرصيد الافتتاحي</label>
                  <input type="date" value={accOpeningDate} onChange={(e) => setAccOpeningDate(e.target.value)} className={inputClass} />
                </div>
              </div>
              <button type="submit" disabled={busy} className="mt-4 fv-btn-primary px-6 py-3 rounded-xl font-black text-sm">
                حفظ الحساب
              </button>
            </form>
          )}

          {canCreateTransfer && (
            <form onSubmit={handleTransferSubmit} className={cardClass}>
              <h3 className="text-base font-black text-[#172B3A] mb-2 flex items-center gap-2">
                <ArrowLeftRight size={18} className="text-[#087F8C]" />
                تحويل مالي بين الخزائن والحسابات البنكية
              </h3>
              <p className="text-xs text-[#087F8C] font-bold mb-4">
                التحويل بين الحسابات يخفض الحساب المحول منه ويرفع الحساب المحول إليه فقط، ولا يُحتسب كإيراد أو مصروف.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">التاريخ *</label>
                  <input type="date" value={trfDate} onChange={(e) => setTrfDate(e.target.value)} className={inputClass} required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">من حساب *</label>
                  <select value={trfFromId} onChange={(e) => setTrfFromId(e.target.value)} className={inputClass} required>
                    <option value="">اختر الحساب</option>
                    {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">إلى حساب *</label>
                  <select value={trfToId} onChange={(e) => setTrfToId(e.target.value)} className={inputClass} required>
                    <option value="">اختر الحساب</option>
                    {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">المبلغ (ج.م) *</label>
                  <input type="number" step="0.01" min="0.01" value={trfAmount} onChange={(e) => setTrfAmount(e.target.value)} className={`${inputClass} fv-num`} required />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 items-center justify-between">
                <input type="text" value={trfNotes} onChange={(e) => setTrfNotes(e.target.value)} className={`${inputClass} max-w-md`} placeholder="ملاحظات التحويل (اختياري)" />
                <button type="submit" disabled={busy} className="fv-btn-primary px-6 py-3 rounded-xl font-black text-sm">
                  تنفيذ التحويل
                </button>
              </div>
            </form>
          )}

          {canViewAccounts && (
            <div className={`${cardClass} overflow-x-auto`}>
              <h3 className="text-base font-black text-[#172B3A] mb-4">سجل حركات الحسابات والدفتر العام ({bundle.transactions.length})</h3>
              <table className="w-full text-right text-xs">
                <thead className="bg-[#F5FAFC] text-[#718394] border-b border-[#DFEAF0]">
                  <tr>
                    <th className="p-3 font-bold">التاريخ</th>
                    <th className="p-3 font-bold">الحساب</th>
                    <th className="p-3 font-bold">الحركة</th>
                    <th className="p-3 font-bold">البيان</th>
                    <th className="p-3 font-bold">المبلغ</th>
                    <th className="p-3 font-bold">بواسطة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFEAF0]">
                  {bundle.transactions.slice(0, 80).map((t) => {
                    const acc = bundle.accounts.find((a) => a.id === t.accountId);
                    return (
                      <tr key={t.id}>
                        <td className="p-3 fv-num">{t.transactionDate}</td>
                        <td className="p-3 font-bold">{acc?.name || '-'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${t.direction === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {t.direction === 'in' ? 'وارد (+)' : 'صادر (-)'}
                          </span>
                        </td>
                        <td className="p-3">{t.description}</td>
                        <td className="p-3 font-black fv-num">{fmtMoney(t.amount)}</td>
                        <td className="p-3 text-[#718394]">{t.createdByName || '-'}</td>
                      </tr>
                    );
                  })}
                  {bundle.transactions.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-[#718394] font-bold">لا توجد حركات مالية مسجلة بعد.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 5. VOUCHERS SUB-TAB */}
      {subTab === 'vouchers' && bundle && (
        <div className="space-y-6">
          {(canCreateReceipt || canCreateDisbursement) && (
            <form onSubmit={handleVoucherSubmit} className={cardClass}>
              <h3 className="text-base font-black text-[#172B3A] mb-4 flex items-center gap-2">
                <Receipt size={18} className="text-[#087F8C]" />
                إصدار سند قبض أو سند صرف
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">نوع السند *</label>
                  <select value={vchKind} onChange={(e) => setVchKind(e.target.value as VoucherKind)} className={inputClass}>
                    {canCreateReceipt && <option value="receipt">سند قبض</option>}
                    {canCreateDisbursement && <option value="disbursement">سند صرف</option>}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">التاريخ *</label>
                  <input type="date" value={vchDate} onChange={(e) => setVchDate(e.target.value)} className={inputClass} required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">المبلغ (ج.م) *</label>
                  <input type="number" step="0.01" min="0.01" value={vchAmount} onChange={(e) => setVchAmount(e.target.value)} className={`${inputClass} fv-num`} required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">{vchKind === 'receipt' ? 'المستلم منه *' : 'المصروف له *'}</label>
                  <input type="text" value={vchParty} onChange={(e) => setVchParty(e.target.value)} className={inputClass} required />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-[#718394] mb-1 block">السبب / مقابل *</label>
                  <input type="text" value={vchReason} onChange={(e) => setVchReason(e.target.value)} className={inputClass} required />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">طريقة الدفع</label>
                  <select value={vchMethod} onChange={(e) => setVchMethod(e.target.value as AccountingPaymentMethod)} className={inputClass}>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الخزينة / الحساب البنكي</label>
                  <select value={vchAccountId} onChange={(e) => setVchAccountId(e.target.value)} className={inputClass}>
                    <option value="">اختر الحساب</option>
                    {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">ملاحظات</label>
                  <input type="text" value={vchNotes} onChange={(e) => setVchNotes(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-[#172B3A] cursor-pointer">
                  <input type="checkbox" checked={vchAffectsAccount} onChange={(e) => setVchAffectsAccount(e.target.checked)} className="w-4 h-4 accent-[#087F8C]" />
                  <span>ترحيل فوري إلى رصيد الخزينة / الحساب البنكي المحدد</span>
                </label>
                <button type="submit" disabled={busy} className="fv-btn-primary px-6 py-3 rounded-xl font-black text-sm">
                  إصدار وحفظ السند
                </button>
              </div>
            </form>
          )}

          <div className={`${cardClass} overflow-x-auto`}>
            <h3 className="text-base font-black text-[#172B3A] mb-4">سجل السندات</h3>
            <table className="w-full text-right text-xs">
              <thead className="bg-[#F5FAFC] text-[#718394] border-b border-[#DFEAF0]">
                <tr>
                  <th className="p-3 font-bold">رقم السند</th>
                  <th className="p-3 font-bold">النوع</th>
                  <th className="p-3 font-bold">التاريخ</th>
                  <th className="p-3 font-bold">الطرف</th>
                  <th className="p-3 font-bold">البيان</th>
                  <th className="p-3 font-bold">المبلغ</th>
                  <th className="p-3 font-bold text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFEAF0]">
                {bundle.vouchers
                  .filter((v) => (v.voucherKind === 'receipt' ? canViewReceipts || canCreateReceipt : canViewDisbursements || canCreateDisbursement))
                  .map((v) => (
                    <tr key={v.id} className={v.status === 'reversed' ? 'bg-red-50/40 text-[#718394]' : ''}>
                      <td className="p-3 font-black fv-num">{v.voucherNumber}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${v.voucherKind === 'receipt' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                          {v.voucherKind === 'receipt' ? 'سند قبض' : 'سند صرف'}
                        </span>
                      </td>
                      <td className="p-3 fv-num">{v.voucherDate}</td>
                      <td className="p-3 font-bold">{v.partyName}</td>
                      <td className="p-3">{v.reason}</td>
                      <td className="p-3 font-black fv-num">{fmtMoney(v.amount)}</td>
                      <td className="p-3 text-center">
                        <div className="flex justify-center gap-1.5">
                          <button type="button" onClick={() => printVoucher(v)} className="px-2.5 py-1 rounded-lg bg-[#087F8C]/10 text-[#087F8C] font-bold inline-flex items-center gap-1">
                            <Printer size={13} /> طباعة
                          </button>
                          {v.status === 'posted' && (v.voucherKind === 'receipt' ? canReverseRevenue : canReverseExpense) && (
                            <button
                              type="button"
                              onClick={() => {
                                setReversingTarget({ kind: 'voucher', item: v, title: `عكس السند ${v.voucherNumber}` });
                                setReversalReasonInput('');
                              }}
                              className="px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 font-bold"
                            >
                              عكس
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. BOOKING & PAYMENT INTEGRATION SUB-TAB */}
      {subTab === 'integration' && bundle && (
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-black text-[#172B3A]">مدفوعات مؤكدة جاهزة للترحيل المحاسبي (دون تكرار)</h3>
                <p className="text-xs text-[#718394] mt-0.5">
                  إنشاء الحجز لا ينشئ إيراداً تلقائياً؛ يتم الاعتراف بالإيراد عند تأكيد السداد الفعلي وترحيله هنا أو بتسجيل قيد إيراد مباشر.
                </p>
              </div>
              <div className="min-w-[230px]">
                <label className="text-[11px] font-bold text-[#718394] mb-1 block">حساب الترحيل المستهدف</label>
                <select value={integrationAccountId} onChange={(e) => setIntegrationAccountId(e.target.value)} className={`${inputClass} py-2`}>
                  <option value="">اختر خزينة / بنك</option>
                  {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>

            {externalPayments.length === 0 ? (
              <p className="text-xs font-bold text-[#718394] bg-[#F5FAFC] p-4 rounded-xl border border-[#DFEAF0]">
                لا توجد مدفوعات إلكترونية مؤكدة غير مرحلة حالياً.
              </p>
            ) : (
              <div className="space-y-2">
                {externalPayments.map((ext) => (
                  <div key={`${ext.sourceTable}:${ext.sourceId}`} className="flex flex-wrap items-center justify-between gap-3 bg-[#F5FAFC] p-3.5 rounded-xl border border-[#DFEAF0] text-xs">
                    <div>
                      <span className="font-black text-[#172B3A]">{ext.patientName}</span>
                      <span className="mx-2 text-[#718394]">|</span>
                      <span className="font-bold text-[#087F8C]">{PAYMENT_METHOD_LABELS[ext.paymentMethod]}</span>
                      <span className="mx-2 text-[#718394] fv-num">| {ext.date}</span>
                      {ext.reference && <span className="text-[#718394] fv-num">({ext.reference})</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-emerald-700 fv-num">{fmtMoney(ext.amount)}</span>
                      {canCreateRevenue && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handlePostExternalPayment(ext)}
                          className="px-3 py-1.5 rounded-lg bg-[#087F8C] text-white font-black hover:bg-[#066D78]"
                        >
                          ترحيل للإيرادات
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`${cardClass} overflow-x-auto`}>
            <h3 className="text-base font-black text-[#172B3A] mb-4">المركز المالي للحجوزات ({bookingFinancials.length})</h3>
            <table className="w-full text-right text-xs">
              <thead className="bg-[#F5FAFC] text-[#718394] border-b border-[#DFEAF0]">
                <tr>
                  <th className="p-3 font-bold">المريض / الموعد</th>
                  <th className="p-3 font-bold">الطبيب والخدمة</th>
                  <th className="p-3 font-bold">المصدر</th>
                  <th className="p-3 font-bold">قيمة الحجز</th>
                  <th className="p-3 font-bold">المُحصل</th>
                  <th className="p-3 font-bold">المرحل كإيراد</th>
                  <th className="p-3 font-bold">المتبقي</th>
                  <th className="p-3 font-bold text-center">الحالة والإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFEAF0]">
                {bookingFinancials.slice(0, 60).map((row) => (
                  <tr key={row.bookingUuid} className={row.needsRefundOrReversal ? 'bg-amber-50' : ''}>
                    <td className="p-3">
                      <div className="font-bold text-[#172B3A]">{row.patientName}</div>
                      <div className="text-[11px] text-[#718394] fv-num">{row.date} — {row.time}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-[#087F8C]">{row.doctorName}</div>
                      <div className="text-[11px] text-[#718394]">{row.service}</div>
                    </td>
                    <td className="p-3 text-[11px] font-bold">
                      {row.bookingSource === 'staff' ? 'موظف' : row.bookingSource === 'admin' ? 'إدارة' : 'الموقع'}
                    </td>
                    <td className="p-3 font-bold fv-num">{fmtMoney(row.estimatedValue)}</td>
                    <td className="p-3 font-bold text-emerald-700 fv-num">{fmtMoney(row.collectedAmount)}</td>
                    <td className="p-3 font-black text-[#087F8C] fv-num">{fmtMoney(row.recognizedRevenueAmount)}</td>
                    <td className="p-3 font-bold text-rose-700 fv-num">{fmtMoney(row.remainingAmount)}</td>
                    <td className="p-3 text-center">
                      {row.needsRefundOrReversal ? (
                        <span className="inline-block px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 font-black">
                          حجز ملغى — يحتاج استرداد/عكس
                        </span>
                      ) : row.status === 'cancelled' ? (
                        <span className="text-[#718394] font-bold">ملغى</span>
                      ) : row.recognizedRevenueAmount < row.estimatedValue && (canConfirmFullPayment || canConfirmPartialPayment) ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handlePostCashBookingRevenue(row)}
                          className="px-2.5 py-1 rounded-lg bg-[#087F8C]/10 text-[#087F8C] font-black hover:bg-[#087F8C]/20"
                        >
                          تحصيل وترحيل
                        </button>
                      ) : row.recognizedRevenueAmount < row.estimatedValue ? (
                        <span className="text-amber-700 font-bold">بانتظار تأكيد الدفع</span>
                      ) : (
                        <span className="text-emerald-700 font-bold">مرحل بالكامل</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. REPORTS SUB-TAB (ALL 14 REPORTS) */}
      {subTab === 'reports' && bundle && builtReport && (
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-base font-black text-[#172B3A] flex items-center gap-2">
                <Filter size={18} className="text-[#087F8C]" />
                التقارير المحاسبية (14 تقريراً)
              </h3>
              {canExportReports && !builtReport.restricted && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => exportRowsToCsv(`barada_${selectedReport}`, builtReport.headers, builtReport.rows)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black flex items-center gap-1.5 hover:bg-emerald-100"
                  >
                    <Download size={14} /> تصدير CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => exportRowsToExcel(`barada_${selectedReport}`, builtReport.title, builtReport.headers, builtReport.rows)}
                    className="px-3.5 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-black flex items-center gap-1.5 hover:bg-blue-100"
                  >
                    <FileSpreadsheet size={14} /> تصدير Excel
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onPrint(
                        builtReport.title,
                        `<table><thead><tr>${builtReport.headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${builtReport.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-[#087F8C]/10 text-[#087F8C] text-xs font-black flex items-center gap-1.5 hover:bg-[#087F8C]/20"
                  >
                    <Printer size={14} /> طباعة / PDF
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-[#718394] mb-1 block">اختر التقرير</label>
                <select value={selectedReport} onChange={(e) => setSelectedReport(e.target.value as AccountingReportId)} className={inputClass}>
                  {ACCOUNTING_REPORT_DEFS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} {r.sensitive && !canViewSensitive ? '(يتطلب صلاحية بيانات حساسة)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">من تاريخ</label>
                <input type="date" value={reportFilters.startDate} onChange={(e) => setReportFilters((f) => ({ ...f, startDate: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">إلى تاريخ</label>
                <input type="date" value={reportFilters.endDate} onChange={(e) => setReportFilters((f) => ({ ...f, endDate: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">الطبيب</label>
                <select value={reportFilters.doctorName || ''} onChange={(e) => setReportFilters((f) => ({ ...f, doctorName: e.target.value }))} className={inputClass}>
                  <option value="">الكل</option>
                  {doctors.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">الخدمة</label>
                <select value={reportFilters.serviceName || ''} onChange={(e) => setReportFilters((f) => ({ ...f, serviceName: e.target.value }))} className={inputClass}>
                  <option value="">الكل</option>
                  {services.map((s) => <option key={s.title} value={s.title}>{s.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">وسيلة الدفع</label>
                <select value={reportFilters.paymentMethod || ''} onChange={(e) => setReportFilters((f) => ({ ...f, paymentMethod: e.target.value }))} className={inputClass}>
                  <option value="">الكل</option>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">الموظف</label>
                <select value={reportFilters.staffName || ''} onChange={(e) => setReportFilters((f) => ({ ...f, staffName: e.target.value }))} className={inputClass}>
                  <option value="">الكل</option>
                  {staffMembers.map((s) => <option key={s.user_id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className={`${cardClass} overflow-x-auto`}>
            <h4 className="font-black text-base text-[#172B3A] mb-3">{builtReport.title}</h4>
            {builtReport.summaryItems.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-4">
                {builtReport.summaryItems.map((s) => (
                  <div key={s.label} className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl px-4 py-2 text-xs">
                    <span className="text-[#718394] font-bold ml-1.5">{s.label}:</span>
                    <span className="font-black text-[#087F8C] fv-num">{s.value}</span>
                  </div>
                ))}
              </div>
            )}
            <table className="w-full text-right text-xs">
              <thead className="bg-[#F5FAFC] text-[#718394] border-b border-[#DFEAF0]">
                <tr>
                  {builtReport.headers.map((h) => (
                    <th key={h} className="p-3 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFEAF0]">
                {builtReport.rows.map((row, idx) => (
                  <tr key={idx}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="p-3 fv-num">{typeof cell === 'number' ? cell.toLocaleString('en-US') : cell}</td>
                    ))}
                  </tr>
                ))}
                {builtReport.rows.length === 0 && (
                  <tr>
                    <td colSpan={builtReport.headers.length} className="p-6 text-center text-[#718394] font-bold">
                      لا توجد بيانات مطابقة للفترة أو الفلاتر المحددة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. SETTINGS & AUDIT SUB-TAB */}
      {subTab === 'settings' && bundle && (
        <div className="space-y-6">
          {canManageCategories && (
            <div className={cardClass}>
              <h3 className="text-base font-black text-[#172B3A] mb-4">إدارة تصنيفات الإيرادات والمصروفات</h3>
              <div className="flex flex-wrap gap-3 mb-5">
                <select value={newCatKind} onChange={(e) => setNewCatKind(e.target.value as 'revenue' | 'expense')} className={`${inputClass} max-w-[160px]`}>
                  <option value="revenue">تصنيف إيراد</option>
                  <option value="expense">تصنيف مصروف</option>
                </select>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="اسم التصنيف الجديد..."
                  className={`${inputClass} flex-1 min-w-[200px]`}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await createAccountingCategory({ kind: newCatKind, nameAr: newCatName }, actor);
                      toast.success('تمت إضافة التصنيف بنجاح');
                      setNewCatName('');
                      await refreshAccounting();
                    } catch (err: any) {
                      toast.error(err?.message || 'تعذر إضافة التصنيف');
                    }
                  }}
                  className="fv-btn-primary px-5 py-2.5 rounded-xl font-black text-xs"
                >
                  إضافة تصنيف
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(['revenue', 'expense'] as const).map((kind) => (
                  <div key={kind} className="bg-[#F5FAFC] rounded-xl p-4 border border-[#DFEAF0]">
                    <h4 className="font-black text-xs text-[#087F8C] mb-2">
                      {kind === 'revenue' ? 'تصنيفات الإيرادات' : 'تصنيفات المصروفات'}
                    </h4>
                    <div className="space-y-1.5">
                      {bundle.categories
                        .filter((c) => c.kind === kind)
                        .map((cat) => (
                          <div key={cat.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-[#DFEAF0] text-xs">
                            <span className={`font-bold ${cat.isActive ? 'text-[#172B3A]' : 'line-through text-[#718394]'}`}>{cat.nameAr}</span>
                            <button
                              type="button"
                              onClick={async () => {
                                await toggleAccountingCategory(cat, !cat.isActive, actor);
                                await refreshAccounting();
                              }}
                              className="text-[11px] font-bold text-[#087F8C] hover:underline"
                            >
                              {cat.isActive ? 'تعطيل' : 'تفعيل'}
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canManageSettings && (
            <div className={cardClass}>
              <h3 className="text-base font-black text-[#172B3A] mb-4 flex items-center gap-2">
                <Settings size={18} className="text-[#087F8C]" />
                إعدادات النظام المحاسبي
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الرقم الضريبي للمركز (اختياري)</label>
                  <input type="text" value={settingsDraft.clinicTaxNumber || ''} onChange={(e) => setSettingsDraft((s) => ({ ...s, clinicTaxNumber: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">شهر بداية السنة المالية</label>
                  <input type="number" min="1" max="12" value={settingsDraft.fiscalYearStartMonth} onChange={(e) => setSettingsDraft((s) => ({ ...s, fiscalYearStartMonth: Number(e.target.value) }))} className={`${inputClass} fv-num`} />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">إغلاق الفترة قبل تاريخ</label>
                  <input type="date" value={settingsDraft.lockBeforeDate || ''} onChange={(e) => setSettingsDraft((s) => ({ ...s, lockBeforeDate: e.target.value }))} className={inputClass} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-[#718394] mb-1 block">تذييل سندات القبض والصرف</label>
                  <input type="text" value={settingsDraft.voucherNotesFooter || ''} onChange={(e) => setSettingsDraft((s) => ({ ...s, voucherNotesFooter: e.target.value }))} className={inputClass} />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-[#172B3A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsDraft.requireExpenseApproval}
                      onChange={(e) => setSettingsDraft((s) => ({ ...s, requireExpenseApproval: e.target.checked }))}
                      className="w-4 h-4 accent-[#087F8C]"
                    />
                    <span>اشتراط اعتماد المصروفات غير المسددة</span>
                  </label>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  await updateAccountingSettings(settingsDraft, actor);
                  toast.success('تم حفظ إعدادات المحاسبة بنجاح');
                  await refreshAccounting();
                }}
                className="mt-4 fv-btn-primary px-6 py-3 rounded-xl font-black text-sm flex items-center gap-2"
              >
                <ShieldCheck size={16} /> حفظ الإعدادات
              </button>
            </div>
          )}

          <div className={`${cardClass} overflow-x-auto`}>
            <h3 className="text-base font-black text-[#172B3A] mb-4 flex items-center gap-2">
              <History size={18} className="text-[#087F8C]" />
              سجل التدقيق المحاسبي والاستثناءات ({bundle.auditLogs.length})
            </h3>
            <table className="w-full text-right text-xs">
              <thead className="bg-[#F5FAFC] text-[#718394] border-b border-[#DFEAF0]">
                <tr>
                  <th className="p-3 font-bold">التاريخ والوقت</th>
                  <th className="p-3 font-bold">الموظف</th>
                  <th className="p-3 font-bold">الإجراء</th>
                  <th className="p-3 font-bold">الملخص</th>
                  <th className="p-3 font-bold">السبب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFEAF0]">
                {bundle.auditLogs.slice(0, 80).map((log) => (
                  <tr key={log.id}>
                    <td className="p-3 fv-num text-[11px]">{log.createdAt.replace('T', ' ').slice(0, 16)}</td>
                    <td className="p-3 font-bold">{log.actorName}</td>
                    <td className="p-3 font-bold text-[#087F8C]">{log.action}</td>
                    <td className="p-3">{log.summary}</td>
                    <td className="p-3 text-amber-800">{log.reason || '-'}</td>
                  </tr>
                ))}
                {bundle.auditLogs.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-[#718394] font-bold">لا توجد سجلات تدقيق بعد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Pay Existing Expense */}
      {payingExpense && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs">
          <form onSubmit={handlePayExpenseSubmit} className="bg-white rounded-3xl border border-[#DFEAF0] max-w-md w-full p-6 space-y-4">
            <h4 className="font-black text-base text-[#172B3A]">سداد دفعة على المصروف {payingExpense.docNumber}</h4>
            <p className="text-xs text-[#718394] font-bold">المتبقي للسداد: {fmtMoney(payingExpense.remainingAmount)}</p>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">المبلغ المسدد *</label>
              <input type="number" step="0.01" min="0.01" max={payingExpense.remainingAmount} value={payAmountInput} onChange={(e) => setPayAmountInput(e.target.value)} className={`${inputClass} fv-num`} required />
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">تاريخ السداد</label>
              <input type="date" value={payDateInput} onChange={(e) => setPayDateInput(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">طريقة السداد</label>
              <select value={payMethodInput} onChange={(e) => setPayMethodInput(e.target.value as AccountingPaymentMethod)} className={inputClass}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">الحساب / الخزينة *</label>
              <select value={payAccountIdInput} onChange={(e) => setPayAccountIdInput(e.target.value)} className={inputClass} required>
                {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {canCreateDisbursement && (
              <label className="flex items-center gap-2 text-xs font-bold text-[#172B3A]">
                <input type="checkbox" checked={payIssueVoucherInput} onChange={(e) => setPayIssueVoucherInput(e.target.checked)} className="w-4 h-4 accent-[#087F8C]" />
                <span>إصدار سند صرف بهذه الدفعة</span>
              </label>
            )}
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={busy} className="flex-1 fv-btn-primary py-3 rounded-xl font-black text-xs">تأكيد السداد</button>
              <button type="button" onClick={() => setPayingExpense(null)} className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] py-3 rounded-xl font-bold text-xs text-[#718394]">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Opening Balance */}
      {editingOpeningAcc && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#DFEAF0] max-w-md w-full p-6 space-y-4">
            <h4 className="font-black text-base text-[#172B3A]">تعديل الرصيد الافتتاحي: {editingOpeningAcc.name}</h4>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">الرصيد الافتتاحي الجديد (ج.م)</label>
              <input type="number" step="0.01" min="0" value={newOpeningVal} onChange={(e) => setNewOpeningVal(e.target.value)} className={`${inputClass} fv-num`} />
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">سبب التعديل (إلزامي للتدقيق) *</label>
              <input type="text" value={newOpeningReason} onChange={(e) => setNewOpeningReason(e.target.value)} className={inputClass} placeholder="مثال: جرد ومطابقة أرصدة بداية المدة" />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  try {
                    await updateAccountOpeningBalance(editingOpeningAcc, Number(newOpeningVal || 0), newOpeningReason, actor);
                    toast.success('تم تحديث الرصيد الافتتاحي وتوثيقه');
                    setEditingOpeningAcc(null);
                    await refreshAccounting();
                  } catch (err: any) {
                    toast.error(err?.message || 'تعذر تعديل الرصيد الافتتاحي');
                  }
                }}
                className="flex-1 fv-btn-primary py-3 rounded-xl font-black text-xs"
              >
                حفظ التعديل
              </button>
              <button type="button" onClick={() => setEditingOpeningAcc(null)} className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] py-3 rounded-xl font-bold text-xs text-[#718394]">تراجع</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Controlled Reversal */}
      {reversingTarget && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#DFEAF0] max-w-md w-full p-6 space-y-4">
            <h4 className="font-black text-base text-red-700">{reversingTarget.title}</h4>
            <p className="text-xs text-[#718394] font-semibold">
              الحذف الصامت ممنوع محاسبياً؛ سيتم عكس الأثر المالي بقيد عكسي وتوثيق السبب في سجل التدقيق.
            </p>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">سبب الإلغاء / العكس *</label>
              <textarea
                rows={3}
                value={reversalReasonInput}
                onChange={(e) => setReversalReasonInput(e.target.value)}
                className={inputClass}
                placeholder="اكتب السبب الواضح لعكس هذا القيد..."
              />
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={handleConfirmReversal} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black text-xs hover:bg-red-700">
                تأكيد العكس المحاسبي
              </button>
              <button type="button" onClick={() => setReversingTarget(null)} className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] py-3 rounded-xl font-bold text-xs text-[#718394]">تراجع</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Collect Patient Booking Payment (Unified) */}
      {pbCollectingRecord && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs">
          <form onSubmit={handleSubmitPbCollect} className="bg-white rounded-3xl border border-[#DFEAF0] max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-base text-[#172B3A]">تحصيل وتأكيد سداد المريض</h4>
              <button type="button" onClick={() => setPbCollectingRecord(null)} className="p-1 text-[#718394]"><X size={18} /></button>
            </div>
            <div className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-3 text-xs space-y-1">
              <div className="font-black text-[#172B3A]">{pbCollectingRecord.patientName}</div>
              <div className="text-[#718394]">د. {pbCollectingRecord.doctorName} — {pbCollectingRecord.serviceName}</div>
              <div className="flex justify-between pt-1 fv-num">
                <span>المستحق الصافي: <strong>{fmtMoney(pbCollectingRecord.finalAmountDue)}</strong></span>
                <span className="text-rose-700">المتبقي: <strong>{fmtMoney(pbCollectingRecord.remainingBalance)}</strong></span>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">المبلغ المستلم فعلياً (ج.م) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={pbCollectingRecord.remainingBalance}
                value={pbCollectAmount}
                onChange={(e) => setPbCollectAmount(e.target.value)}
                className={`${inputClass} fv-num`}
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">وسيلة الدفع *</label>
              <select value={pbCollectMethod} onChange={(e) => setPbCollectMethod(e.target.value as AccountingPaymentMethod)} className={inputClass}>
                <option value="cash">نقدي (خزينة)</option>
                <option value="instapay">إنستا باي</option>
                <option value="wallet">محفظة إلكترونية</option>
                <option value="card">بطاقة بنكية (POS)</option>
                <option value="bank_transfer">تحويل بنكي</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">الخزينة / البنك المستلم</label>
              <select value={pbCollectAccountId} onChange={(e) => setPbCollectAccountId(e.target.value)} className={inputClass}>
                <option value="">بدون ربط حسابي</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">رقم المرجع (اختياري)</label>
              <input type="text" value={pbCollectRef} onChange={(e) => setPbCollectRef(e.target.value)} className={`${inputClass} fv-mono`} placeholder="يُنشأ تلقائياً إذا تُرك فارغاً" />
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">ملاحظات (اختياري)</label>
              <input type="text" value={pbCollectNotes} onChange={(e) => setPbCollectNotes(e.target.value)} className={inputClass} />
            </div>
            {canCreateReceipt && (
              <label className="flex items-center gap-2 text-xs font-bold text-[#172B3A]">
                <input type="checkbox" checked={pbCollectVoucher} onChange={(e) => setPbCollectVoucher(e.target.checked)} className="w-4 h-4 accent-[#087F8C]" />
                <span>إصدار سند قبض بهذه الدفعة</span>
              </label>
            )}
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={busy} className="flex-1 fv-btn-primary py-3 rounded-xl font-black text-xs">تأكيد استلام الدفعة</button>
              <button type="button" onClick={() => setPbCollectingRecord(null)} className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] py-3 rounded-xl font-bold text-xs text-[#718394]">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Apply Patient Billing Discount */}
      {pbDiscountRecord && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs">
          <form onSubmit={handleSubmitPbDiscount} className="bg-white rounded-3xl border border-[#DFEAF0] max-w-md w-full p-6 space-y-4">
            <h4 className="font-black text-base text-[#172B3A]">تعديل الخصم المعتمد: {pbDiscountRecord.patientName}</h4>
            <p className="text-xs text-[#718394] font-bold fv-num">السعر الأصلي: {fmtMoney(pbDiscountRecord.originalPrice)}</p>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">قيمة الخصم (ج.م)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={pbDiscountRecord.originalPrice}
                value={pbDiscountVal}
                onChange={(e) => setPbDiscountVal(e.target.value)}
                className={`${inputClass} fv-num`}
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">سبب الخصم *</label>
              <input
                type="text"
                value={pbDiscountReason}
                onChange={(e) => setPbDiscountReason(e.target.value)}
                className={inputClass}
                placeholder="مثال: خصم موافقة إدارة / متابعة"
                required
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={busy} className="flex-1 fv-btn-primary py-3 rounded-xl font-black text-xs">حفظ الخصم</button>
              <button type="button" onClick={() => setPbDiscountRecord(null)} className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] py-3 rounded-xl font-bold text-xs text-[#718394]">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Refund Patient Payment */}
      {pbRefundRecord && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs">
          <form onSubmit={handleSubmitPbRefund} className="bg-white rounded-3xl border border-[#DFEAF0] max-w-md w-full p-6 space-y-4">
            <h4 className="font-black text-base text-purple-700">استرداد مبلغ للمريض: {pbRefundRecord.patientName}</h4>
            <p className="text-xs text-[#718394] font-bold fv-num">
              صافي المحصل القابل للاسترداد: {fmtMoney(Math.max(pbRefundRecord.paidAmount - pbRefundRecord.refundedAmount, 0))}
            </p>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">مبلغ الاسترداد (ج.م) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={Math.max(pbRefundRecord.paidAmount - pbRefundRecord.refundedAmount, 0)}
                value={pbRefundAmount}
                onChange={(e) => setPbRefundAmount(e.target.value)}
                className={`${inputClass} fv-num`}
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">وسيلة الاسترداد</label>
              <select value={pbRefundMethod} onChange={(e) => setPbRefundMethod(e.target.value as AccountingPaymentMethod)} className={inputClass}>
                <option value="cash">نقدي</option>
                <option value="instapay">إنستا باي</option>
                <option value="wallet">محفظة إلكترونية</option>
                <option value="bank_transfer">تحويل بنكي</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">الخزينة / البنك الصارف</label>
              <select value={pbRefundAccountId} onChange={(e) => setPbRefundAccountId(e.target.value)} className={inputClass}>
                <option value="">بدون ربط حسابي</option>
                {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">سبب الاسترداد *</label>
              <input
                type="text"
                value={pbRefundReason}
                onChange={(e) => setPbRefundReason(e.target.value)}
                className={inputClass}
                placeholder="مثال: إلغاء الموعد واسترداد قيمة الكشف"
                required
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={busy} className="flex-1 bg-purple-700 text-white py-3 rounded-xl font-black text-xs hover:bg-purple-800">تأكيد الاسترداد</button>
              <button type="button" onClick={() => setPbRefundRecord(null)} className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] py-3 rounded-xl font-bold text-xs text-[#718394]">تراجع</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Patient Billing Transaction History & Reversal */}
      {pbHistoryRecord && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#DFEAF0] max-w-2xl w-full p-6 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black text-base text-[#172B3A]">سجل المعاملات المالية: {pbHistoryRecord.patientName}</h4>
                <p className="text-xs text-[#718394]">د. {pbHistoryRecord.doctorName} — {pbHistoryRecord.serviceName} ({pbHistoryRecord.appointmentDate})</p>
              </div>
              <button type="button" onClick={() => setPbHistoryRecord(null)} className="p-1.5 text-[#718394]"><X size={18} /></button>
            </div>
            <div className="space-y-2">
              {(bundle?.billingTransactions || [])
                .filter((tx) => tx.bookingId === pbHistoryRecord.bookingId)
                .map((tx) => (
                  <div key={tx.id} className={`p-3 rounded-2xl border text-xs flex flex-wrap items-center justify-between gap-2 ${tx.status === 'reversed' ? 'bg-slate-50 border-slate-200 opacity-75' : 'bg-[#F5FAFC] border-[#DFEAF0]'}`}>
                    <div>
                      <div className="font-black text-[#172B3A]">
                        {tx.transactionKind === 'refund' ? 'استرداد' : tx.transactionKind === 'reversal' ? 'عكس معاملة' : 'تحصيل سداد'} —{' '}
                        <span className="fv-num">{fmtMoney(tx.amount)}</span>
                      </div>
                      <div className="text-[11px] text-[#718394] mt-0.5">
                        المرجع: <span className="fv-mono">{tx.transactionRef}</span> • الوسيلة: {PAYMENT_METHOD_LABELS[tx.paymentMethod] || tx.paymentMethod} • الموظف: {tx.confirmedByStaffName}
                      </div>
                      <div className="text-[10px] text-[#718394] fv-num">
                        {tx.createdAt.replace('T', ' ').slice(0, 16)}
                        {tx.status === 'reversed' && tx.reversalReason ? ` • سبب العكس: ${tx.reversalReason}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md font-bold ${tx.status === 'reversed' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {tx.status === 'reversed' ? 'معكوسة' : 'مؤكدة'}
                      </span>
                      {canReversePayment && tx.status === 'confirmed' && tx.transactionKind === 'payment' && (
                        <button
                          type="button"
                          onClick={() => {
                            setPbReverseTarget({
                              bookingId: tx.bookingId,
                              txId: tx.id,
                              amount: tx.amount,
                              ref: tx.transactionRef,
                            });
                            setPbReverseReason('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 font-bold hover:bg-red-100"
                        >
                          عكس
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              {(bundle?.billingTransactions || []).filter((tx) => tx.bookingId === pbHistoryRecord.bookingId).length === 0 && (
                <p className="text-xs font-bold text-[#718394] text-center py-6">لا توجد معاملات مالية مسجلة لهذا الحجز بعد.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Reversal of Payment Transaction */}
      {pbReverseTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#DFEAF0] max-w-md w-full p-6 space-y-4">
            <h4 className="font-black text-base text-red-700">عكس المعاملة المالية {pbReverseTarget.ref}</h4>
            <p className="text-xs text-[#718394] font-semibold fv-num">
              سيتم عكس مبلغ {fmtMoney(pbReverseTarget.amount)} وإعادة احتساب رصيد المريض والإيراد المحاسبي.
            </p>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">سبب العكس *</label>
              <input
                type="text"
                value={pbReverseReason}
                onChange={(e) => setPbReverseReason(e.target.value)}
                className={inputClass}
                placeholder="اكتب سبب عكس هذه الدفعة..."
              />
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy || !pbReverseReason.trim()} onClick={handleSubmitPbReverse} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black text-xs hover:bg-red-700 disabled:opacity-60">
                تأكيد العكس
              </button>
              <button type="button" onClick={() => setPbReverseTarget(null)} className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] py-3 rounded-xl font-bold text-xs text-[#718394]">تراجع</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
