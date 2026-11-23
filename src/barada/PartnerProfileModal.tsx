import React from 'react';
import {
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  Edit2,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  MapPin,
  Phone,
  Printer,
  RefreshCw,
  Save,
  TrendingUp,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  ACTIVITY_TYPE_LABELS,
  ORG_TYPE_OPTIONS,
  RELATIONSHIP_STATUS_OPTIONS,
  type PartnerActivity,
  type PartnerContact,
  type PartnerContract,
  type PartnerContractRenewal,
  type PartnerFollowup,
  type PartnerOrganization,
  type RelationshipStatus,
} from './partnersTypes';
import {
  computeContractEffectiveStatus,
  type PartnerReferralSummary,
  type PartnerRevenueSummary,
} from './partnersAnalytics';

export interface OrgFormState {
  name: string;
  orgType: string;
  sector: string;
  governorate: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  managerName: string;
  contactTitle: string;
  managerPhone: string;
  contactEmail: string;
  cooperationStartDate: string;
  relationshipStatus: RelationshipStatus;
  assignedStaffId: string;
  assignedStaffName: string;
  adminNotes: string;
  isActive: boolean;
  documents: string[];
  newDoc: string;
}

export const EMPTY_ORG_FORM: OrgFormState = {
  name: '',
  orgType: 'شركة تأمين',
  sector: '',
  governorate: '',
  city: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  managerName: '',
  contactTitle: '',
  managerPhone: '',
  contactEmail: '',
  cooperationStartDate: '',
  relationshipStatus: 'نشط',
  assignedStaffId: '',
  assignedStaffName: '',
  adminNotes: '',
  isActive: true,
  documents: [],
  newDoc: '',
};

interface OrgFormModalProps {
  isOpen: boolean;
  isEditing: boolean;
  form: OrgFormState;
  setForm: React.Dispatch<React.SetStateAction<OrgFormState>>;
  staffMembers: { user_id: string; name: string }[];
  errorMsg: string | null;
  saving: boolean;
  inputClass: string;
  onSave: () => void;
  onClose: () => void;
}

export const PartnerOrgFormModal: React.FC<OrgFormModalProps> = ({
  isOpen,
  isEditing,
  form,
  setForm,
  staffMembers,
  errorMsg,
  saving,
  inputClass,
  onSave,
  onClose,
}) => {
  if (!isOpen) return null;

  const addDoc = () => {
    if (!form.newDoc.trim()) return;
    setForm((prev) => ({
      ...prev,
      documents: [...prev.documents, prev.newDoc.trim()],
      newDoc: '',
    }));
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl border border-[#DFEAF0] shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 my-6">
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#DFEAF0]">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-[#087F8C]/10 text-[#087F8C] rounded-xl">
              <Building2 size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#172B3A]">
                {isEditing ? 'تعديل بيانات الجهة المتعاقدة' : 'إضافة جهة متعاقدة جديدة (شريك نجاح)'}
              </h3>
              <p className="text-xs text-[#718394] font-medium">
                تُحفظ البيانات في قاعدة شركاء النجاح وتظهر المستندات المطلوبة في نافذة الحجز
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#718394] hover:text-red-500 rounded-xl hover:bg-red-50 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">اسم الجهة / الشركة *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
              placeholder="مثال: شركة مصر للتأمين / نقابة المهندسين"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">نوع الجهة</label>
            <select
              value={form.orgType}
              onChange={(e) => setForm({ ...form, orgType: e.target.value })}
              className={inputClass}
            >
              {ORG_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">النشاط / القطاع</label>
            <input
              type="text"
              value={form.sector}
              onChange={(e) => setForm({ ...form, sector: e.target.value })}
              className={inputClass}
              placeholder="تأمين طبي، بنوك، بترول..."
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">المحافظة</label>
            <input
              type="text"
              value={form.governorate}
              onChange={(e) => setForm({ ...form, governorate: e.target.value })}
              className={inputClass}
              placeholder="الأقصر، قنا، القاهرة..."
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">المدينة / المركز</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">العنوان التفصيلي</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">هاتف الجهة الرسمي</label>
            <input
              type="text"
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={`${inputClass} fv-num text-right`}
              placeholder="010..."
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">البريد الإلكتروني للجهة</label>
            <input
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={`${inputClass} fv-mono`}
              placeholder="info@company.com"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">الموقع الإلكتروني</label>
            <input
              type="url"
              dir="ltr"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className={`${inputClass} fv-mono`}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">حالة العلاقة</label>
            <select
              value={form.relationshipStatus}
              onChange={(e) =>
                setForm({ ...form, relationshipStatus: e.target.value as RelationshipStatus })
              }
              className={inputClass}
            >
              {RELATIONSHIP_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">تاريخ بدء التعاون</label>
            <input
              type="date"
              value={form.cooperationStartDate}
              onChange={(e) => setForm({ ...form, cooperationStartDate: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">الموظف المسؤول عن المتابعة</label>
            <select
              value={form.assignedStaffId}
              onChange={(e) => {
                const selected = staffMembers.find((s) => s.user_id === e.target.value);
                setForm({
                  ...form,
                  assignedStaffId: e.target.value,
                  assignedStaffName: selected?.name || '',
                });
              }}
              className={inputClass}
            >
              <option value="">غير محدد</option>
              {staffMembers.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0] mb-6">
          <h4 className="text-sm font-black text-[#172B3A] mb-3 flex items-center gap-2">
            <User size={16} className="text-[#087F8C]" /> بيانات مسؤول التواصل الرئيسي
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">اسم المسؤول</label>
              <input
                type="text"
                value={form.managerName}
                onChange={(e) => setForm({ ...form, managerName: e.target.value })}
                className="w-full bg-white border border-[#DFEAF0] rounded-xl p-2.5 text-sm text-[#172B3A]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">المسمى الوظيفي</label>
              <input
                type="text"
                value={form.contactTitle}
                onChange={(e) => setForm({ ...form, contactTitle: e.target.value })}
                className="w-full bg-white border border-[#DFEAF0] rounded-xl p-2.5 text-sm text-[#172B3A]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">رقم هاتف المسؤول</label>
              <input
                type="text"
                dir="ltr"
                value={form.managerPhone}
                onChange={(e) => setForm({ ...form, managerPhone: e.target.value })}
                className="w-full bg-white border border-[#DFEAF0] rounded-xl p-2.5 text-sm text-[#172B3A] fv-num text-right"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">بريد المسؤول</label>
              <input
                type="email"
                dir="ltr"
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                className="w-full bg-white border border-[#DFEAF0] rounded-xl p-2.5 text-sm text-[#172B3A] fv-mono"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">
              المستندات المطلوبة من المريض عند الحجز
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={form.newDoc}
                onChange={(e) => setForm({ ...form, newDoc: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDoc();
                  }
                }}
                className={inputClass}
                placeholder="مثال: كارنيه الشركة الساري"
              />
              <button
                type="button"
                onClick={addDoc}
                className="px-4 bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20 rounded-xl font-bold text-xs cursor-pointer hover:bg-[#087F8C]/20"
              >
                إضافة
              </button>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {form.documents.map((doc, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-[#F5FAFC] px-3 py-2 rounded-xl border border-[#DFEAF0] text-xs font-bold text-[#172B3A]"
                >
                  <span>{doc}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        documents: prev.documents.filter((_, i) => i !== idx),
                      }))
                    }
                    className="text-red-500 hover:text-red-700 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1.5 block">ملاحظات إدارية داخلية</label>
            <textarea
              rows={4}
              value={form.adminNotes}
              onChange={(e) => setForm({ ...form, adminNotes: e.target.value })}
              className={inputClass}
              placeholder="ملاحظات التفاوض، شروط الاستقبال، تفاصيل التعاون..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-[#DFEAF0]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-[#DFEAF0] text-[#718394] font-bold text-sm hover:text-[#172B3A] cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="fv-btn-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Save size={16} /> {saving ? 'جاري الحفظ...' : 'حفظ البيانات'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ProfileModalProps {
  organization: PartnerOrganization | null;
  contacts: PartnerContact[];
  activities: PartnerActivity[];
  contracts: PartnerContract[];
  renewals: PartnerContractRenewal[];
  followups: PartnerFollowup[];
  referrals: PartnerReferralSummary | null;
  revenue: PartnerRevenueSummary | null;
  canViewRevenue: boolean;
  canEditOrg: boolean;
  canViewContracts: boolean;
  canViewActivities: boolean;
  canExport: boolean;
  autoExpiringDays: number;
  onClose: () => void;
  onEditOrg: (org: PartnerOrganization) => void;
  onOpenAttachment: (path: string) => void;
  onPrintProfile: (org: PartnerOrganization) => void;
}

export const PartnerProfileModal: React.FC<ProfileModalProps> = ({
  organization,
  contacts,
  activities,
  contracts,
  renewals,
  followups,
  referrals,
  revenue,
  canViewRevenue,
  canEditOrg,
  canViewContracts,
  canViewActivities,
  canExport,
  autoExpiringDays,
  onClose,
  onEditOrg,
  onOpenAttachment,
  onPrintProfile,
}) => {
  if (!organization) return null;

  const orgContacts = contacts.filter((c) => c.companyId === organization.id && !c.isArchived);
  const orgActivities = activities.filter((a) => a.companyId === organization.id);
  const orgContracts = contracts.filter((c) => c.companyId === organization.id);
  const orgRenewals = renewals.filter((r) => r.companyId === organization.id);
  const orgFollowups = followups.filter((f) => f.companyId === organization.id);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl border border-[#DFEAF0] shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 my-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 mb-6 border-b border-[#DFEAF0]">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#087F8C]/10 text-[#087F8C] flex items-center justify-center shrink-0">
              <Building2 size={24} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-black text-[#172B3A]">{organization.name}</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20">
                  {organization.orgType || 'شركة تأمين'}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    organization.relationshipStatus === 'نشط'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : organization.relationshipStatus === 'قيد التفاوض'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {organization.relationshipStatus}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 mt-2 text-xs text-[#718394] font-medium">
                {(organization.governorate || organization.city) && (
                  <span className="flex items-center gap-1">
                    <MapPin size={13} className="text-[#087F8C]" />
                    {[organization.governorate, organization.city].filter(Boolean).join(' - ')}
                  </span>
                )}
                {organization.phone && (
                  <span className="flex items-center gap-1 fv-num" dir="ltr">
                    <Phone size={13} className="text-[#087F8C]" /> {organization.phone}
                  </span>
                )}
                {organization.email && (
                  <span className="flex items-center gap-1 fv-mono" dir="ltr">
                    <Mail size={13} className="text-[#087F8C]" /> {organization.email}
                  </span>
                )}
                {organization.website && (
                  <span className="flex items-center gap-1 fv-mono" dir="ltr">
                    <Globe size={13} className="text-[#087F8C]" /> {organization.website}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canExport && (
              <button
                type="button"
                onClick={() => onPrintProfile(organization)}
                className="px-3.5 py-2 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0] text-[#087F8C] text-xs font-bold flex items-center gap-1.5 hover:border-[#087F8C] cursor-pointer"
              >
                <Printer size={15} /> طباعة الملف
              </button>
            )}
            {canEditOrg && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditOrg(organization);
                }}
                className="px-3.5 py-2 rounded-xl bg-[#087F8C]/10 border border-[#087F8C]/20 text-[#087F8C] text-xs font-bold flex items-center gap-1.5 hover:bg-[#087F8C]/20 cursor-pointer"
              >
                <Edit2 size={15} /> تعديل
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[#718394] hover:text-red-500 rounded-xl hover:bg-red-50 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0]">
            <p className="text-[11px] font-bold text-[#718394]">المرضى المحولون</p>
            <p className="text-xl font-black text-[#172B3A] fv-num mt-1">
              {referrals ? referrals.uniquePatients : '—'}
            </p>
            {referrals && (
              <p className="text-[11px] text-[#087F8C] font-bold fv-num">
                {referrals.confirmedBookings} كشف / {referrals.totalSurgeries} عملية
              </p>
            )}
          </div>
          <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0]">
            <p className="text-[11px] font-bold text-[#718394]">العقود والزيارات</p>
            <p className="text-xl font-black text-[#172B3A] fv-num mt-1">
              {orgContracts.filter((c) => c.isCurrentVersion).length} عقد
            </p>
            <p className="text-[11px] text-[#718394] font-bold fv-num">
              {orgActivities.length} زيارة واجتماع
            </p>
          </div>
          <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0]">
            <p className="text-[11px] font-bold text-[#718394]">مهام المتابعة المفتوحة</p>
            <p className="text-xl font-black text-[#172B3A] fv-num mt-1">
              {orgFollowups.filter((f) => f.status !== 'مكتملة' && f.status !== 'ملغاة').length}
            </p>
            <p className="text-[11px] text-[#718394] font-bold fv-num">
              إجمالي المهام: {orgFollowups.length}
            </p>
          </div>
          {canViewRevenue && revenue ? (
            <div className="bg-emerald-50/70 rounded-2xl p-4 border border-emerald-200/80">
              <p className="text-[11px] font-bold text-emerald-700">الإيرادات المحصلة</p>
              <p className="text-xl font-black text-emerald-800 fv-num mt-1">
                {revenue.collectedAmount.toLocaleString('ar-EG')} ج.م
              </p>
              <p className="text-[11px] text-emerald-700 font-bold fv-num">
                مستحق: {revenue.outstandingAmount.toLocaleString('ar-EG')} ج.م
              </p>
            </div>
          ) : (
            <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0]">
              <p className="text-[11px] font-bold text-[#718394]">المسؤول بالمركز</p>
              <p className="text-sm font-black text-[#172B3A] mt-1">
                {organization.assignedStaffName || 'غير محدد'}
              </p>
              <p className="text-[11px] text-[#718394] font-bold fv-num">
                بدء التعاون: {organization.cooperationStartDate || '—'}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Required patient docs + Contacts */}
          <div className="space-y-5">
            <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0]">
              <h4 className="text-sm font-black text-[#172B3A] mb-3 flex items-center gap-2">
                <FileText size={16} className="text-[#087F8C]" /> المستندات المطلوبة من المريض
              </h4>
              {organization.documents.length > 0 ? (
                <ul className="space-y-1.5">
                  {organization.documents.map((d, i) => (
                    <li key={i} className="text-xs font-bold text-[#172B3A] flex items-center gap-2">
                      <CheckCircle size={13} className="text-[#087F8C] shrink-0" /> {d}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#718394]">لا توجد مستندات مسجلة</p>
              )}
              {organization.adminNotes && (
                <div className="mt-3 pt-3 border-t border-[#DFEAF0]">
                  <p className="text-[11px] font-bold text-[#718394] mb-1">ملاحظات إدارية</p>
                  <p className="text-xs text-[#172B3A] whitespace-pre-wrap">{organization.adminNotes}</p>
                </div>
              )}
            </div>

            <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0]">
              <h4 className="text-sm font-black text-[#172B3A] mb-3 flex items-center gap-2">
                <Users size={16} className="text-[#087F8C]" /> مسؤولو التواصل ({orgContacts.length})
              </h4>
              {organization.managerName && (
                <div className="bg-white p-3 rounded-xl border border-[#DFEAF0] mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[#172B3A]">{organization.managerName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#087F8C]/10 text-[#087F8C] font-bold">
                      جهة الاتصال الأساسية
                    </span>
                  </div>
                  <p className="text-[11px] text-[#718394] mt-1">
                    {[organization.contactTitle, organization.managerPhone, organization.contactEmail]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                </div>
              )}
              {orgContacts.map((c) => (
                <div key={c.id} className="bg-white p-3 rounded-xl border border-[#DFEAF0] mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[#172B3A]">{c.name}</span>
                    {c.isPrimary && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold">
                        أساسي
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#718394] mt-1">
                    {[c.jobTitle, c.department, c.phone, c.email].filter(Boolean).join(' • ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Contracts + Activity Timeline */}
          <div className="space-y-5">
            {canViewContracts && (
              <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0]">
                <h4 className="text-sm font-black text-[#172B3A] mb-3 flex items-center gap-2">
                  <TrendingUp size={16} className="text-[#087F8C]" /> العقود وسجل التجديدات ({orgContracts.length})
                </h4>
                {orgContracts.length === 0 ? (
                  <p className="text-xs text-[#718394]">لا توجد عقود مسجلة لهذه الجهة</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {orgContracts.map((ct) => {
                      const eff = computeContractEffectiveStatus(ct, autoExpiringDays);
                      return (
                        <div key={ct.id} className="bg-white p-3 rounded-xl border border-[#DFEAF0]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-[#172B3A] fv-num">
                              {ct.contractNumber} (v{ct.versionNumber})
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#087F8C]/10 text-[#087F8C]">
                              {eff.effectiveStatus}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#718394] fv-num mt-1">
                            {ct.contractType} • من {ct.startDate} إلى {ct.endDate}
                          </p>
                          {ct.attachmentPath && (
                            <button
                              type="button"
                              onClick={() => onOpenAttachment(ct.attachmentPath)}
                              className="mt-1.5 text-[11px] text-[#1769AA] font-bold flex items-center gap-1 hover:underline cursor-pointer"
                            >
                              <ExternalLink size={12} /> {ct.attachmentName || 'عرض مستند العقد'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {orgRenewals.length > 0 && (
                  <p className="text-[11px] text-[#718394] font-bold mt-2 fv-num">
                    تم تنفيذ {orgRenewals.length} عملية تجديد موثقة
                  </p>
                )}
              </div>
            )}

            {canViewActivities && (
              <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0]">
                <h4 className="text-sm font-black text-[#172B3A] mb-3 flex items-center gap-2">
                  <Clock size={16} className="text-[#087F8C]" /> سجل الزيارات والاجتماعات ({orgActivities.length})
                </h4>
                {orgActivities.length === 0 ? (
                  <p className="text-xs text-[#718394]">لم يتم تسجيل زيارات أو اجتماعات بعد</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {orgActivities.map((act) => (
                      <div key={act.id} className="bg-white p-3 rounded-xl border border-[#DFEAF0]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-[#172B3A]">
                            {ACTIVITY_TYPE_LABELS[act.activityType]} — {act.goal}
                          </span>
                          <span className="text-[10px] text-[#718394] fv-num">{act.activityDate}</span>
                        </div>
                        {act.summary && <p className="text-[11px] text-[#718394] mt-1">{act.summary}</p>}
                        <p className="text-[10px] text-[#087F8C] font-bold mt-1">
                          المسؤول: {act.staffName}
                          {act.nextFollowupDate ? ` • المتابعة القادمة: ${act.nextFollowupDate}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface RenewModalProps {
  contract: PartnerContract | null;
  companyName: string;
  newContractNumber: string;
  setNewContractNumber: (v: string) => void;
  newStartDate: string;
  setNewStartDate: (v: string) => void;
  newEndDate: string;
  setNewEndDate: (v: string) => void;
  nextRenewalDate: string;
  setNextRenewalDate: (v: string) => void;
  renewalNotes: string;
  setRenewalNotes: (v: string) => void;
  saving: boolean;
  inputClass: string;
  onConfirm: () => void;
  onClose: () => void;
}

export const ContractRenewModal: React.FC<RenewModalProps> = ({
  contract,
  companyName,
  newContractNumber,
  setNewContractNumber,
  newStartDate,
  setNewStartDate,
  newEndDate,
  setNewEndDate,
  nextRenewalDate,
  setNextRenewalDate,
  renewalNotes,
  setRenewalNotes,
  saving,
  inputClass,
  onConfirm,
  onClose,
}) => {
  if (!contract) return null;

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs">
      <div className="bg-white rounded-3xl border border-[#DFEAF0] shadow-2xl max-w-lg w-full p-6 md:p-7">
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#DFEAF0]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#087F8C]/10 text-[#087F8C] rounded-xl">
              <RefreshCw size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-[#172B3A]">تجديد العقد وحفظ النسخة التاريخية</h3>
              <p className="text-xs text-[#718394]">
                {companyName} — العقد الحالي: {contract.contractNumber} (v{contract.versionNumber})
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#718394] hover:text-red-500 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-xs text-amber-800 font-bold">
            سيتم الاحتفاظ بسجل العقد القديم كمرجع تاريخي بحالة "مجدد" وإنشاء إصدار جديد (v
            {contract.versionNumber + 1}).
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1 block">رقم العقد الجديد</label>
            <input
              type="text"
              value={newContractNumber}
              onChange={(e) => setNewContractNumber(e.target.value)}
              className={`${inputClass} fv-num`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">تاريخ البداية الجديد *</label>
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-1 block">تاريخ الانتهاء الجديد *</label>
              <input
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1 block">تاريخ المراجعة / التجديد القادم</label>
            <input
              type="date"
              value={nextRenewalDate}
              onChange={(e) => setNextRenewalDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#718394] mb-1 block">ملاحظات التجديد والشروط المحدثة</label>
            <textarea
              rows={3}
              value={renewalNotes}
              onChange={(e) => setRenewalNotes(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[#DFEAF0]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-[#DFEAF0] text-[#718394] font-bold text-sm cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onConfirm}
            className="fv-btn-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Calendar size={16} /> {saving ? 'جاري التجديد...' : 'تأكيد التجديد'}
          </button>
        </div>
      </div>
    </div>
  );
};
