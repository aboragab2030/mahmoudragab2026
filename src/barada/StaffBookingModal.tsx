import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  Clock,
  Search,
  ShieldAlert,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cairoTodayStr, arabicWeekday, upcomingDates } from './dateUtils';
import { EGYPT_CENTERS } from './egyptData';
import {
  computeBookingExpectedFee,
  generateClinicTimeSlots,
  normalizePhone,
  validateBookingRules,
  type BookingSourceType,
  type ValidationBooking,
  type ValidationDoctor,
  type ValidationService,
} from './bookingValidation';
import {
  ensurePatientForStaffBooking,
  listPatients,
  searchPatientsInMemory,
  type PatientRecord,
  type StaffActor,
} from './patientsService';
import { hasPatientPermission, hasStaffBookingPermission, type PermissionUser } from './permissions';

export interface StaffAssigneeOption {
  user_id: string;
  name: string;
  role: 'admin' | 'staff';
  is_active?: boolean;
}

export interface StaffBookingSubmitPayload {
  patientId?: string;
  patientName: string;
  phone: string;
  phone2?: string;
  address: string;
  age: number;
  governorate: string;
  center: string;
  notes?: string;
  bookingType: 'cash' | 'contract';
  doctorId: number;
  doctorName: string;
  service: string;
  date: string;
  time: string;
  contractingCompanyId?: number;
  paymentMethod?: 'cash' | 'instapay' | 'wallet';
  paymentStatus: 'pending';
  bookingSource: BookingSourceType;
  assignedStaffId?: string;
  assignedStaffName?: string;
  overrideReason?: string;
}

interface StaffBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctors: ValidationDoctor[];
  services: ValidationService[];
  bookings: ValidationBooking[];
  contractingList: { id: number; name: string }[];
  staffMembers: StaffAssigneeOption[];
  workingHours: { weekdays: string; friday: string };
  currentUser: PermissionUser;
  actor: StaffActor;
  prefilledPatient?: PatientRecord | null;
  inputClass: string;
  onSubmitBooking: (payload: StaffBookingSubmitPayload) => Promise<void>;
}

const TIME_SLOTS = generateClinicTimeSlots();

export const StaffBookingModal: React.FC<StaffBookingModalProps> = ({
  isOpen,
  onClose,
  doctors,
  services,
  bookings,
  contractingList,
  staffMembers,
  workingHours,
  currentUser,
  actor,
  prefilledPatient = null,
  inputClass,
  onSubmitBooking,
}) => {
  const todayStr = cairoTodayStr();

  const canCreate = hasStaffBookingPermission(currentUser, 'staff_bookings_create');
  const canCreatePatient = hasPatientPermission(currentUser, 'patients_create');
  const canAssign = hasStaffBookingPermission(currentUser, 'staff_bookings_assign_employee');
  const canOverride = hasStaffBookingPermission(currentUser, 'staff_bookings_override_rules');
  const isAdmin = currentUser?.role === 'admin';

  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [registerAsNewPatient, setRegisterAsNewPatient] = useState(true);

  const [patientName, setPatientName] = useState('');
  const [phone, setPhone] = useState('');
  const [phone2, setPhone2] = useState('');
  const [age, setAge] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [center, setCenter] = useState('');
  const [notes, setNotes] = useState('');

  const [doctorId, setDoctorId] = useState<number>(0);
  const [service, setService] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [bookingType, setBookingType] = useState<'cash' | 'contract'>('cash');
  const [contractingCompanyId, setContractingCompanyId] = useState<number | undefined>(undefined);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'instapay' | 'wallet'>('cash');
  const [bookingSource, setBookingSource] = useState<BookingSourceType>(isAdmin ? 'admin' : 'staff');
  const [assignedStaffId, setAssignedStaffId] = useState<string>(actor.userId || '');

  const [allowOverride, setAllowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    void listPatients()
      .then(setPatients)
      .catch(() => undefined);

    if (prefilledPatient) {
      setSelectedPatient(prefilledPatient);
      setRegisterAsNewPatient(false);
      setPatientName(prefilledPatient.fullName);
      setPhone(prefilledPatient.phone);
      setPhone2(prefilledPatient.phone2 || '');
      setAge(prefilledPatient.age ? String(prefilledPatient.age) : '');
      setGovernorate(prefilledPatient.governorate || '');
      setCenter(prefilledPatient.center || '');
    } else {
      setSelectedPatient(null);
      setRegisterAsNewPatient(canCreatePatient);
      setPatientName('');
      setPhone('');
      setPhone2('');
      setAge('');
      setGovernorate('');
      setCenter('');
    }
    setPatientSearch('');
    setNotes('');
    setDoctorId(doctors[0]?.id || 0);
    setService(services[0]?.title || '');
    const firstDates = upcomingDates(doctors[0]?.availableDates || [], todayStr);
    setDate(firstDates[0] || '');
    setTime('');
    setBookingType('cash');
    setContractingCompanyId(undefined);
    setPaymentMethod('cash');
    setBookingSource(isAdmin ? 'admin' : 'staff');
    setAssignedStaffId(actor.userId || '');
    setAllowOverride(false);
    setOverrideReason('');
  }, [isOpen, prefilledPatient, doctors, services, actor.userId, canCreatePatient, isAdmin, todayStr]);

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === doctorId) || null,
    [doctors, doctorId],
  );

  const doctorDates = useMemo(
    () => upcomingDates(selectedDoctor?.availableDates || [], todayStr),
    [selectedDoctor, todayStr],
  );

  const matchingPatients = useMemo(() => {
    if (!patientSearch.trim()) return [];
    return searchPatientsInMemory(patients, patientSearch).slice(0, 6);
  }, [patients, patientSearch]);

  const expectedFee = useMemo(
    () => computeBookingExpectedFee(service, selectedDoctor, services),
    [service, selectedDoctor, services],
  );

  const liveValidation = useMemo(
    () =>
      validateBookingRules({
        patientName,
        phone,
        phone2,
        age,
        governorate,
        center,
        doctor: selectedDoctor,
        service,
        date,
        time,
        bookingType,
        contractingCompanyId,
        bookings,
        workingHours,
        todayStr,
      }),
    [
      patientName,
      phone,
      phone2,
      age,
      governorate,
      center,
      selectedDoctor,
      service,
      date,
      time,
      bookingType,
      contractingCompanyId,
      bookings,
      workingHours,
      todayStr,
    ],
  );

  if (!isOpen || !canCreate) return null;

  const handleSelectExistingPatient = (p: PatientRecord) => {
    setSelectedPatient(p);
    setRegisterAsNewPatient(false);
    setPatientName(p.fullName);
    setPhone(p.phone);
    setPhone2(p.phone2 || '');
    setAge(p.age ? String(p.age) : '');
    setGovernorate(p.governorate || '');
    setCenter(p.center || '');
    setPatientSearch('');
  };

  const handleDoctorChange = (nextId: number) => {
    setDoctorId(nextId);
    const nextDoc = doctors.find((d) => d.id === nextId);
    const valid = upcomingDates(nextDoc?.availableDates || [], todayStr);
    if (!valid.includes(date)) {
      setDate(valid[0] || '');
    }
    setTime('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      toast.error('ليست لديك صلاحية إضافة حجز بواسطة الموظف');
      return;
    }

    if (!liveValidation.ok) {
      if (!liveValidation.overridable) {
        toast.error(liveValidation.message || 'يرجى استيفاء بيانات الحجز بشكل صحيح');
        return;
      }
      if (!canOverride) {
        toast.error(liveValidation.message || 'لا تملك صلاحية استثناء قيود الحجز');
        return;
      }
      if (!allowOverride || !overrideReason.trim()) {
        toast.error('يرجى تفعيل خيار استثناء القواعد وكتابة سبب الاستثناء في سجل التدقيق');
        return;
      }
    }

    setSubmitting(true);
    try {
      let resolvedPatientId = selectedPatient?.id;
      const composedAddress = `${governorate} - ${center.trim()}`;
      if (!resolvedPatientId && registerAsNewPatient && canCreatePatient) {
        const ensured = await ensurePatientForStaffBooking(
          {
            fullName: patientName.trim(),
            phone: normalizePhone(phone),
            phone2: phone2 ? normalizePhone(phone2) : undefined,
            age: Number(age),
            governorate,
            center: center.trim(),
            address: composedAddress,
          },
          actor,
        );
        if (ensured) resolvedPatientId = ensured.id;
      }

      const assignedMember = staffMembers.find((m) => m.user_id === assignedStaffId);
      const effectiveAssignedId = canAssign && assignedStaffId ? assignedStaffId : actor.userId;
      const effectiveAssignedName =
        canAssign && assignedMember ? assignedMember.name : actor.name;

      await onSubmitBooking({
        patientId: resolvedPatientId,
        patientName: patientName.trim(),
        phone: normalizePhone(phone),
        phone2: phone2 ? normalizePhone(phone2) : undefined,
        address: composedAddress,
        age: Number(age),
        governorate,
        center: center.trim(),
        notes: notes.trim() || undefined,
        bookingType,
        doctorId: selectedDoctor!.id,
        doctorName: selectedDoctor!.name,
        service,
        date,
        time,
        contractingCompanyId: bookingType === 'contract' ? contractingCompanyId : undefined,
        paymentMethod,
        paymentStatus: 'pending',
        bookingSource: isAdmin ? bookingSource : 'staff',
        assignedStaffId: effectiveAssignedId,
        assignedStaffName: effectiveAssignedName,
        overrideReason: !liveValidation.ok && liveValidation.overridable && allowOverride ? overrideReason.trim() : undefined,
      });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ أثناء حفظ حجز الموظف');
    } finally {
      setSubmitting(false);
    }
  };

  const govCenters = governorate && EGYPT_CENTERS[governorate] ? EGYPT_CENTERS[governorate] : [];

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-[#DFEAF0] w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-l from-[#0B1F35] via-[#102C48] to-[#087F8C] px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl">
              <CalendarDays size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black">إضافة حجز بواسطة الموظف</h3>
              <p className="text-xs text-white/80">تطبيق نفس قواعد المواعيد والسعة مع تتبع الموظف المسؤول ومصدر الحجز</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors" aria-label="إغلاق">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Step 1: Patient Lookup / New Patient Link */}
          <div className="bg-[#F5FAFC] p-4 rounded-2xl border border-[#DFEAF0] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-black text-[#172B3A] flex items-center gap-2">
                <UserPlus size={16} className="text-[#087F8C]" /> بيانات المريض والربط بملف المريض
              </h4>
              {selectedPatient && (
                <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-xl text-xs font-bold">
                  <CheckCircle size={13} />
                  مرتبط بملف: {selectedPatient.fullName} ({selectedPatient.fileNumber})
                  <button
                    type="button"
                    onClick={() => setSelectedPatient(null)}
                    className="text-red-500 hover:underline mr-1"
                  >
                    فك الارتباط
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <Search size={15} className="absolute right-3.5 top-3.5 text-[#718394]" />
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="ابحث عن مريض مسجل مسبقاً بالاسم أو رقم الهاتف لملء بياناته تلقائياً..."
                className={`${inputClass} pr-10`}
              />
              {matchingPatients.length > 0 && (
                <div className="mt-2 bg-white border border-[#DFEAF0] rounded-xl divide-y divide-[#DFEAF0] shadow-md">
                  {matchingPatients.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectExistingPatient(p)}
                      className="w-full text-right px-4 py-2.5 hover:bg-[#F5FAFC] flex items-center justify-between text-xs"
                    >
                      <span className="font-bold text-[#172B3A]">{p.fullName}</span>
                      <span className="text-[#087F8C] font-bold fv-num" dir="ltr">{p.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-[#718394] mb-1 block">الاسم الرباعي للمريض *</label>
                <input
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className={inputClass}
                  placeholder="الاسم الأول الثاني الثالث الرابع"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">السن *</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className={`${inputClass} fv-num`}
                  placeholder="35"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">رقم الهاتف الأساسي *</label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`${inputClass} fv-num`}
                  placeholder="01012345678"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">هاتف إضافي</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={phone2}
                  onChange={(e) => setPhone2(e.target.value)}
                  className={`${inputClass} fv-num`}
                  placeholder="01112345678"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">المحافظة *</label>
                <select
                  required
                  value={governorate}
                  onChange={(e) => {
                    setGovernorate(e.target.value);
                    setCenter('');
                  }}
                  className={inputClass}
                >
                  <option value="">اختر المحافظة</option>
                  {Object.keys(EGYPT_CENTERS).map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">المركز / المدينة *</label>
                {govCenters.length > 0 ? (
                  <select required value={center} onChange={(e) => setCenter(e.target.value)} className={inputClass}>
                    <option value="">اختر المركز / المدينة</option>
                    {govCenters.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={center}
                    onChange={(e) => setCenter(e.target.value)}
                    className={inputClass}
                    placeholder="المركز / المدينة"
                  />
                )}
              </div>
              {!selectedPatient && canCreatePatient && (
                <div className="md:col-span-2 flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#087F8C]">
                    <input
                      type="checkbox"
                      checked={registerAsNewPatient}
                      onChange={(e) => setRegisterAsNewPatient(e.target.checked)}
                      className="w-4 h-4 text-[#087F8C] rounded-sm"
                    />
                    إنشاء ملف مريض دائم تلقائياً في سجل المرضى إذا لم يكن مسجلاً
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Doctor, Service, Date & Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">الطبيب *</label>
              <select
                required
                value={doctorId}
                onChange={(e) => handleDoctorChange(Number(e.target.value))}
                className={inputClass}
              >
                <option value={0}>اختر الطبيب</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.fee} ج.م)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">الخدمة / الإجراء *</label>
              <select required value={service} onChange={(e) => setService(e.target.value)} className={inputClass}>
                {services.map((s) => (
                  <option key={s.title} value={s.title}>
                    {s.title} ({s.price} ج.م)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">تاريخ الحجز *</label>
              {doctorDates.length > 0 && !allowOverride ? (
                <select required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass}>
                  <option value="">اختر يوم العمل المتاح</option>
                  {doctorDates.map((d) => {
                    const count = bookings.filter((b) => b.doctorId === doctorId && b.date === d && b.status === 'confirmed').length;
                    const max = selectedDoctor?.maxPatients || 0;
                    return (
                      <option key={d} value={d}>
                        {d} ({arabicWeekday(d)}) — {count}/{max || '∞'}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input
                  type="date"
                  required
                  min={todayStr}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">الموعد (الساعة) *</label>
              <select required value={time} onChange={(e) => setTime(e.target.value)} className={inputClass}>
                <option value="">اختر الوقت</option>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">نوع الحجز</label>
              <select
                value={bookingType}
                onChange={(e) => setBookingType(e.target.value as 'cash' | 'contract')}
                className={inputClass}
              >
                <option value="cash">كشف نقدي / خاص</option>
                <option value="contract">تعاقد / تأمين</option>
              </select>
            </div>
            {bookingType === 'contract' && (
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">جهة التعاقد *</label>
                <select
                  required
                  value={contractingCompanyId ?? ''}
                  onChange={(e) => setContractingCompanyId(e.target.value ? Number(e.target.value) : undefined)}
                  className={inputClass}
                >
                  <option value="">اختر جهة التعاقد</option>
                  {contractingList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Step 3: Staff Assignment, Source & Financial Reference */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-[#F5FAFC] p-4 rounded-2xl border border-[#DFEAF0]">
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">مصدر الحجز</label>
              {isAdmin ? (
                <select
                  value={bookingSource}
                  onChange={(e) => setBookingSource(e.target.value as BookingSourceType)}
                  className={inputClass}
                >
                  <option value="staff">حجز بواسطة الموظف</option>
                  <option value="admin">حجز إداري</option>
                </select>
              ) : (
                <div className="px-3 py-2.5 bg-white border border-[#DFEAF0] rounded-xl text-xs font-bold text-[#087F8C]">
                  حجز بواسطة الموظف ({actor.name})
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">الموظف المسؤول</label>
              {canAssign && staffMembers.length > 0 ? (
                <select
                  value={assignedStaffId}
                  onChange={(e) => setAssignedStaffId(e.target.value)}
                  className={inputClass}
                >
                  <option value={actor.userId || ''}>{actor.name} (الحالي)</option>
                  {staffMembers
                    .filter((m) => m.is_active !== false && m.user_id !== actor.userId)
                    .map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              ) : (
                <div className="px-3 py-2.5 bg-white border border-[#DFEAF0] rounded-xl text-xs font-bold text-[#172B3A] flex items-center gap-1.5">
                  <UserCheck size={14} className="text-[#087F8C]" /> {actor.name}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">وسيلة الدفع المتوقعة</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'instapay' | 'wallet')}
                className={inputClass}
              >
                <option value="cash">نقداً في المركز (تُحصل من المدفوعات/الحسابات)</option>
                <option value="instapay">InstaPay (يتطلب مراجعة واعتماد)</option>
                <option value="wallet">محفظة إلكترونية</option>
              </select>
            </div>
            <div className="flex flex-col justify-center px-3 py-2 bg-white border border-[#DFEAF0] rounded-xl">
              <span className="text-[11px] font-bold text-[#718394]">المستحق المسجل (غير مدفوع حتى التأكيد)</span>
              <span className="text-sm font-black text-[#087F8C] fv-num">{expectedFee.toLocaleString()} ج.م</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#718394] mb-1 block">ملاحظات الحجز</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
              placeholder="ملاحظات إضافية..."
            />
          </div>

          {/* Rule Validation Feedback + Controlled Override */}
          {!liveValidation.ok && (
            <div className={`p-4 rounded-2xl border ${liveValidation.overridable && canOverride ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={18} className={liveValidation.overridable && canOverride ? 'text-amber-600 shrink-0 mt-0.5' : 'text-red-600 shrink-0 mt-0.5'} />
                <div className="flex-1 space-y-2">
                  <p className="text-xs font-bold text-[#172B3A]">{liveValidation.message}</p>
                  {liveValidation.overridable && canOverride && (
                    <div className="space-y-2 pt-1 border-t border-amber-200/70">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-amber-800">
                        <input
                          type="checkbox"
                          checked={allowOverride}
                          onChange={(e) => setAllowOverride(e.target.checked)}
                          className="w-4 h-4 text-amber-600 rounded-sm"
                        />
                        <ShieldAlert size={14} /> استثناء القاعدة التنظيمية بصلاحية الموظف (يُوثق في سجل التدقيق)
                      </label>
                      {allowOverride && (
                        <input
                          type="text"
                          required
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          className={inputClass}
                          placeholder="اكتب سبب الاستثناء بوضوح (مطلوب للتدقيق)..."
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {liveValidation.ok && (
            <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700 flex items-center gap-2">
              <Clock size={15} /> الموعد والبيانات متوافقة مع جميع قواعد الحجز والسعة الرسمية.
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-[#DFEAF0]">
            <button
              type="submit"
              disabled={submitting || (!liveValidation.ok && (!liveValidation.overridable || !canOverride))}
              className="fv-btn-primary px-8 py-3.5 rounded-xl font-black text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <CheckCircle size={17} />
              {submitting ? 'جاري تسجيل الحجز...' : 'تأكيد تسجيل الحجز'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3.5 bg-[#F5FAFC] border border-[#DFEAF0] text-[#718394] rounded-xl font-bold text-sm hover:bg-white"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
