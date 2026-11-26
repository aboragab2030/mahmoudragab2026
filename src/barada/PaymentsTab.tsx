import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from "@/integrations/supabase/client";
import DOMPurify from 'dompurify';
import { 
  CreditCard, Search, Phone, Hash, Filter, Banknote, 
  CheckCircle, Clock, XCircle, RefreshCw, Printer, Wallet,
  FileText, Trash2, Plus, X
} from 'lucide-react';
import { toast } from 'sonner';
import { InstapayReviewPanel } from './InstapayFeature';
import { PaymobPaymentsList } from './PaymobFeature';
import { isBookingUuid, isCancelledPaidNotice } from './paymentsLog';
import { hasPatientBillingPermission, type PermissionUser } from './permissions';
import {
  PATIENT_FINANCIAL_STATUS_BADGE,
  confirmUnifiedBookingPayment,
  loadPatientBillingRecords,
  syncBookingsToPatientBilling,
  type PatientBillingRecord,
} from './patientBillingService';
import type { AccountingAccount, AccountingPaymentMethod } from './accountingTypes';

// Types matching DB schema
interface Payment {
  id: string;
  patient_name: string;
  patient_phone: string | null;
  amount: number;
  transaction_id: string;
  payment_type: 'wallet' | 'instapay' | 'fawry' | 'other';
  payment_type_detail: string | null;
  status: 'pending' | 'paid' | 'failed';
  booking_id: string | null;
  matched_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  confirmed_by_staff_name?: string | null;
  is_partial?: boolean | null;
  refunded_amount?: number | null;
  account_id?: string | null;
}

interface PaymentNotification {
  id: string;
  payment_id: string;
  patient_name: string;
  amount: number;
  message: string;
  is_read: boolean;
  created_at: string;
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  wallet: 'محفظة هاتف',
  instapay: 'إنستا باي',
  fawry: 'فوري',
  other: 'أخرى',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'قيد الانتظار',
  paid: 'تم الدفع',
  failed: 'فشل',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200/80',
  paid: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
  failed: 'bg-red-50 text-red-700 border border-red-200/80',
};

interface PaymentsTabProps {
  cardClass: string;
  inputClass: string;
  onPrint: (title: string, content: string) => void;
  isAdmin?: boolean;
  showInstapayReview?: boolean;
  currentUser?: PermissionUser & { name?: string };
  currentUserUuid?: string;
  onSyncedPayment?: () => Promise<void> | void;
}

export const PaymentsTab: React.FC<PaymentsTabProps> = ({
  cardClass,
  inputClass,
  onPrint,
  isAdmin = false,
  showInstapayReview = true,
  currentUser,
  onSyncedPayment,
}) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<PaymentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelledBookingIds, setCancelledBookingIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Unified booking payment confirmation permissions
  const canConfirmFull =
    isAdmin || (currentUser ? hasPatientBillingPermission(currentUser, 'payment_confirm') : false);
  const canConfirmPartial =
    isAdmin ||
    (currentUser
      ? hasPatientBillingPermission(currentUser, 'payment_confirm_partial') ||
        hasPatientBillingPermission(currentUser, 'payment_confirm')
      : false);
  const canCollectBookingPayment = canConfirmFull || canConfirmPartial;

  // Collection Modal State
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectSubmitting, setCollectSubmitting] = useState(false);
  const [pendingRecords, setPendingRecords] = useState<PatientBillingRecord[]>([]);
  const [accountsList, setAccountsList] = useState<AccountingAccount[]>([]);
  const [collectSearch, setCollectSearch] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMethod, setCollectMethod] = useState<AccountingPaymentMethod>('cash');
  const [collectAccountId, setCollectAccountId] = useState('');
  const [collectRef, setCollectRef] = useState('');
  const [collectNotes, setCollectNotes] = useState('');
  const [collectIssueVoucher, setCollectIssueVoucher] = useState(false);

  // Search/Filter states
  const [searchName, setSearchName] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [searchTransactionId, setSearchTransactionId] = useState('');
  const [filterPaymentType, setFilterPaymentType] = useState('');
  const [filterStatus, setFilterStatus] = useState('paid'); // Default to showing paid only
  const [dateFrom] = useState('');
  const [dateTo] = useState('');

  // Fetch payments from Supabase
  const fetchPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      // Type assertion since the DB types might not be generated yet
      const list = (data as unknown as Payment[]) || [];
      setPayments(list);

      // Mark payments whose booking was cancelled after being paid
      const bookingIds: string[] = [...new Set(list.map(p => p.booking_id).filter(isBookingUuid))] as string[];
      if (bookingIds.length) {
        const { data: bk } = await supabase.from('bookings').select('id').in('id', bookingIds).eq('status', 'cancelled');
        setCancelledBookingIds(new Set((bk || []).map((b: any) => b.id)));
      } else {
        setCancelledBookingIds(new Set());
      }
    } catch (err) {
      console.error('Failed to fetch payments:', err);
      setError('فشل في تحميل بيانات المدفوعات');
    } finally {
      setLoading(false);
    }
  };

  // Delete a payment record (admins only — also enforced by the database)
  const deletePayment = async (p: Payment) => {
    if (!isAdmin) return;
    if (!window.confirm(`هل أنت متأكد من حذف عملية الدفع ${p.transaction_id} للمريض ${p.patient_name} نهائياً؟`)) return;
    setDeletingId(p.id);
    const { error: delError } = await supabase.rpc('delete_payment_record' as any, { _payment_id: p.id } as any);
    setDeletingId(null);
    if (delError) {
      alert('تعذر حذف العملية. هذه الصلاحية للمدير فقط.');
      return;
    }
    setPayments(prev => prev.filter(x => x.id !== p.id));
    setNotifications(prev => prev.filter(n => n.payment_id !== p.id));
  };

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('payment_notifications')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (fetchError) {
        throw fetchError;
      }

      setNotifications((data as unknown as PaymentNotification[]) || []);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  // Mark notification as read
  const markNotificationRead = async (notificationId: string) => {
    try {
      await supabase
        .from('payment_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
      
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleRefresh = () => Promise.all([fetchPayments(), fetchNotifications()]);

  const openCollectModal = async () => {
    if (!canCollectBookingPayment) {
      toast.error('ليست لديك صلاحية تأكيد أو تحصيل المدفوعات');
      return;
    }
    setCollectOpen(true);
    setCollectLoading(true);
    try {
      await syncBookingsToPatientBilling();
      const [records, accRes] = await Promise.all([
        loadPatientBillingRecords(),
        supabase.from('accounting_accounts' as any).select('*').eq('is_active', true).order('name'),
      ]);
      const unpaidOrPartial = records.filter(
        r =>
          r.bookingStatus !== 'cancelled' &&
          r.remainingBalance > 0 &&
          (r.financialStatus === 'غير مدفوع' || r.financialStatus === 'مدفوع جزئيًا'),
      );
      setPendingRecords(unpaidOrPartial);
      const mappedAccs: AccountingAccount[] = Array.isArray(accRes.data)
        ? accRes.data.map((a: any) => ({
            id: String(a.id),
            accountType: a.account_type === 'bank' ? 'bank' : 'cashbox',
            name: String(a.name || ''),
            currency: String(a.currency || 'EGP'),
            openingBalance: Number(a.opening_balance || 0),
            openingBalanceDate: String(a.opening_balance_date || ''),
            isActive: a.is_active !== false,
            createdAt: String(a.created_at || ''),
            updatedAt: String(a.updated_at || ''),
          }))
        : [];
      setAccountsList(mappedAccs);
      if (mappedAccs[0] && !collectAccountId) {
        setCollectAccountId(mappedAccs[0].id);
      }
      if (unpaidOrPartial[0]) {
        const first = unpaidOrPartial[0];
        setSelectedBookingId(first.bookingId);
        setCollectAmount(
          canConfirmFull
            ? String(first.remainingBalance)
            : String(Math.max(Math.round((first.remainingBalance / 2) * 100) / 100, 1)),
        );
      } else {
        setSelectedBookingId('');
        setCollectAmount('');
      }
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحميل الحجوزات المستحقة');
    } finally {
      setCollectLoading(false);
    }
  };

  const selectedRecord = useMemo(
    () => pendingRecords.find(r => r.bookingId === selectedBookingId) || null,
    [pendingRecords, selectedBookingId],
  );

  const filteredPendingRecords = useMemo(() => {
    const q = collectSearch.trim().toLowerCase();
    if (!q) return pendingRecords;
    return pendingRecords.filter(
      r =>
        r.patientName.toLowerCase().includes(q) ||
        r.patientPhone.includes(q) ||
        r.doctorName.toLowerCase().includes(q) ||
        r.serviceName.toLowerCase().includes(q) ||
        r.bookingId.toLowerCase().includes(q),
    );
  }, [pendingRecords, collectSearch]);

  const handleConfirmUnifiedCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) {
      toast.error('يرجى اختيار الحجز المراد تحصيل دفعته');
      return;
    }
    const amt = Math.round(Number(collectAmount) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }
    if (amt > selectedRecord.remainingBalance + 0.01) {
      toast.error(`المبلغ يتجاوز المتبقي المستحق (${selectedRecord.remainingBalance} ج.م)`);
      return;
    }
    const isPartial =
      (selectedRecord.finalAmountDue > 0 && amt < selectedRecord.remainingBalance - 0.01) ||
      selectedRecord.paidAmount > 0;
    if (!isPartial && !canConfirmFull) {
      toast.error('صلاحيتك تتيح تأكيد الدفعات الجزئية فقط؛ التحصيل الكامل يتطلب صلاحية payment_confirm');
      return;
    }
    if (isPartial && !canConfirmPartial) {
      toast.error('ليست لديك صلاحية تأكيد السداد الجزئي');
      return;
    }

    setCollectSubmitting(true);
    try {
      const tx = await confirmUnifiedBookingPayment({
        bookingId: selectedRecord.bookingId,
        amount: amt,
        paymentMethod: collectMethod,
        accountId: collectAccountId || undefined,
        confirmedVia: 'payments_section',
        transactionRef: collectRef || undefined,
        notes: collectNotes || undefined,
        issueVoucher: collectIssueVoucher,
      });
      toast.success(`تم تأكيد استلام الدفعة (${tx.transactionRef}) وترحيلها تلقائياً للحسابات`);
      setCollectOpen(false);
      setCollectRef('');
      setCollectNotes('');
      await Promise.all([handleRefresh(), Promise.resolve(onSyncedPayment?.())]);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تأكيد استلام الدفعة');
    } finally {
      setCollectSubmitting(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchNotifications();
  }, []);

  // Filter payments based on search criteria
  const filteredPayments = payments.filter(p => {
    let matches = true;
    
    if (searchName) {
      matches = matches && p.patient_name.toLowerCase().includes(searchName.toLowerCase());
    }
    
    if (searchPhone) {
      matches = matches && (p.patient_phone?.includes(searchPhone) || false);
    }
    
    if (searchTransactionId) {
      matches = matches && p.transaction_id.toLowerCase().includes(searchTransactionId.toLowerCase());
    }
    
    if (filterPaymentType) {
      matches = matches && p.payment_type === filterPaymentType;
    }
    
    if (filterStatus) {
      matches = matches && p.status === filterStatus;
    }
    
    return matches;
  });

  // Calculate totals
  const totalPaidAmount = filteredPayments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  const handlePrintPayments = () => {
    // Sanitize all user-provided data to prevent XSS attacks
    const rows = filteredPayments.map(p => `
      <tr>
        <td>${DOMPurify.sanitize(p.patient_name)}</td>
        <td>${DOMPurify.sanitize(p.patient_phone || '-')}</td>
        <td>${DOMPurify.sanitize(p.transaction_id)}</td>
        <td>${DOMPurify.sanitize(PAYMENT_TYPE_LABELS[p.payment_type])}</td>
        <td>${DOMPurify.sanitize(String(p.amount))} ج.م</td>
        <td>${DOMPurify.sanitize(STATUS_LABELS[p.status])}</td>
        <td>${DOMPurify.sanitize(new Date(p.created_at).toLocaleDateString('ar-EG'))}</td>
      </tr>
    `).join('');

    const content = `
      <table>
        <thead>
          <tr>
            <th>اسم المريض</th>
            <th>رقم الهاتف</th>
            <th>رقم العملية</th>
            <th>نوع الدفع</th>
            <th>المبلغ</th>
            <th>الحالة</th>
            <th>التاريخ</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div style="margin-top: 20px; text-align: left; font-weight: bold;">
        إجمالي المبالغ المدفوعة: ${totalPaidAmount} ج.م
      </div>
    `;

    onPrint('تقرير المدفوعات', content);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Notifications Section */}
      {notifications.length > 0 && (
        <div className={cardClass}>
          <h3 className="text-xl font-black text-[#172B3A] mb-4 flex items-center gap-2">
            <CheckCircle className="text-emerald-600" />
            إشعارات المدفوعات الجديدة <span className="fv-num text-[#087F8C]">({notifications.length})</span>
          </h3>
          <div className="space-y-3">
            {notifications.map(notif => {
              const cancelled = isCancelledPaidNotice(notif.message);
              return (
              <div 
                key={notif.id} 
                className={cancelled ? 'paid-cancellation-notice border rounded-xl p-4 flex items-center justify-between' : 'bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 flex items-center justify-between'}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-xs">
                    <Banknote size={20} />
                  </div>
                  <div>
                    {cancelled && <p className="text-sm font-bold mb-1">{notif.message}</p>}
                    <h4 className="font-bold text-[#172B3A]">{notif.patient_name}</h4>
                    <p className="text-xs text-emerald-700 font-bold fv-num">{notif.amount} ج.م - {new Date(notif.created_at).toLocaleString('ar-EG')}</p>
                  </div>
                </div>
                <button 
                  onClick={() => markNotificationRead(notif.id)}
                  className="bg-emerald-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 cursor-pointer transition-colors"
                >
                  تم الاطلاع
                </button>
              </div>
            ); })}
          </div>
        </div>
      )}

      {/* Main Payments Card */}
      <div className={cardClass}>
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
          <h3 className="text-xl font-black text-[#172B3A] flex items-center gap-2">
            <CreditCard className="text-[#087F8C]" />
            سجل المدفوعات المؤكدة <span className="fv-num text-[#087F8C]">({filteredPayments.length})</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {canCollectBookingPayment && (
              <button
                type="button"
                onClick={openCollectModal}
                className="bg-[#087F8C] text-white px-4 py-2.5 rounded-xl font-black text-xs hover:bg-[#066D78] flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Plus size={16} /> تأكيد / تحصيل سداد حجز
              </button>
            )}
            <button 
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="bg-[#F5FAFC] text-[#087F8C] border border-[#DFEAF0] p-2.5 rounded-xl hover:bg-[#087F8C]/10 disabled:opacity-60 cursor-pointer transition-colors"
              title="تحديث"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button 
              onClick={handlePrintPayments}
              className="bg-[#F5FAFC] text-[#1769AA] border border-[#DFEAF0] p-2.5 rounded-xl hover:bg-[#1769AA]/10 cursor-pointer transition-colors"
              title="طباعة التقرير"
            >
              <Printer size={18} />
            </button>
          </div>
        </div>

        {/* Search/Filter Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6 p-4 bg-[#F5FAFC] rounded-2xl border border-[#DFEAF0]">
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block flex items-center gap-1">
              <Search size={12} /> اسم المريض
            </label>
            <input
              type="text"
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
              placeholder="بحث..."
              className={inputClass}
            />
          </div>
          
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block flex items-center gap-1">
              <Phone size={12} /> رقم الهاتف
            </label>
            <input
              type="text"
              value={searchPhone}
              onChange={e => setSearchPhone(e.target.value)}
              placeholder="01..."
              className={`${inputClass} fv-num`}
            />
          </div>
          
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block flex items-center gap-1">
              <Hash size={12} /> رقم العملية
            </label>
            <input
              type="text"
              value={searchTransactionId}
              onChange={e => setSearchTransactionId(e.target.value)}
              placeholder="رقم المعاملة..."
              className={`${inputClass} fv-mono`}
            />
          </div>
          
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block flex items-center gap-1">
              <Wallet size={12} /> نوع الدفع
            </label>
            <select
              value={filterPaymentType}
              onChange={e => setFilterPaymentType(e.target.value)}
              className={inputClass}
            >
              <option value="">الكل</option>
              <option value="wallet">محفظة هاتف</option>
              <option value="instapay">إنستا باي</option>
              <option value="fawry">فوري</option>
              <option value="other">أخرى</option>
            </select>
          </div>
          
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block flex items-center gap-1">
              <Filter size={12} /> الحالة
            </label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className={inputClass}
            >
              <option value="">الكل</option>
              <option value="paid">تم الدفع</option>
              <option value="pending">قيد الانتظار</option>
              <option value="failed">فشل</option>
            </select>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200/80">
            <div className="flex items-center gap-2 text-emerald-700 mb-1">
              <CheckCircle size={18} />
              <span className="text-xs font-bold">المدفوعات المؤكدة</span>
            </div>
            <p className="text-2xl font-black text-emerald-700 fv-num">
              {payments.filter(p => p.status === 'paid').length}
            </p>
          </div>
          <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200/80">
            <div className="flex items-center gap-2 text-amber-700 mb-1">
              <Clock size={18} />
              <span className="text-xs font-bold">قيد الانتظار</span>
            </div>
            <p className="text-2xl font-black text-amber-700 fv-num">
              {payments.filter(p => p.status === 'pending').length}
            </p>
          </div>
          <div className="bg-[#F5FAFC] p-4 rounded-2xl border border-[#DFEAF0]">
            <div className="flex items-center gap-2 text-[#087F8C] mb-1">
              <Banknote size={18} />
              <span className="text-xs font-bold">إجمالي المدفوع</span>
            </div>
            <p className="text-2xl font-black text-[#172B3A] fv-num">
              {totalPaidAmount.toLocaleString('ar-EG')} <span className="text-sm font-bold text-[#718394]">ج.م</span>
            </p>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 p-4 rounded-xl mb-4 flex items-center gap-2">
            <XCircle size={20} />
            <span className="font-bold text-sm">{error}</span>
            <button onClick={fetchPayments} className="mr-auto text-xs font-bold underline cursor-pointer">إعادة المحاولة</button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-10 text-[#718394]">
            <RefreshCw size={32} className="animate-spin mx-auto mb-2 text-[#087F8C]" />
            <p className="font-bold text-sm">جاري تحميل المدفوعات...</p>
          </div>
        )}

        {/* Payments Table */}
        {!loading && !error && (
          <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
            {filteredPayments.length === 0 ? (
              <div className="text-center py-16 text-[#718394]">
                <CreditCard size={44} className="mx-auto mb-4 opacity-30 text-[#087F8C]" />
                <p className="text-lg font-bold text-[#172B3A]">لا توجد مدفوعات مطابقة للبحث</p>
                <p className="text-xs mt-1">قم بتغيير معايير البحث أو انتظر وصول مدفوعات جديدة</p>
              </div>
            ) : (
              <table className="w-full text-right">
                <thead className="bg-[#F5FAFC] text-[#718394] text-xs font-bold border-b border-[#DFEAF0]">
                  <tr>
                    <th className="p-3.5">المريض / الهاتف</th>
                    <th className="p-3.5">رقم العملية</th>
                    <th className="p-3.5">نوع الدفع</th>
                    <th className="p-3.5">المبلغ</th>
                    <th className="p-3.5">الحالة</th>
                    <th className="p-3.5">التاريخ</th>
                    {isAdmin && <th className="p-3.5"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFEAF0]/70">
                  {filteredPayments.map(payment => {
                    // Paid booking that was later cancelled: show the row text in red
                    const cancelled = !!payment.booking_id && cancelledBookingIds.has(payment.booking_id);
                    const c = (normal: string) => (cancelled ? 'text-red-600' : normal);
                    return (
                    <tr key={payment.id} className="hover:bg-[#F5FAFC] transition-colors">
                      <td className="p-3.5">
                        <div className={`font-bold ${c('text-[#172B3A]')}`}>{payment.patient_name}</div>
                        <div className={`text-xs fv-mono ${c('text-[#718394]')} mt-1`} dir="ltr">
                          {payment.patient_phone || 'غير مسجل'}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className={`fv-mono text-xs bg-[#F5FAFC] border border-[#DFEAF0] px-2.5 py-1 rounded-md ${cancelled ? 'text-red-600' : 'text-[#172B3A]'}`}>
                          {payment.transaction_id}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`text-sm font-bold ${c('text-[#087F8C]')}`}>
                          {PAYMENT_TYPE_LABELS[payment.payment_type]}
                        </span>
                        {payment.payment_type_detail && (
                          <div className={`text-xs ${c('text-[#718394]')} mt-1`}>{payment.payment_type_detail}</div>
                        )}
                      </td>
                      <td className="p-3.5 fv-num">
                        <span className={`font-black text-base ${c('text-[#172B3A]')}`}>{payment.amount}</span>
                        <span className={`text-xs ${c('text-[#718394]')} mr-1`}>ج.م</span>
                        {Number(payment.refunded_amount || 0) > 0 && (
                          <div className="text-[10px] font-black text-purple-700 mt-0.5">
                            مسترد: {payment.refunded_amount} ج.م
                          </div>
                        )}
                      </td>
                      <td className="p-3.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-black ${STATUS_COLORS[payment.status]}`}>
                            {STATUS_LABELS[payment.status]}
                          </span>
                          {payment.is_partial && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                              جزئي
                            </span>
                          )}
                        </div>
                        {payment.confirmed_by_staff_name && (
                          <div className="text-[10px] text-[#718394] font-semibold mt-1">
                            أكدها: {payment.confirmed_by_staff_name}
                          </div>
                        )}
                      </td>
                      <td className={`p-3.5 text-xs fv-num ${c('text-[#172B3A]')}`}>
                        {new Date(payment.created_at).toLocaleDateString('ar-EG')}
                        <div className={`text-[11px] ${c('text-[#718394]')}`}>
                          {new Date(payment.created_at).toLocaleTimeString('ar-EG')}
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="p-3.5">
                          <button
                            onClick={() => deletePayment(payment)}
                            disabled={deletingId === payment.id}
                            className="p-2 bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0] rounded-lg hover:bg-red-600 hover:text-white hover:border-red-600 transition-all disabled:opacity-60 cursor-pointer"
                            title="حذف العملية نهائياً"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Integration Info */}
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-[#087F8C]/10 border border-[#087F8C]/20 p-2.5 rounded-xl text-[#087F8C]">
            <FileText size={22} />
          </div>
          <h3 className="text-xl font-black text-[#172B3A]">معلومات التكامل</h3>
        </div>
        <div className="bg-[#F5FAFC] p-6 rounded-2xl border border-[#DFEAF0]">
          <p className="text-sm text-[#172B3A] mb-4 font-bold">
            لاستقبال إشعارات الدفع تلقائياً، قم بإرسال طلب POST إلى الـ Webhook التالي:
          </p>
          <div className="bg-[#0B1F35] text-white p-4 rounded-xl border border-[#102C48] fv-mono text-xs overflow-x-auto" dir="ltr">
            <code className="text-[#25B8C7]">
              POST {typeof window !== 'undefined' ? window.location.origin : ''}/api/public/payment-webhook
            </code>
          </div>
          <div className="mt-4 text-xs text-[#718394]">
            <p className="font-bold text-[#172B3A] mb-2">الحقول المطلوبة في الطلب (JSON):</p>
            <ul className="space-y-1.5 list-disc list-inside">
              <li><code className="fv-mono text-[#087F8C] font-bold">patient_name</code> - اسم المريض (نص)</li>
              <li><code className="fv-mono text-[#087F8C] font-bold">amount</code> - المبلغ (رقم)</li>
              <li><code className="fv-mono text-[#087F8C] font-bold">transaction_id</code> - رقم العملية (نص فريد)</li>
              <li><code className="fv-mono text-[#087F8C] font-bold">payment_type</code> - نوع الدفع (wallet/instapay/fawry/other)</li>
              <li><code className="fv-mono text-[#087F8C] font-bold">patient_phone</code> - رقم الهاتف (اختياري)</li>
            </ul>
          </div>
        </div>
      </div>

       {showInstapayReview && <InstapayReviewPanel cardClass={cardClass} inputClass={inputClass} onPrint={onPrint} isAdmin={isAdmin} />}
      <PaymobPaymentsList cardClass={cardClass} />

      {/* Unified Booking Payment Confirmation Modal */}
      {collectOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="bg-white rounded-3xl border border-[#DFEAF0] shadow-2xl max-w-2xl w-full p-6 md:p-7 max-h-[92vh] overflow-y-auto relative" dir="rtl">
            <button
              type="button"
              onClick={() => setCollectOpen(false)}
              aria-label="إغلاق"
              className="absolute top-4 left-4 p-2 rounded-full hover:bg-[#F5FAFC] text-[#718394] hover:text-[#172B3A]"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-black text-[#172B3A] mb-1">تأكيد وتحصيل سداد حجز</h3>
            <p className="text-xs text-[#718394] font-semibold mb-4">
              يتم توثيق الدفعة برقم معاملة موحد وتحديث رصيد المريض والحسابات تلقائياً دون أي تكرار.
            </p>

            {collectLoading ? (
              <div className="py-10 text-center text-[#718394]">
                <RefreshCw size={28} className="animate-spin mx-auto mb-2 text-[#087F8C]" />
                <p className="text-xs font-bold">جاري تحميل الحجوزات المستحقة...</p>
              </div>
            ) : pendingRecords.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0] text-center text-xs font-bold text-[#718394]">
                لا توجد حجوزات غير مدفوعة أو مدفوعة جزئياً حالياً.
              </div>
            ) : (
              <form onSubmit={handleConfirmUnifiedCollection} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">ابحث عن الحجز أو المريض</label>
                  <input
                    type="text"
                    value={collectSearch}
                    onChange={e => setCollectSearch(e.target.value)}
                    placeholder="الاسم، الهاتف، الطبيب، أو رقم الحجز..."
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">اختر الحجز المستحق *</label>
                  <select
                    value={selectedBookingId}
                    onChange={e => {
                      const nextId = e.target.value;
                      setSelectedBookingId(nextId);
                      const rec = pendingRecords.find(r => r.bookingId === nextId);
                      if (rec) {
                        setCollectAmount(
                          canConfirmFull
                            ? String(rec.remainingBalance)
                            : String(Math.max(Math.round((rec.remainingBalance / 2) * 100) / 100, 1)),
                        );
                      }
                    }}
                    className={inputClass}
                    required
                  >
                    {filteredPendingRecords.map(r => (
                      <option key={r.bookingId} value={r.bookingId}>
                        {r.patientName} ({r.patientPhone}) — {r.serviceName} / د. {r.doctorName} — {r.appointmentDate} — المتبقي: {r.remainingBalance} ج.م
                      </option>
                    ))}
                  </select>
                </div>

                {selectedRecord && (
                  <div className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-2xl p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-[#718394] block">الإجمالي بعد الخصم</span>
                      <span className="font-black text-[#172B3A] fv-num">{selectedRecord.finalAmountDue} ج.م</span>
                    </div>
                    <div>
                      <span className="text-[#718394] block">المدفوع مسبقاً</span>
                      <span className="font-black text-emerald-700 fv-num">{selectedRecord.paidAmount} ج.م</span>
                    </div>
                    <div>
                      <span className="text-[#718394] block">المتبقي للسداد</span>
                      <span className="font-black text-rose-700 fv-num">{selectedRecord.remainingBalance} ج.م</span>
                    </div>
                    <div>
                      <span className="text-[#718394] block">الحالة الحالية</span>
                      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-md border text-[10px] font-black ${PATIENT_FINANCIAL_STATUS_BADGE[selectedRecord.financialStatus]}`}>
                        {selectedRecord.financialStatus}
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-[#718394] mb-1 block">المبلغ المستلم فعلياً (ج.م) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={selectedRecord?.remainingBalance}
                      value={collectAmount}
                      onChange={e => setCollectAmount(e.target.value)}
                      className={`${inputClass} fv-num`}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#718394] mb-1 block">وسيلة الدفع *</label>
                    <select
                      value={collectMethod}
                      onChange={e => setCollectMethod(e.target.value as AccountingPaymentMethod)}
                      className={inputClass}
                    >
                      <option value="cash">نقدي (خزينة)</option>
                      <option value="instapay">إنستا باي</option>
                      <option value="wallet">محفظة إلكترونية</option>
                      <option value="card">بطاقة بنكية (POS)</option>
                      <option value="bank_transfer">تحويل بنكي</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#718394] mb-1 block">الخزينة / الحساب البنكي المستلم</label>
                    <select
                      value={collectAccountId}
                      onChange={e => setCollectAccountId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">بدون ربط حسابي مباشر</option>
                      {accountsList.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.accountType === 'bank' ? 'بنك' : 'خزينة'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#718394] mb-1 block">مرجع العملية (اختياري)</label>
                    <input
                      type="text"
                      value={collectRef}
                      onChange={e => setCollectRef(e.target.value)}
                      placeholder="يُنشأ تلقائياً إذا تُرك فارغاً"
                      className={`${inputClass} fv-mono`}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">ملاحظات التحصيل (اختياري)</label>
                  <input
                    type="text"
                    value={collectNotes}
                    onChange={e => setCollectNotes(e.target.value)}
                    placeholder="تفاصيل إضافية..."
                    className={inputClass}
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-[#172B3A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={collectIssueVoucher}
                    onChange={e => setCollectIssueVoucher(e.target.checked)}
                    className="w-4 h-4 accent-[#087F8C]"
                  />
                  <span>إصدار سند قبض مالي تلقائياً لهذه الدفعة</span>
                </label>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={collectSubmitting}
                    className="flex-1 bg-[#087F8C] text-white py-3 rounded-xl font-black text-xs hover:bg-[#066D78] disabled:opacity-60"
                  >
                    {collectSubmitting ? 'جاري تأكيد السداد...' : 'تأكيد استلام الدفعة'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectOpen(false)}
                    className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] py-3 rounded-xl font-bold text-xs text-[#718394]"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentsTab;
