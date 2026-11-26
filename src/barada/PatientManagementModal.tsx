import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CreditCard,
  Edit2,
  FileText,
  Phone,
  Search,
  User,
  UserCheck,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { EGYPT_CENTERS } from './egyptData';
import {
  isValidEgyptianPhone,
  normalizePhone,
} from './bookingValidation';
import { PAYMENT_METHOD_LABELS } from './accountingTypes';
import {
  computePatientProfileSummary,
  loadPatientBillingRecords,
  loadPatientBillingTransactions,
  PATIENT_FINANCIAL_STATUS_BADGE,
  type PatientBillingRecord,
  type PatientBillingTransaction,
} from './patientBillingService';
import {
  listPatients,
  savePatientRecord,
  searchPatientsInMemory,
  type PatientRecord,
  type SavePatientInput,
  type StaffActor,
} from './patientsService';
import {
  hasPatientBillingPermission,
  hasPatientPermission,
  hasStaffBookingPermission,
  type PermissionUser,
} from './permissions';

export interface PatientModalBookingItem {
  id: number;
  databaseId?: string;
  patientId?: string;
  patientName: string;
  phone: string;
  phone2?: string;
  doctorName: string;
  service: string;
  date: string;
  time: string;
  status: string;
  bookingType?: 'cash' | 'contract';
  bookingSource?: 'website' | 'staff' | 'admin';
  paymentStatus?: string;
  paymentMethod?: string;
  createdAt?: string;
}

export interface PatientModalOperationItem {
  id: number;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  surgeryType: string;
  date: string;
  cost: number;
  status: string;
}

interface PatientManagementModalProps {
  isOpen: boolean;
  initialMode?: 'list' | 'profile';
  initialPatient?: PatientRecord | null;
  onClose: () => void;
  currentUser: PermissionUser;
  actor: StaffActor;
  bookings: PatientModalBookingItem[];
  operations: PatientModalOperationItem[];
  inputClass: string;
  onPatientSaved?: (patient: PatientRecord) => void;
  onCreateBookingForPatient?: (patient: PatientRecord) => void;
}

const EMPTY_FORM: SavePatientInput = {
  fullName: '',
  phone: '',
  phone2: '',
  nationalId: '',
  email: '',
  age: undefined,
  governorate: '',
  center: '',
  address: '',
  notes: '',
};

export const PatientManagementModal: React.FC<PatientManagementModalProps> = ({
  isOpen,
  initialMode = 'list',
  initialPatient = null,
  onClose,
  currentUser,
  actor,
  bookings,
  operations,
  inputClass,
  onPatientSaved,
  onCreateBookingForPatient,
}) => {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'list' | 'edit' | 'profile'>(initialMode === 'profile' ? 'profile' : 'list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(initialPatient);
  const [form, setForm] = useState<SavePatientInput>(EMPTY_FORM);
  const [billingRecords, setBillingRecords] = useState<PatientBillingRecord[]>([]);
  const [billingTxns, setBillingTxns] = useState<PatientBillingTransaction[]>([]);
  const [loadingFinancials, setLoadingFinancials] = useState(false);

  const canView = hasPatientPermission(currentUser, 'patients_view');
  const canSearch = hasPatientPermission(currentUser, 'patients_search') || canView;
  const canEdit = hasPatientPermission(currentUser, 'patients_edit');
  const canViewHistory = hasPatientPermission(currentUser, 'patients_view_history') || canView;
  const canCreateStaffBooking = hasStaffBookingPermission(currentUser, 'staff_bookings_create');
  const canViewPatientBalances =
    hasPatientBillingPermission(currentUser, 'accounting_view_patient_balances') ||
    hasPatientBillingPermission(currentUser, 'patient_accounts_view') ||
    hasPatientBillingPermission(currentUser, 'patient_accounts_view_all');
  const canViewPaymentHistory =
    hasPatientBillingPermission(currentUser, 'payment_view_history') ||
    canViewPatientBalances;
  const canViewAllAccounts = hasPatientBillingPermission(currentUser, 'patient_accounts_view_all');

  const loadAllPatients = async () => {
    setLoading(true);
    try {
      const list = await listPatients();
      setPatients(list);
    } catch (err) {
      console.error('Error loading patients:', err);
      toast.error('تعذر تحميل سجل المرضى');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (initialPatient) {
      setSelectedPatient(initialPatient);
      setMode('profile');
    } else {
      setSelectedPatient(null);
      setMode('list');
    }
    setForm(EMPTY_FORM);
    setSearchQuery('');
    void loadAllPatients();
  }, [isOpen, initialMode, initialPatient]);

  useEffect(() => {
    if (!isOpen || !selectedPatient || (!canViewPatientBalances && !canViewPaymentHistory)) {
      setBillingRecords([]);
      setBillingTxns([]);
      return;
    }
    let cancelled = false;
    setLoadingFinancials(true);
    Promise.all([
      loadPatientBillingRecords({
        onlyOwnForStaffId:
          !canViewAllAccounts && !canViewPatientBalances && actor.userId ? actor.userId : undefined,
      }),
      loadPatientBillingTransactions(),
    ])
      .then(([recs, txns]) => {
        if (cancelled) return;
        setBillingRecords(recs);
        setBillingTxns(txns);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingFinancials(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedPatient, canViewPatientBalances, canViewPaymentHistory, canViewAllAccounts, actor.userId]);

  const filteredPatients = useMemo(() => {
    if (!canSearch) return [];
    return searchPatientsInMemory(patients, searchQuery);
  }, [patients, searchQuery, canSearch]);

  const patientBookings = useMemo(() => {
    if (!selectedPatient || !canViewHistory) return [];
    const normP = normalizePhone(selectedPatient.phone);
    return bookings.filter(
      (b) =>
        (selectedPatient.id && b.patientId === selectedPatient.id) ||
        normalizePhone(b.phone) === normP ||
        (b.phone2 && normalizePhone(b.phone2) === normP),
    );
  }, [selectedPatient, bookings, canViewHistory]);

  const patientOperations = useMemo(() => {
    if (!selectedPatient || !canViewHistory) return [];
    const normP = normalizePhone(selectedPatient.phone);
    return operations.filter((op) => normalizePhone(op.patientPhone) === normP);
  }, [selectedPatient, operations, canViewHistory]);

  const patientAccountingSummary = useMemo(() => {
    if (!selectedPatient || (!canViewPatientBalances && !canViewPaymentHistory)) return null;
    return computePatientProfileSummary(
      billingRecords,
      billingTxns,
      selectedPatient.id,
      selectedPatient.phone,
    );
  }, [selectedPatient, billingRecords, billingTxns, canViewPatientBalances, canViewPaymentHistory]);

  if (!isOpen) return null;

  const openEditForm = (p: PatientRecord) => {
    if (!canEdit) {
      toast.error('ليست لديك صلاحية تعديل بيانات المرضى');
      return;
    }
    setSelectedPatient(p);
    setForm({
      id: p.id,
      fullName: p.fullName,
      phone: p.phone,
      phone2: p.phone2 || '',
      nationalId: p.nationalId || '',
      email: p.email || '',
      age: p.age,
      governorate: p.governorate || '',
      center: p.center || '',
      address: p.address || '',
      notes: p.notes || '',
    });
    setMode('edit');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast.error('ليست لديك صلاحية تعديل بيانات المرضى');
      return;
    }

    const trimmedName = form.fullName.trim();
    const parts = trimmedName.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      toast.error('يرجى إدخال اسم المريض كاملاً');
      return;
    }
    if (!isValidEgyptianPhone(form.phone)) {
      toast.error('يجب أن يكون رقم الهاتف 11 رقماً ويبدأ بـ 01');
      return;
    }
    if (form.phone2 && form.phone2.trim() !== '' && !isValidEgyptianPhone(form.phone2)) {
      toast.error('رقم الهاتف الثاني يجب أن يكون 11 رقماً ويبدأ بـ 01');
      return;
    }

    setSaving(true);
    try {
      const saved = await savePatientRecord(form, actor);
      toast.success(mode === 'edit' ? 'تم تحديث بيانات المريض بنجاح' : 'تم تسجيل المريض بنجاح');
      setPatients((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      setSelectedPatient(saved);
      setMode('profile');
      onPatientSaved?.(saved);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حفظ بيانات المريض');
    } finally {
      setSaving(false);
    }
  };

  const govCenters = form.governorate && EGYPT_CENTERS[form.governorate] ? EGYPT_CENTERS[form.governorate] : [];

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-[#DFEAF0] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-l from-[#0B1F35] via-[#102C48] to-[#087F8C] px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl">
              <UserPlus size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black">إدارة وسجل المرضى</h3>
              <p className="text-xs text-white/80">بحث، تحديث، وعرض ملف المريض وسجل الحجوزات والحسابات المالية</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Strip */}
        <div className="px-6 py-3 bg-[#F5FAFC] border-b border-[#DFEAF0] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap gap-2">
            {canView && (
              <button
                type="button"
                onClick={() => setMode('list')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  mode === 'list' ? 'bg-[#087F8C] text-white shadow-xs' : 'bg-white text-[#718394] border border-[#DFEAF0]'
                }`}
              >
                سجل المرضى ({patients.length})
              </button>
            )}
            {selectedPatient && (
              <button
                type="button"
                onClick={() => setMode('profile')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  mode === 'profile' ? 'bg-[#1769AA] text-white shadow-xs' : 'bg-white text-[#172B3A] border border-[#DFEAF0]'
                }`}
              >
                ملف: {selectedPatient.fullName}
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {mode === 'list' && (
            <>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute right-3.5 top-3.5 text-[#718394]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث بالاسم، رقم الهاتف، رقم الملف، أو الرقم القومي..."
                    className={`${inputClass} pr-10`}
                    disabled={!canSearch}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void loadAllPatients()}
                  className="px-4 py-2.5 bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl text-xs font-bold text-[#172B3A] hover:bg-white transition-colors"
                >
                  تحديث القائمة
                </button>
              </div>

              {loading ? (
                <div className="py-12 text-center text-[#718394] text-sm font-bold">جاري تحميل ملفات المرضى...</div>
              ) : filteredPatients.length === 0 ? (
                <div className="py-12 text-center bg-[#F5FAFC] rounded-2xl border border-dashed border-[#DFEAF0]">
                  <User size={32} className="mx-auto text-[#718394] opacity-50 mb-2" />
                  <p className="text-sm font-bold text-[#172B3A]">لا توجد ملفات مرضى مطابقة</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#DFEAF0] rounded-2xl">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-[#F5FAFC] text-[#718394] border-b border-[#DFEAF0] text-xs">
                      <tr>
                        <th className="p-3.5 font-bold">رقم الملف</th>
                        <th className="p-3.5 font-bold">الاسم</th>
                        <th className="p-3.5 font-bold">الهاتف</th>
                        <th className="p-3.5 font-bold">السن / العنوان</th>
                        <th className="p-3.5 font-bold text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DFEAF0]">
                      {filteredPatients.map((p) => (
                        <tr key={p.id} className="hover:bg-[#F5FAFC] transition-colors">
                          <td className="p-3.5 text-xs font-bold text-[#087F8C] fv-mono">{p.fileNumber || '—'}</td>
                          <td className="p-3.5 font-bold text-[#172B3A]">{p.fullName}</td>
                          <td className="p-3.5 text-xs fv-num text-[#172B3A]" dir="ltr">
                            {p.phone}
                            {p.phone2 ? ` / ${p.phone2}` : ''}
                          </td>
                          <td className="p-3.5 text-xs text-[#718394]">
                            {p.age ? `${p.age} سنة` : '—'} • {p.address || [p.governorate, p.center].filter(Boolean).join(' - ') || '—'}
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPatient(p);
                                  setMode('profile');
                                }}
                                className="px-2.5 py-1.5 bg-[#087F8C]/10 text-[#087F8C] rounded-lg text-xs font-bold hover:bg-[#087F8C]/20"
                              >
                                الملف
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => openEditForm(p)}
                                  className="p-1.5 bg-[#F5FAFC] text-[#1769AA] border border-[#DFEAF0] rounded-lg hover:bg-white"
                                  title="تعديل"
                                >
                                  <Edit2 size={14} />
                                </button>
                              )}
                              {canCreateStaffBooking && onCreateBookingForPatient && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onCreateBookingForPatient(p);
                                  }}
                                  className="px-2.5 py-1.5 bg-[#1769AA] text-white rounded-lg text-xs font-bold hover:bg-[#1769AA]/90"
                                >
                                  حجز
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {mode === 'edit' && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-[#718394] mb-1 block">اسم المريض كاملاً *</label>
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className={inputClass}
                    placeholder="مثال: أحمد محمد محمود علي"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">رقم الهاتف الأساسي *</label>
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={`${inputClass} fv-num`}
                    placeholder="01012345678"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">رقم هاتف إضافي (اختياري)</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={form.phone2 || ''}
                    onChange={(e) => setForm({ ...form, phone2: e.target.value })}
                    className={`${inputClass} fv-num`}
                    placeholder="01112345678"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">السن (سنة)</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={form.age ?? ''}
                    onChange={(e) => setForm({ ...form, age: e.target.value ? Number(e.target.value) : undefined })}
                    className={`${inputClass} fv-num`}
                    placeholder="35"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الرقم القومي / معرف الملف (اختياري)</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={form.nationalId || ''}
                    onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
                    className={`${inputClass} fv-num`}
                    placeholder="14 رقم اختياري"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">المحافظة</label>
                  <select
                    value={form.governorate || ''}
                    onChange={(e) => setForm({ ...form, governorate: e.target.value, center: '' })}
                    className={inputClass}
                  >
                    <option value="">اختر المحافظة</option>
                    {Object.keys(EGYPT_CENTERS).map((gov) => (
                      <option key={gov} value={gov}>{gov}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">المركز / المدينة</label>
                  {govCenters.length > 0 ? (
                    <select
                      value={form.center || ''}
                      onChange={(e) => setForm({ ...form, center: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">اختر المركز / المدينة</option>
                      {govCenters.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={form.center || ''}
                      onChange={(e) => setForm({ ...form, center: e.target.value })}
                      className={inputClass}
                      placeholder="أدخل المركز أو المدينة"
                    />
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">البريد الإلكتروني (اختياري)</label>
                  <input
                    type="email"
                    dir="ltr"
                    value={form.email || ''}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={inputClass}
                    placeholder="patient@example.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">العنوان التفصيلي</label>
                  <input
                    type="text"
                    value={form.address || ''}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className={inputClass}
                    placeholder="يُستكمل تلقائياً من المحافظة والمركز إذا تُرك فارغاً"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-[#718394] mb-1 block">ملاحظات طبية / إدارية</label>
                  <textarea
                    rows={2}
                    value={form.notes || ''}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className={inputClass}
                    placeholder="ملاحظات اختيارية على ملف المريض..."
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="fv-btn-primary px-6 py-3 rounded-xl font-black text-sm flex items-center gap-2 disabled:opacity-60"
                >
                  <UserCheck size={16} />
                  {saving ? 'جاري الحفظ...' : mode === 'edit' ? 'حفظ التعديلات' : 'حفظ ملف المريض'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode(selectedPatient ? 'profile' : 'list')}
                  className="px-6 py-3 bg-[#F5FAFC] border border-[#DFEAF0] text-[#718394] rounded-xl font-bold text-sm hover:bg-white"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}

          {mode === 'profile' && selectedPatient && (
            <div className="space-y-5">
              <div className="bg-[#F5FAFC] p-5 rounded-2xl border border-[#DFEAF0] flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 bg-[#087F8C]/10 text-[#087F8C] rounded-lg text-xs font-bold fv-mono">
                      {selectedPatient.fileNumber || 'ملف مريض'}
                    </span>
                    <h4 className="text-lg font-black text-[#172B3A]">{selectedPatient.fullName}</h4>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs font-bold text-[#718394] mt-2">
                    <span className="flex items-center gap-1 fv-num" dir="ltr">
                      <Phone size={13} className="text-[#087F8C]" /> {selectedPatient.phone}
                    </span>
                    {selectedPatient.age && <span>السن: {selectedPatient.age} سنة</span>}
                    {selectedPatient.address && <span>العنوان: {selectedPatient.address}</span>}
                    {selectedPatient.createdByStaffName && (
                      <span>سُجل بواسطة: {selectedPatient.createdByStaffName}</span>
                    )}
                  </div>
                  {selectedPatient.notes && (
                    <p className="text-xs text-[#172B3A] bg-white p-2.5 rounded-xl border border-[#DFEAF0] mt-3">
                      <FileText size={13} className="inline ml-1 text-[#087F8C]" /> {selectedPatient.notes}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEditForm(selectedPatient)}
                      className="px-4 py-2.5 bg-white border border-[#DFEAF0] text-[#172B3A] rounded-xl text-xs font-bold flex items-center gap-1.5 hover:border-[#087F8C]"
                    >
                      <Edit2 size={14} /> تعديل البيانات
                    </button>
                  )}
                  {canCreateStaffBooking && onCreateBookingForPatient && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onCreateBookingForPatient(selectedPatient);
                      }}
                      className="fv-btn-primary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5"
                    >
                      <CalendarDays size={14} /> إضافة حجز للمريض
                    </button>
                  )}
                </div>
              </div>

              {canViewHistory && (
                <div className="space-y-4">
                  <div>
                    <h5 className="text-sm font-black text-[#172B3A] mb-2 flex items-center gap-2">
                      <CalendarDays size={16} className="text-[#087F8C]" /> سجل الحجوزات ({patientBookings.length})
                    </h5>
                    {patientBookings.length === 0 ? (
                      <p className="text-xs text-[#718394] bg-[#F5FAFC] p-4 rounded-xl border border-[#DFEAF0]">
                        لا توجد حجوزات مسجلة لهذا المريض حتى الآن.
                      </p>
                    ) : (
                      <div className="overflow-x-auto border border-[#DFEAF0] rounded-2xl">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-[#F5FAFC] text-[#718394] border-b border-[#DFEAF0]">
                            <tr>
                              <th className="p-3 font-bold">التاريخ والوقت</th>
                              <th className="p-3 font-bold">الطبيب / الإجراء</th>
                              <th className="p-3 font-bold">المصدر</th>
                              <th className="p-3 font-bold">الحالة</th>
                              {canViewPatientBalances && <th className="p-3 font-bold">الدفع</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#DFEAF0]">
                            {patientBookings.map((b) => (
                              <tr key={b.id}>
                                <td className="p-3 fv-num font-bold text-[#172B3A]">{b.date} • {b.time}</td>
                                <td className="p-3">
                                  <div className="font-bold text-[#087F8C]">{b.doctorName}</div>
                                  <div className="text-[#718394]">{b.service}</div>
                                </td>
                                <td className="p-3 font-bold">
                                  {b.bookingSource === 'staff' ? 'موظف' : b.bookingSource === 'admin' ? 'إدارة' : 'الموقع'}
                                </td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded-full font-bold ${b.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                    {b.status === 'confirmed' ? 'مؤكد' : 'ملغي'}
                                  </span>
                                </td>
                                {canViewPatientBalances && (
                                  <td className="p-3 font-bold">
                                    <span className="inline-flex items-center gap-1">
                                      <CreditCard size={12} className="text-[#1769AA]" />
                                      {b.paymentStatus === 'paid' ? 'مدفوع' : 'قيد الانتظار'}
                                    </span>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {patientOperations.length > 0 && (
                    <div>
                      <h5 className="text-sm font-black text-[#172B3A] mb-2">سجل العمليات ({patientOperations.length})</h5>
                      <div className="space-y-2">
                        {patientOperations.map((op) => (
                          <div key={op.id} className="p-3 bg-[#F5FAFC] rounded-xl border border-[#DFEAF0] flex items-center justify-between text-xs">
                            <div>
                              <span className="font-bold text-[#172B3A]">{op.surgeryType}</span>
                              <span className="text-[#718394] mr-2">• {op.doctorName} • {op.date}</span>
                            </div>
                            {canViewPatientBalances && (
                              <span className="font-black text-[#087F8C] fv-num">{op.cost.toLocaleString()} ج.م</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(canViewPatientBalances || canViewPaymentHistory) && patientAccountingSummary && (
                <div className="space-y-4 pt-4 border-t border-[#DFEAF0]">
                  <h5 className="text-sm font-black text-[#172B3A] flex items-center gap-2">
                    <Wallet size={16} className="text-[#087F8C]" />
                    الملخص المحاسبي وحسابات المريض
                  </h5>

                  {loadingFinancials ? (
                    <p className="text-xs text-[#718394] font-bold">جاري تحميل الملخص المالي...</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0]">
                          <span className="text-[11px] font-bold text-[#718394] block">إجمالي المستحقات</span>
                          <span className="text-sm font-black text-[#172B3A] fv-num">{patientAccountingSummary.totalDue.toLocaleString('en-US')} ج.م</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200">
                          <span className="text-[11px] font-bold text-emerald-700 block">إجمالي المدفوعات</span>
                          <span className="text-sm font-black text-emerald-700 fv-num">{patientAccountingSummary.totalPaid.toLocaleString('en-US')} ج.م</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-rose-50/70 border border-rose-200">
                          <span className="text-[11px] font-bold text-rose-700 block">إجمالي المتبقي</span>
                          <span className="text-sm font-black text-rose-700 fv-num">{patientAccountingSummary.totalRemaining.toLocaleString('en-US')} ج.م</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0]">
                          <span className="text-[11px] font-bold text-[#718394] block">عدد الحجوزات المالية</span>
                          <span className="text-sm font-black text-[#087F8C] fv-num">{patientAccountingSummary.totalFinancialBookingsCount}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-emerald-50/40 border border-emerald-200/70">
                          <span className="text-[11px] font-bold text-emerald-700 block">عدد الحجوزات المدفوعة بالكامل</span>
                          <span className="text-sm font-black text-emerald-700 fv-num">{patientAccountingSummary.fullyPaidCount}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-amber-50/50 border border-amber-200">
                          <span className="text-[11px] font-bold text-amber-800 block">عدد الحجوزات المدفوعة جزئيًا</span>
                          <span className="text-sm font-black text-amber-800 fv-num">{patientAccountingSummary.partiallyPaidCount}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-rose-50/40 border border-rose-200/70">
                          <span className="text-[11px] font-bold text-rose-700 block">عدد الحجوزات غير المدفوعة</span>
                          <span className="text-sm font-black text-rose-700 fv-num">{patientAccountingSummary.unpaidCount}</span>
                        </div>
                      </div>

                      {canViewPaymentHistory && (
                        <div>
                          <h6 className="text-xs font-black text-[#172B3A] mb-2">سجل المعاملات والمدفوعات التفصيلي</h6>
                          {patientAccountingSummary.historyRows.length === 0 ? (
                            <p className="text-xs text-[#718394] bg-[#F5FAFC] p-3.5 rounded-xl border border-[#DFEAF0]">
                              لا توجد قيود مالية مسجلة لهذا المريض حتى الآن.
                            </p>
                          ) : (
                            <div className="overflow-x-auto border border-[#DFEAF0] rounded-2xl">
                              <table className="w-full text-right text-[11px]">
                                <thead className="bg-[#F5FAFC] text-[#718394] border-b border-[#DFEAF0]">
                                  <tr>
                                    <th className="p-2.5 font-bold">تاريخ الحجز</th>
                                    <th className="p-2.5 font-bold">الخدمة / الطبيب</th>
                                    <th className="p-2.5 font-bold">الأصلي</th>
                                    <th className="p-2.5 font-bold">الخصم</th>
                                    <th className="p-2.5 font-bold">الصافي المستحق</th>
                                    <th className="p-2.5 font-bold">المدفوع</th>
                                    <th className="p-2.5 font-bold">المتبقي</th>
                                    <th className="p-2.5 font-bold">تاريخ الدفع</th>
                                    <th className="p-2.5 font-bold">الوسيلة / المرجع</th>
                                    <th className="p-2.5 font-bold">الموظف المؤكد</th>
                                    <th className="p-2.5 font-bold">الحالة</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#DFEAF0]">
                                  {patientAccountingSummary.historyRows.map((row) => (
                                    <tr key={row.rowKey}>
                                      <td className="p-2.5 fv-num font-bold">{row.bookingDate}</td>
                                      <td className="p-2.5">
                                        <div className="font-bold text-[#172B3A]">{row.serviceName}</div>
                                        <div className="text-[#718394]">{row.doctorName}</div>
                                      </td>
                                      <td className="p-2.5 fv-num">{row.originalPrice.toLocaleString('en-US')}</td>
                                      <td className="p-2.5 fv-num">{row.discountAmount.toLocaleString('en-US')}</td>
                                      <td className="p-2.5 fv-num font-bold">{row.finalAmountDue.toLocaleString('en-US')}</td>
                                      <td className="p-2.5 fv-num font-black text-emerald-700">{row.paidAmount.toLocaleString('en-US')}</td>
                                      <td className="p-2.5 fv-num font-black text-rose-700">{row.remainingBalance.toLocaleString('en-US')}</td>
                                      <td className="p-2.5 fv-num">{row.paymentDate ? row.paymentDate.slice(0, 10) : '—'}</td>
                                      <td className="p-2.5">
                                        {row.paymentMethod ? (
                                          <>
                                            <div className="font-bold">
                                              {PAYMENT_METHOD_LABELS[row.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || row.paymentMethod}
                                            </div>
                                            {row.transactionRef && <div className="fv-mono text-[10px] text-[#718394]">{row.transactionRef}</div>}
                                          </>
                                        ) : '—'}
                                      </td>
                                      <td className="p-2.5">{row.confirmedByStaffName || '—'}</td>
                                      <td className="p-2.5">
                                        <span className={`inline-block px-2 py-0.5 rounded-full border font-bold ${PATIENT_FINANCIAL_STATUS_BADGE[row.financialStatus]}`}>
                                          {row.financialStatus}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
