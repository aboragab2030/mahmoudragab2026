import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import { withMinSpin } from '@/lib/refreshSpin';
import {
  Activity,
  AlertTriangle,
  Archive,
  Award,
  Banknote,
  BarChart2,
  Bell,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle,
  Clock,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Handshake,
  History,
  ListChecks,
  MapPin,
  Paperclip,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Scissors,
  Search,
  Settings,
  Shield,
  Trash2,
  TrendingUp,
  Upload,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { CONTRACTING_CHANGED_EVENT } from './contracting';
import {
  ACTIVITY_TYPE_LABELS,
  CONTRACT_STATUS_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  DEFAULT_ALERT_SETTINGS,
  FOLLOWUP_PRIORITY_LABELS,
  FOLLOWUP_STATUS_OPTIONS,
  ORG_TYPE_OPTIONS,
  RELATIONSHIP_STATUS_OPTIONS,
  type ActivityFollowupStatus,
  type ContactCommunicationStatus,
  type ContactImportance,
  type ContractStatus,
  type FollowupPriority,
  type FollowupTaskStatus,
  type PartnerActivity,
  type PartnerActivityType,
  type PartnerAlertSettings,
  type PartnerAttachment,
  type PartnerAuditLog,
  type PartnerContact,
  type PartnerContract,
  type PartnerContractRenewal,
  type PartnerFollowup,
  type PartnerOrganization,
  type PartnerRenewalAlertLog,
} from './partnersTypes';
import {
  buildCsvContent,
  cairoTodayIso,
  computeContractEffectiveStatus,
  computePartnerReferrals,
  computePartnerRevenue,
  computePartnersDashboardSummary,
  evaluateContractAlerts,
  hasPartnerPermission,
  type AnalyticsBookingRecord,
  type AnalyticsOperationRecord,
  type AnalyticsPaymentRecord,
} from './partnersAnalytics';
import {
  completePartnerFollowupRecord,
  deletePartnerActivityRecord,
  deletePartnerContractRecord,
  deletePartnerOrganizationRecord,
  loadPartnersBundle,
  openPartnerDocument,
  recordPartnerAudit,
  renewPartnerContract,
  savePartnerActivity,
  savePartnerAlertSettings,
  savePartnerContact,
  savePartnerContract,
  savePartnerFollowup,
  savePartnerOrganization,
  syncContractRenewalAlerts,
  toggleArchivePartnerContact,
  uploadPartnerDocument,
} from './partnersService';
import {
  ContractRenewModal,
  EMPTY_ORG_FORM,
  PartnerOrgFormModal,
  PartnerProfileModal,
  type OrgFormState,
} from './PartnerProfileModal';

type PartnersSubTab =
  | 'dashboard'
  | 'organizations'
  | 'contacts'
  | 'activities'
  | 'contracts'
  | 'referrals'
  | 'revenue'
  | 'followups'
  | 'reports';

export interface PartnerHubBookingInput {
  id?: string | number;
  databaseId?: string;
  patientName?: string;
  patient_name?: string;
  phone?: string;
  phone2?: string | null;
  doctorId?: string | number | null;
  doctor_id?: string | null;
  doctorName?: string;
  doctor_name?: string;
  service?: string;
  date?: string;
  time?: string;
  status?: string;
  bookingType?: string | null;
  booking_type?: string | null;
  contractingCompanyId?: number | null;
  contracting_company_id?: number | null;
  paymentMethod?: string | null;
  payment_method?: string | null;
  paymentStatus?: string | null;
  payment_status?: string | null;
  notes?: string | null;
  createdAt?: string;
  created_at?: string;
}

export interface PartnerHubOperationInput {
  id?: string | number;
  dbId?: string;
  patientName?: string;
  patient_name?: string;
  patientPhone?: string;
  patient_phone?: string;
  doctorName?: string;
  doctor_name?: string;
  surgeryType?: string;
  surgery_type?: string;
  date?: string;
  cost?: number;
  status?: string;
  contractingCompanyId?: number | null;
  contracting_company_id?: number | null;
}

export interface PartnerHubPaymentInput {
  id?: string | number;
  booking_id?: string | null;
  bookingId?: string | null;
  amount?: number;
  status?: string;
  payment_type?: string;
  paymentType?: string;
  created_at?: string;
  createdAt?: string;
}

export interface PartnersSuccessHubProps {
  currentUser: { name: string; role: 'admin' | 'staff'; permissions: string[] };
  currentUserUuid?: string;
  rawBookings: PartnerHubBookingInput[];
  allBookings: PartnerHubBookingInput[];
  operations: PartnerHubOperationInput[];
  rawPayments: PartnerHubPaymentInput[];
  doctors: { id: number | string; name: string; fee: number }[];
  services: { id: number | string; title: string; price: number }[];
  staffMembers: { user_id: string; name: string; role?: string }[];
  cardClass: string;
  inputClass: string;
  onPrint: (title: string, html: string) => void;
  onNotify: (title: string, message: string, type: 'success' | 'warning' | 'info') => void;
  onRefresh?: () => Promise<void> | void;
}

const StatCard = ({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) => (
  <div className="bg-white p-4 rounded-2xl border border-[#DFEAF0] shadow-[0_10px_28px_-18px_rgba(11,31,53,0.18)] hover:border-[#25B8C7]/50 transition-all">
    <div className="flex items-center gap-2.5 mb-2.5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} />
      </div>
      <span className="text-xs font-bold text-[#718394] leading-snug">{label}</span>
    </div>
    <h3 className="text-2xl font-black text-[#172B3A] fv-num">{value}</h3>
    {sub && <p className="text-[11px] text-[#718394] font-bold mt-1 fv-num">{sub}</p>}
  </div>
);

const MiniBar = ({
  data,
  maxVal,
  barClass = 'from-[#087F8C] to-[#25B8C7]',
}: {
  data: { label: string; value: number }[];
  maxVal: number;
  barClass?: string;
}) => (
  <div className="flex items-end gap-2 h-28 pt-3">
    {data.length === 0 ? (
      <p className="text-xs text-[#718394] m-auto font-bold">لا توجد بيانات كافية بعد</p>
    ) : (
      data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-[10px] text-[#172B3A] font-black fv-num">
            {d.value > 0 ? d.value.toLocaleString('ar-EG') : '0'}
          </span>
          <div
            className={`w-full max-w-[38px] bg-gradient-to-t ${barClass} rounded-t-lg min-h-[4px] transition-all`}
            style={{ height: `${maxVal > 0 ? Math.max(5, (d.value / maxVal) * 100) : 5}%` }}
          />
          <span className="text-[9px] text-[#718394] font-bold truncate w-full text-center fv-num">
            {d.label}
          </span>
        </div>
      ))
    )}
  </div>
);

const HorizontalRankList = ({
  items,
  unit = '',
}: {
  items: { label: string; value: number; sub?: string }[];
  unit?: string;
}) => {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) {
    return <p className="text-xs text-[#718394] py-4 text-center font-bold">لا توجد بيانات مسجلة</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#172B3A] truncate">{item.label}</span>
            <span className="font-black text-[#087F8C] fv-num shrink-0">
              {item.value.toLocaleString('ar-EG')} {unit}
              {item.sub ? <span className="text-[#718394] font-medium mr-1">({item.sub})</span> : null}
            </span>
          </div>
          <div className="h-2 bg-[#F5FAFC] rounded-full overflow-hidden border border-[#DFEAF0]/70">
            <div
              className="h-full bg-gradient-to-r from-[#087F8C] to-[#25B8C7] rounded-full transition-all"
              style={{ width: `${Math.max(4, Math.round((item.value / max) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export const PartnersSuccessHub: React.FC<PartnersSuccessHubProps> = ({
  currentUser,
  currentUserUuid,
  rawBookings,
  allBookings,
  operations,
  rawPayments,
  doctors,
  services,
  staffMembers,
  cardClass,
  inputClass,
  onPrint,
  onNotify,
  onRefresh,
}) => {
  const perm = useCallback(
    (p: string) => hasPartnerPermission(currentUser, p),
    [currentUser],
  );

  // Available sub-tabs strictly based on permissions
  const visibleTabs = useMemo(() => {
    const defs: { id: PartnersSubTab; label: string; icon: React.ElementType; allowed: boolean }[] = [
      {
        id: 'dashboard',
        label: 'لوحة المؤشرات',
        icon: BarChart2,
        allowed: perm('partners_view_dashboard') || perm('partners_view'),
      },
      {
        id: 'organizations',
        label: 'الجهات المتعاقدة',
        icon: Building2,
        allowed: perm('partners_view_organizations') || perm('partners_view'),
      },
      {
        id: 'contacts',
        label: 'مسؤولو التواصل',
        icon: Users,
        allowed: perm('partners_manage_contacts') || perm('partners_view_organizations'),
      },
      {
        id: 'activities',
        label: 'الزيارات والاجتماعات',
        icon: Handshake,
        allowed: perm('partners_view_activities'),
      },
      {
        id: 'contracts',
        label: 'العقود والتجديدات',
        icon: FileText,
        allowed: perm('partners_view_contracts'),
      },
      {
        id: 'referrals',
        label: 'المرضى المحولون',
        icon: UserCheck,
        allowed: perm('partners_view_referrals'),
      },
      {
        id: 'revenue',
        label: 'الإيرادات المالية',
        icon: Banknote,
        allowed: perm('partners_view_revenue') || perm('partners_view_financial_reports'),
      },
      {
        id: 'followups',
        label: 'المتابعات والتنبيهات',
        icon: Bell,
        allowed: perm('partners_view_followups') || perm('partners_manage_renewal_alerts'),
      },
      {
        id: 'reports',
        label: 'التقارير وسجل التدقيق',
        icon: FileSpreadsheet,
        allowed:
          perm('partners_export_reports') ||
          perm('partners_view_financial_reports') ||
          perm('partners_view_dashboard') ||
          currentUser.role === 'admin',
      },
    ];
    return defs.filter((d) => d.allowed);
  }, [perm, currentUser.role]);

  const [activeTab, setActiveTab] = useState<PartnersSubTab>(
    visibleTabs[0]?.id || 'organizations',
  );

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === activeTab) && visibleTabs[0]) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  // Core loaded state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [organizations, setOrganizations] = useState<PartnerOrganization[]>([]);
  const [contacts, setContacts] = useState<PartnerContact[]>([]);
  const [activities, setActivities] = useState<PartnerActivity[]>([]);
  const [contracts, setContracts] = useState<PartnerContract[]>([]);
  const [renewals, setRenewals] = useState<PartnerContractRenewal[]>([]);
  const [followups, setFollowups] = useState<PartnerFollowup[]>([]);
  const [alertSettings, setAlertSettings] = useState<PartnerAlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [alertLogs, setAlertLogs] = useState<PartnerRenewalAlertLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<PartnerAuditLog[]>([]);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    try {
      const bundle = await loadPartnersBundle();
      setOrganizations(bundle.organizations);
      setContacts(bundle.contacts);
      setActivities(bundle.activities);
      setContracts(bundle.contracts);
      setRenewals(bundle.renewals);
      setFollowups(bundle.followups);
      setAlertSettings(bundle.alertSettings);
      setAlertLogs(bundle.alertLogs);
      setAuditLogs(bundle.auditLogs);
    } catch (err) {
      console.error('Error loading Partners of Success:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await withMinSpin(() => Promise.all([reloadAll(), Promise.resolve(onRefresh?.())]));
    } finally {
      setRefreshing(false);
    }
  }, [reloadAll, onRefresh]);

  useEffect(() => {
    reloadAll();
    const handler = () => {
      void reloadAll();
    };
    window.addEventListener(CONTRACTING_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CONTRACTING_CHANGED_EVENT, handler);
  }, [reloadAll]);

  // Normalize existing clinic records (bookings, operations, payments) for accurate cross-module analytics
  const normalizedBookings: AnalyticsBookingRecord[] = useMemo(() => {
    if (Array.isArray(rawBookings) && rawBookings.length > 0) {
      return rawBookings.map((b) => ({
        id: String(b.id ?? ''),
        patientName: String(b.patient_name || b.patientName || ''),
        phone: String(b.phone || ''),
        phone2: b.phone2 ? String(b.phone2) : null,
        doctorId: b.doctor_id ? String(b.doctor_id) : b.doctorId != null ? String(b.doctorId) : null,
        doctorName: String(b.doctor_name || b.doctorName || ''),
        service: String(b.service || ''),
        date: String(b.date || ''),
        time: String(b.time || ''),
        status: String(b.status || 'confirmed'),
        bookingType: String(b.booking_type || b.bookingType || 'cash'),
        contractingCompanyId:
          b.contracting_company_id != null
            ? Number(b.contracting_company_id)
            : b.contractingCompanyId != null
              ? Number(b.contractingCompanyId)
              : null,
        paymentMethod: b.payment_method ? String(b.payment_method) : b.paymentMethod ? String(b.paymentMethod) : null,
        paymentStatus: b.payment_status ? String(b.payment_status) : b.paymentStatus ? String(b.paymentStatus) : null,
        notes: b.notes ? String(b.notes) : null,
        createdAt: String(b.created_at || b.createdAt || ''),
      }));
    }
    return (allBookings || []).map((b) => ({
      id: String(b.databaseId || b.id || ''),
      patientName: String(b.patientName || b.patient_name || ''),
      phone: String(b.phone || ''),
      phone2: b.phone2 ? String(b.phone2) : null,
      doctorId: b.doctorId != null ? String(b.doctorId) : b.doctor_id ? String(b.doctor_id) : null,
      doctorName: String(b.doctorName || b.doctor_name || ''),
      service: String(b.service || ''),
      date: String(b.date || ''),
      time: String(b.time || ''),
      status: String(b.status || 'confirmed'),
      bookingType: String(b.bookingType || b.booking_type || 'cash'),
      contractingCompanyId:
        b.contractingCompanyId != null
          ? Number(b.contractingCompanyId)
          : b.contracting_company_id != null
            ? Number(b.contracting_company_id)
            : null,
      paymentMethod: b.paymentMethod ? String(b.paymentMethod) : null,
      paymentStatus: b.paymentStatus ? String(b.paymentStatus) : null,
      notes: b.notes ? String(b.notes) : null,
      createdAt: String(b.createdAt || ''),
    }));
  }, [rawBookings, allBookings]);

  const normalizedOperations: AnalyticsOperationRecord[] = useMemo(
    () =>
      (operations || []).map((o) => ({
        id: String(o.dbId || o.id || ''),
        patientName: String(o.patientName || o.patient_name || ''),
        patientPhone: String(o.patientPhone || o.patient_phone || ''),
        doctorName: String(o.doctorName || o.doctor_name || ''),
        surgeryType: String(o.surgeryType || o.surgery_type || ''),
        date: String(o.date || ''),
        cost: Number(o.cost || 0),
        status: String(o.status || 'pending'),
        contractingCompanyId:
          (o.contractingCompanyId ?? o.contracting_company_id) != null
            ? Number(o.contractingCompanyId ?? o.contracting_company_id)
            : null,
      })),
    [operations],
  );

  const normalizedPayments: AnalyticsPaymentRecord[] = useMemo(
    () =>
      (rawPayments || []).map((p) => ({
        id: String(p.id ?? ''),
        bookingId: p.booking_id ? String(p.booking_id) : p.bookingId ? String(p.bookingId) : null,
        amount: Number(p.amount || 0),
        status: String(p.status || 'pending'),
        paymentType: String(p.payment_type || p.paymentType || 'wallet'),
        createdAt: String(p.created_at || p.createdAt || ''),
      })),
    [rawPayments],
  );

  const orgNameMap = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations],
  );

  // Sync deduplicated contract renewal alerts when contracts load
  useEffect(() => {
    if (contracts.length === 0) return;
    if (!(perm('partners_view') || perm('partners_view_contracts') || perm('partners_manage_renewal_alerts'))) {
      return;
    }
    void syncContractRenewalAlerts({
      contracts,
      organizations,
      alertSettings,
      existingLogs: alertLogs,
      onLocalNotify: onNotify,
    }).then((created) => {
      if (created.length > 0) void reloadAll();
    });
  }, [contracts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dashboard Summary
  const dashboardSummary = useMemo(
    () =>
      computePartnersDashboardSummary({
        organizations,
        contracts,
        activities,
        followups,
        bookings: normalizedBookings,
        operations: normalizedOperations,
        payments: normalizedPayments,
        doctors,
        services,
        autoExpiringDays: alertSettings.autoMarkExpiringDays,
      }),
    [
      organizations,
      contracts,
      activities,
      followups,
      normalizedBookings,
      normalizedOperations,
      normalizedPayments,
      doctors,
      services,
      alertSettings.autoMarkExpiringDays,
    ],
  );

  const pendingAlertsPreview = useMemo(
    () => evaluateContractAlerts(contracts, organizations, alertSettings, []),
    [contracts, organizations, alertSettings],
  );

  // ==================== B. Organizations State ====================
  const [orgSearch, setOrgSearch] = useState('');
  const [orgFilterType, setOrgFilterType] = useState('');
  const [orgFilterStatus, setOrgFilterStatus] = useState('');
  const [orgFilterGov, setOrgFilterGov] = useState('');
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [orgForm, setOrgForm] = useState<OrgFormState>(EMPTY_ORG_FORM);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [savingOrg, setSavingOrg] = useState(false);
  const [deletingOrgId, setDeletingOrgId] = useState<number | null>(null);
  const [profileOrg, setProfileOrg] = useState<PartnerOrganization | null>(null);

  const uniqueGovernorates = useMemo(
    () => [...new Set(organizations.map((o) => o.governorate).filter(Boolean))].sort(),
    [organizations],
  );

  const filteredOrganizations = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    return organizations.filter((o) => {
      if (orgFilterType && o.orgType !== orgFilterType) return false;
      if (orgFilterStatus && o.relationshipStatus !== orgFilterStatus) return false;
      if (orgFilterGov && o.governorate !== orgFilterGov) return false;
      if (q) {
        const hay = [
          o.name,
          o.phone,
          o.managerName,
          o.managerPhone,
          o.email,
          o.governorate,
          o.city,
          o.sector,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [organizations, orgSearch, orgFilterType, orgFilterStatus, orgFilterGov]);

  const openAddOrg = () => {
    setEditingOrgId(null);
    setOrgForm(EMPTY_ORG_FORM);
    setOrgError(null);
    setOrgModalOpen(true);
  };

  const openEditOrg = (org: PartnerOrganization) => {
    setEditingOrgId(org.id);
    setOrgForm({
      name: org.name,
      orgType: org.orgType || 'شركة تأمين',
      sector: org.sector || '',
      governorate: org.governorate || '',
      city: org.city || '',
      address: org.address || '',
      phone: org.phone || '',
      email: org.email || '',
      website: org.website || '',
      managerName: org.managerName || '',
      contactTitle: org.contactTitle || '',
      managerPhone: org.managerPhone || '',
      contactEmail: org.contactEmail || '',
      cooperationStartDate: org.cooperationStartDate || '',
      relationshipStatus: org.relationshipStatus || 'نشط',
      assignedStaffId: org.assignedStaffId || '',
      assignedStaffName: org.assignedStaffName || '',
      adminNotes: org.adminNotes || '',
      isActive: org.isActive,
      documents: org.documents || [],
      newDoc: '',
    });
    setOrgError(null);
    setOrgModalOpen(true);
  };

  const handleSaveOrg = async () => {
    setSavingOrg(true);
    setOrgError(null);
    const res = await savePartnerOrganization(
      {
        name: orgForm.name.trim(),
        documents: orgForm.documents,
        managerName: orgForm.managerName.trim() || undefined,
        managerPhone: orgForm.managerPhone.trim() || undefined,
        orgType: orgForm.orgType,
        sector: orgForm.sector.trim(),
        governorate: orgForm.governorate.trim(),
        city: orgForm.city.trim(),
        address: orgForm.address.trim(),
        phone: orgForm.phone.trim(),
        email: orgForm.email.trim(),
        website: orgForm.website.trim(),
        contactTitle: orgForm.contactTitle.trim(),
        contactEmail: orgForm.contactEmail.trim(),
        cooperationStartDate: orgForm.cooperationStartDate,
        relationshipStatus: orgForm.relationshipStatus,
        assignedStaffId: orgForm.assignedStaffId,
        assignedStaffName: orgForm.assignedStaffName,
        adminNotes: orgForm.adminNotes.trim(),
        isActive: orgForm.isActive,
      },
      organizations,
      editingOrgId,
      currentUser.name,
      currentUserUuid,
    );
    setSavingOrg(false);
    if (res.error) {
      setOrgError(res.error);
      return;
    }
    toast.success(editingOrgId ? 'تم تحديث بيانات الجهة بنجاح' : 'تم إضافة الجهة المتعاقدة بنجاح');
    setOrgModalOpen(false);
    window.dispatchEvent(new Event(CONTRACTING_CHANGED_EVENT));
    await reloadAll();
  };

  const confirmDeleteOrg = async () => {
    if (!deletingOrgId) return;
    const target = organizations.find((o) => o.id === deletingOrgId);
    const res = await deletePartnerOrganizationRecord(
      deletingOrgId,
      target?.name || String(deletingOrgId),
      currentUser.name,
      currentUserUuid,
    );
    if (res.error) {
      toast.error(res.error || 'تعذر حذف الجهة المتعاقدة');
      return;
    }
    toast.success('تم حذف الجهة بنجاح');
    setDeletingOrgId(null);
    window.dispatchEvent(new Event(CONTRACTING_CHANGED_EVENT));
    await reloadAll();
  };

  // ==================== C. Contacts State ====================
  const [contactOrgFilter, setContactOrgFilter] = useState<string>('');
  const [showArchivedContacts, setShowArchivedContacts] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({
    companyId: '',
    name: '',
    jobTitle: '',
    phone: '',
    email: '',
    department: '',
    importanceLevel: 'normal' as ContactImportance,
    communicationStatus: 'active' as ContactCommunicationStatus,
    isPrimary: false,
    notes: '',
  });

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (!showArchivedContacts && c.isArchived) return false;
      if (contactOrgFilter && String(c.companyId) !== contactOrgFilter) return false;
      return true;
    });
  }, [contacts, contactOrgFilter, showArchivedContacts]);

  const handleSaveContact = async () => {
    if (!contactForm.companyId || !contactForm.name.trim()) {
      toast.error('يرجى اختيار الجهة وإدخال اسم مسؤول التواصل');
      return;
    }
    const companyId = Number(contactForm.companyId);
    const res = await savePartnerContact({
      editingId: editingContactId,
      companyId,
      orgName: orgNameMap.get(companyId) || '',
      name: contactForm.name,
      jobTitle: contactForm.jobTitle,
      phone: contactForm.phone,
      email: contactForm.email,
      department: contactForm.department,
      importanceLevel: contactForm.importanceLevel,
      communicationStatus: contactForm.communicationStatus,
      isPrimary: contactForm.isPrimary,
      notes: contactForm.notes,
      actorName: currentUser.name,
      actorUserId: currentUserUuid,
    });

    if (res.error) {
      toast.error(res.error || 'تعذر حفظ بيانات مسؤول التواصل');
      return;
    }

    toast.success('تم حفظ بيانات مسؤول التواصل');
    setContactFormOpen(false);
    setEditingContactId(null);
    await reloadAll();
  };

  // ==================== D. Activities (Visits & Meetings) State ====================
  const [actSearch, setActSearch] = useState('');
  const [actFilterOrg, setActFilterOrg] = useState('');
  const [actFilterType, setActFilterType] = useState('');
  const [actFormOpen, setActFormOpen] = useState(false);
  const [editingActId, setEditingActId] = useState<string | null>(null);
  const [actUploading, setActUploading] = useState(false);
  const [actForm, setActForm] = useState({
    companyId: '',
    contactId: '',
    contactName: '',
    activityType: 'visit' as PartnerActivityType,
    activityDate: cairoTodayIso(),
    activityTime: '',
    staffUserId: currentUserUuid || '',
    staffName: currentUser.name,
    goal: '',
    summary: '',
    outcomes: '',
    agreements: '',
    nextSteps: '',
    nextFollowupDate: '',
    followupStatus: 'pending' as ActivityFollowupStatus,
    attachments: [] as PartnerAttachment[],
    createAutoFollowup: true,
  });

  const filteredActivities = useMemo(() => {
    const q = actSearch.trim().toLowerCase();
    return activities.filter((a) => {
      if (actFilterOrg && String(a.companyId) !== actFilterOrg) return false;
      if (actFilterType && a.activityType !== actFilterType) return false;
      if (q) {
        const hay = [
          orgNameMap.get(a.companyId),
          a.goal,
          a.summary,
          a.outcomes,
          a.staffName,
          a.contactName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activities, actFilterOrg, actFilterType, actSearch, orgNameMap]);

  const handleSaveActivity = async () => {
    if (!actForm.companyId || !actForm.goal.trim() || !actForm.activityDate) {
      toast.error('يرجى تحديد الجهة والتاريخ والهدف من الزيارة/الاجتماع');
      return;
    }
    const companyId = Number(actForm.companyId);
    const contactObj = contacts.find((c) => c.id === actForm.contactId);
    const res = await savePartnerActivity({
      editingId: editingActId,
      companyId,
      orgName: orgNameMap.get(companyId) || '',
      contactId: actForm.contactId || null,
      contactName: contactObj?.name || actForm.contactName.trim(),
      activityType: actForm.activityType,
      activityTypeLabel: ACTIVITY_TYPE_LABELS[actForm.activityType],
      activityDate: actForm.activityDate,
      activityTime: actForm.activityTime,
      staffUserId: actForm.staffUserId,
      staffName: actForm.staffName,
      goal: actForm.goal,
      summary: actForm.summary,
      outcomes: actForm.outcomes,
      agreements: actForm.agreements,
      nextSteps: actForm.nextSteps,
      nextFollowupDate: actForm.nextFollowupDate,
      followupStatus: actForm.followupStatus,
      attachments: actForm.attachments,
      createAutoFollowup: actForm.createAutoFollowup,
      canCreateFollowup: perm('partners_create_followups'),
      actorName: currentUser.name,
      actorUserId: currentUserUuid,
    });

    if (res.error) {
      toast.error(res.error || 'تعذر حفظ سجل الزيارة/الاجتماع');
      return;
    }

    toast.success('تم حفظ النشاط بنجاح');
    setActFormOpen(false);
    setEditingActId(null);
    await reloadAll();
  };

  // ==================== E. Contracts & Renewals State ====================
  const [contractFilterOrg, setContractFilterOrg] = useState('');
  const [contractFilterStatus, setContractFilterStatus] = useState('');
  const [showHistoricalContracts, setShowHistoricalContracts] = useState(false);
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [contractUploading, setContractUploading] = useState(false);
  const [contractForm, setContractForm] = useState({
    companyId: '',
    contractNumber: '',
    contractType: 'سنوي',
    signedDate: '',
    startDate: cairoTodayIso(),
    endDate: '',
    durationMonths: '12',
    status: 'نشط' as ContractStatus,
    terms: '',
    discountTerms: '',
    responsibleStaffId: currentUserUuid || '',
    responsibleStaffName: currentUser.name,
    nextRenewalDate: '',
    notes: '',
    attachmentPath: '',
    attachmentName: '',
  });
  const [renewTarget, setRenewTarget] = useState<PartnerContract | null>(null);
  const [renewFields, setRenewFields] = useState({
    newContractNumber: '',
    newStartDate: cairoTodayIso(),
    newEndDate: '',
    nextRenewalDate: '',
    renewalNotes: '',
  });
  const [renewSaving, setRenewSaving] = useState(false);

  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      if (!showHistoricalContracts && !c.isCurrentVersion) return false;
      if (contractFilterOrg && String(c.companyId) !== contractFilterOrg) return false;
      const eff = computeContractEffectiveStatus(c, alertSettings.autoMarkExpiringDays).effectiveStatus;
      if (contractFilterStatus && eff !== contractFilterStatus && c.status !== contractFilterStatus) {
        return false;
      }
      return true;
    });
  }, [contracts, showHistoricalContracts, contractFilterOrg, contractFilterStatus, alertSettings.autoMarkExpiringDays]);

  const handleSaveContract = async () => {
    if (!contractForm.companyId || !contractForm.contractNumber.trim() || !contractForm.startDate || !contractForm.endDate) {
      toast.error('يرجى إدخال الجهة ورقم العقد وتاريخ البداية والانتهاء');
      return;
    }
    if (contractForm.endDate < contractForm.startDate) {
      toast.error('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
      return;
    }
    const companyId = Number(contractForm.companyId);
    const res = await savePartnerContract({
      editingId: editingContractId,
      companyId,
      orgName: orgNameMap.get(companyId) || '',
      contractNumber: contractForm.contractNumber,
      contractType: contractForm.contractType,
      signedDate: contractForm.signedDate,
      startDate: contractForm.startDate,
      endDate: contractForm.endDate,
      durationMonths: contractForm.durationMonths ? Number(contractForm.durationMonths) : null,
      status: contractForm.status,
      terms: contractForm.terms,
      discountTerms: contractForm.discountTerms,
      responsibleStaffId: contractForm.responsibleStaffId,
      responsibleStaffName: contractForm.responsibleStaffName,
      nextRenewalDate: contractForm.nextRenewalDate,
      notes: contractForm.notes,
      attachmentPath: contractForm.attachmentPath,
      attachmentName: contractForm.attachmentName,
      actorName: currentUser.name,
      actorUserId: currentUserUuid,
    });

    if (res.error) {
      toast.error(res.error || 'تعذر حفظ العقد');
      return;
    }

    toast.success('تم حفظ العقد بنجاح');
    setContractFormOpen(false);
    setEditingContractId(null);
    await reloadAll();
  };

  const handleConfirmRenew = async () => {
    if (!renewTarget) return;
    setRenewSaving(true);
    const res = await renewPartnerContract({
      previousContract: renewTarget,
      newContractNumber: renewFields.newContractNumber,
      newStartDate: renewFields.newStartDate,
      newEndDate: renewFields.newEndDate,
      nextRenewalDate: renewFields.nextRenewalDate,
      renewalNotes: renewFields.renewalNotes,
      actorUserId: currentUserUuid,
      actorName: currentUser.name,
    });
    setRenewSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('تم تجديد العقد وحفظ النسخة التاريخية بنجاح');
    setRenewTarget(null);
    await reloadAll();
  };

  // ==================== F & G. Referrals & Revenue Filters ====================
  const [analyticsOrgId, setAnalyticsOrgId] = useState('');
  const [analyticsDateFrom, setAnalyticsDateFrom] = useState('');
  const [analyticsDateTo, setAnalyticsDateTo] = useState('');
  const [analyticsMonth, setAnalyticsMonth] = useState('');
  const [analyticsYear, setAnalyticsYear] = useState('');
  const [analyticsDoctor, setAnalyticsDoctor] = useState('');
  const [analyticsStatus, setAnalyticsStatus] = useState('');

  const analyticsFilterObj = useMemo(
    () => ({
      companyId: analyticsOrgId ? Number(analyticsOrgId) : null,
      dateFrom: analyticsDateFrom || undefined,
      dateTo: analyticsDateTo || undefined,
      month: analyticsMonth || undefined,
      year: analyticsYear || undefined,
      doctorName: analyticsDoctor || undefined,
      status: analyticsStatus || undefined,
    }),
    [
      analyticsOrgId,
      analyticsDateFrom,
      analyticsDateTo,
      analyticsMonth,
      analyticsYear,
      analyticsDoctor,
      analyticsStatus,
    ],
  );

  const overallReferrals = useMemo(
    () =>
      computePartnerReferrals(
        analyticsFilterObj.companyId,
        normalizedBookings,
        normalizedOperations,
        analyticsFilterObj,
      ),
    [analyticsFilterObj, normalizedBookings, normalizedOperations],
  );

  const perOrgReferrals = useMemo(() => {
    return organizations
      .filter((o) => !analyticsOrgId || String(o.id) === analyticsOrgId)
      .map((org) => ({
        org,
        stats: computePartnerReferrals(org.id, normalizedBookings, normalizedOperations, analyticsFilterObj),
      }))
      .sort((a, b) => b.stats.uniquePatients - a.stats.uniquePatients);
  }, [organizations, analyticsOrgId, normalizedBookings, normalizedOperations, analyticsFilterObj]);

  const overallRevenue = useMemo(
    () =>
      computePartnerRevenue(
        analyticsFilterObj.companyId,
        normalizedBookings,
        normalizedOperations,
        normalizedPayments,
        doctors,
        services,
        analyticsFilterObj,
      ),
    [
      analyticsFilterObj,
      normalizedBookings,
      normalizedOperations,
      normalizedPayments,
      doctors,
      services,
    ],
  );

  const perOrgRevenue = useMemo(() => {
    return organizations
      .filter((o) => !analyticsOrgId || String(o.id) === analyticsOrgId)
      .map((org) => ({
        org,
        rev: computePartnerRevenue(
          org.id,
          normalizedBookings,
          normalizedOperations,
          normalizedPayments,
          doctors,
          services,
          analyticsFilterObj,
        ),
        ref: computePartnerReferrals(org.id, normalizedBookings, normalizedOperations, analyticsFilterObj),
      }))
      .sort((a, b) => b.rev.collectedAmount - a.rev.collectedAmount);
  }, [
    organizations,
    analyticsOrgId,
    normalizedBookings,
    normalizedOperations,
    normalizedPayments,
    doctors,
    services,
    analyticsFilterObj,
  ]);

  // ==================== H. Follow-ups & Alert Settings State ====================
  const [followupFilterStatus, setFollowupFilterStatus] = useState('');
  const [followupFilterOrg, setFollowupFilterOrg] = useState('');
  const [followupFormOpen, setFollowupFormOpen] = useState(false);
  const [editingFollowupId, setEditingFollowupId] = useState<string | null>(null);
  const [followupForm, setFollowupForm] = useState({
    companyId: '',
    title: '',
    assigneeUserId: currentUserUuid || '',
    assigneeName: currentUser.name,
    dueDate: cairoTodayIso(),
    followupType: 'متابعة عامة',
    priority: 'medium' as FollowupPriority,
    description: '',
    status: 'جديدة' as FollowupTaskStatus,
    outcome: '',
  });
  const [alertSettingsDraft, setAlertSettingsDraft] =
    useState<PartnerAlertSettings>(DEFAULT_ALERT_SETTINGS);
  useEffect(() => {
    setAlertSettingsDraft(alertSettings);
  }, [alertSettings]);

  const todayIso = cairoTodayIso();
  const filteredFollowups = useMemo(() => {
    return followups.filter((f) => {
      if (followupFilterOrg && String(f.companyId) !== followupFilterOrg) return false;
      if (followupFilterStatus) {
        if (followupFilterStatus === '__overdue__') {
          if (f.status === 'مكتملة' || f.status === 'ملغاة' || f.dueDate >= todayIso) return false;
        } else if (f.status !== followupFilterStatus) {
          return false;
        }
      }
      return true;
    });
  }, [followups, followupFilterOrg, followupFilterStatus, todayIso]);

  const handleSaveFollowup = async () => {
    if (!followupForm.companyId || !followupForm.title.trim() || !followupForm.dueDate) {
      toast.error('يرجى تحديد الجهة وعنوان المهمة وتاريخ الاستحقاق');
      return;
    }
    const companyId = Number(followupForm.companyId);
    const res = await savePartnerFollowup({
      editingId: editingFollowupId,
      companyId,
      title: followupForm.title,
      assigneeUserId: followupForm.assigneeUserId,
      assigneeName: followupForm.assigneeName,
      dueDate: followupForm.dueDate,
      followupType: followupForm.followupType,
      priority: followupForm.priority,
      description: followupForm.description,
      status: followupForm.status,
      outcome: followupForm.outcome,
      actorName: currentUser.name,
      actorUserId: currentUserUuid,
    });

    if (res.error) {
      toast.error(res.error || 'تعذر حفظ مهمة المتابعة');
      return;
    }

    toast.success('تم حفظ مهمة المتابعة');
    setFollowupFormOpen(false);
    setEditingFollowupId(null);
    await reloadAll();
  };

  const handleSaveAlertSettings = async () => {
    const res = await savePartnerAlertSettings(alertSettingsDraft, currentUserUuid);
    if (res.error || !res.saved) {
      toast.error(res.error || 'تعذر حفظ إعدادات التنبيهات');
      return;
    }
    setAlertSettings(res.saved);
    setAlertSettingsDraft(res.saved);
    await recordPartnerAudit({
      actorUserId: currentUserUuid,
      actorName: currentUser.name,
      actionType: 'alert_settings_updated',
      entityType: 'partner_alert_settings',
      summary: `تحديث فترات تنبيهات تجديد العقود: [${res.saved.alertDays.join(', ')}] يوم`,
    });
    toast.success('تم حفظ إعدادات التنبيهات بنجاح');
    await reloadAll();
  };

  const handleRunAlertsCheck = async () => {
    const created = await syncContractRenewalAlerts({
      contracts,
      organizations,
      alertSettings,
      existingLogs: alertLogs,
      onLocalNotify: onNotify,
    });
    if (created.length === 0) {
      toast.info('لا توجد تنبيهات تجديد جديدة غير مُرسلة لهذا اليوم');
    } else {
      toast.success(`تم إصدار ${created.length} تنبيه تجديد وإضافتها لجرس الإشعارات`);
      await reloadAll();
    }
  };

  // ==================== I. Export & Print Handlers ====================
  const triggerCsvDownload = async (
    filename: string,
    headers: string[],
    rows: unknown[][],
    reportLabel: string,
  ) => {
    if (!perm('partners_export_reports')) {
      toast.error('ليس لديك صلاحية تصدير التقارير');
      return;
    }
    const csv = buildCsvContent(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${cairoTodayIso()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await recordPartnerAudit({
      actorUserId: currentUserUuid,
      actorName: currentUser.name,
      actionType: 'report_exported',
      entityType: 'report',
      summary: `تصدير تقرير CSV: ${reportLabel}`,
    });
    await reloadAll();
  };

  const handlePrintTableReport = async (title: string, headers: string[], rows: string[][]) => {
    if (!perm('partners_export_reports') && currentUser.role !== 'admin') {
      toast.error('ليس لديك صلاحية طباعة التقارير');
      return;
    }
    const html = `
      <table>
        <thead><tr>${headers.map((h) => `<th>${DOMPurify.sanitize(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr>${r.map((c) => `<td>${DOMPurify.sanitize(String(c ?? ''))}</td>`).join('')}</tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
    onPrint(title, html);
    await recordPartnerAudit({
      actorUserId: currentUserUuid,
      actorName: currentUser.name,
      actionType: 'report_printed',
      entityType: 'report',
      summary: `طباعة تقرير: ${title}`,
    });
  };

  const handleOpenAttachment = async (path: string) => {
    const url = await openPartnerDocument(path);
    if (!url) {
      toast.error('تعذر فتح المستند أو ليست لديك صلاحية العرض');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      {/* Header & Navigation Bar */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#087F8C] to-[#1769AA] text-white flex items-center justify-center shadow-sm">
              <Handshake size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#172B3A]">شركاء النجاح</h2>
              <p className="text-xs text-[#718394] font-medium">
                الإدارة المتكاملة للجهات المتعاقدة، العقود، الزيارات، المرضى المحولين، الإيرادات وتنبيهات التجديد
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingAlertsPreview.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('followups')}
                className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-black flex items-center gap-1.5 cursor-pointer hover:bg-amber-100"
              >
                <AlertTriangle size={14} />
                <span className="fv-num">{pendingAlertsPreview.length}</span> عقد يحتاج متابعة/تجديد
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              disabled={loading || refreshing}
              className="px-3.5 py-2 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0] text-[#172B3A] text-xs font-bold flex items-center gap-1.5 hover:border-[#087F8C] disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw size={14} className={loading || refreshing ? 'animate-spin text-[#087F8C]' : 'text-[#087F8C]'} />
              تحديث
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? 'bg-[#087F8C] text-white shadow-xs'
                    : 'bg-[#F5FAFC] border border-[#DFEAF0] text-[#718394] hover:text-[#172B3A] hover:border-[#25B8C7]'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ==================== 1. DASHBOARD & CHARTS ==================== */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <StatCard
              label="إجمالي الجهات المتعاقدة"
              value={dashboardSummary.kpis.totalOrganizations}
              icon={Building2}
              color="bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20"
              sub={`نشط: ${dashboardSummary.kpis.activeOrganizations}`}
            />
            <StatCard
              label="التعاقدات النشطة"
              value={dashboardSummary.kpis.activeOrganizations}
              icon={CheckCircle}
              color="bg-emerald-50 text-emerald-700 border border-emerald-200/80"
              sub={`جديدة هذا الشهر: ${dashboardSummary.kpis.newOrganizationsThisMonth}`}
            />
            <StatCard
              label="عقود قريبة الانتهاء"
              value={dashboardSummary.kpis.expiringSoonContracts}
              icon={Clock}
              color="bg-amber-50 text-amber-700 border border-amber-200/80"
              sub={`منتهية: ${dashboardSummary.kpis.expiredContracts}`}
            />
            <StatCard
              label="الزيارات والاجتماعات (الشهر)"
              value={dashboardSummary.kpis.activitiesThisMonth}
              icon={Handshake}
              color="bg-[#1769AA]/10 text-[#1769AA] border border-[#1769AA]/20"
              sub={`إجمالي الأنشطة: ${activities.length}`}
            />
            <StatCard
              label="المرضى المحولون"
              value={dashboardSummary.kpis.totalReferredPatients}
              icon={Users}
              color="bg-indigo-50 text-indigo-700 border border-indigo-200/80"
              sub={`حجوزات: ${dashboardSummary.kpis.totalPartnerBookings}`}
            />
            <StatCard
              label="العمليات من التعاقدات"
              value={dashboardSummary.kpis.totalPartnerSurgeries}
              icon={Scissors}
              color="bg-teal-50 text-teal-700 border border-teal-200/80"
              sub="عمليات مؤكدة وقيد التنفيذ"
            />
            {perm('partners_view_revenue') ? (
              <StatCard
                label="إجمالي الإيرادات المحصلة"
                value={`${dashboardSummary.kpis.totalPartnerRevenue.toLocaleString('ar-EG')} ج.م`}
                icon={Banknote}
                color="bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                sub="من الكشوفات والعمليات"
              />
            ) : (
              <StatCard
                label="إجمالي العقود السارية"
                value={contracts.filter((c) => c.isCurrentVersion).length}
                icon={FileText}
                color="bg-slate-100 text-slate-700 border border-slate-200"
              />
            )}
            <StatCard
              label="مهام المتابعة المتأخرة"
              value={dashboardSummary.kpis.overdueFollowups}
              icon={AlertTriangle}
              color={
                dashboardSummary.kpis.overdueFollowups > 0
                  ? 'bg-red-50 text-red-600 border border-red-200/80'
                  : 'bg-[#F5FAFC] text-[#718394] border border-[#DFEAF0]'
              }
              sub={`مفتوحة حالياً: ${dashboardSummary.kpis.openFollowups}`}
            />
          </div>

          {/* Analytical Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={cardClass}>
              <h3 className="text-sm font-black text-[#172B3A] mb-4 flex items-center gap-2">
                <Users size={16} className="text-[#087F8C]" /> أكثر الجهات تحويلاً للمرضى
              </h3>
              <HorizontalRankList
                items={dashboardSummary.topByPatients
                  .filter((x) => x.uniquePatients > 0)
                  .map((x) => ({
                    label: x.name,
                    value: x.uniquePatients,
                    sub: `${x.totalBookings} حجز • ${x.totalSurgeries} عملية`,
                  }))}
                unit="مريض"
              />
            </div>

            {perm('partners_view_revenue') ? (
              <div className={cardClass}>
                <h3 className="text-sm font-black text-[#172B3A] mb-4 flex items-center gap-2">
                  <Banknote size={16} className="text-emerald-600" /> أعلى الجهات من حيث الإيرادات
                </h3>
                <HorizontalRankList
                  items={dashboardSummary.topByRevenue
                    .filter((x) => x.collectedRevenue > 0)
                    .map((x) => ({
                      label: x.name,
                      value: x.collectedRevenue,
                    }))}
                  unit="ج.م"
                />
              </div>
            ) : (
              <div className={cardClass}>
                <h3 className="text-sm font-black text-[#172B3A] mb-4 flex items-center gap-2">
                  <MapPin size={16} className="text-[#087F8C]" /> توزيع الجهات حسب المحافظة
                </h3>
                <HorizontalRankList
                  items={Object.entries(dashboardSummary.governorateDistribution)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 6)
                    .map(([label, value]) => ({ label, value }))}
                  unit="جهة"
                />
              </div>
            )}

            <div className={cardClass}>
              <h3 className="text-sm font-black text-[#172B3A] mb-2 flex items-center gap-2">
                <Handshake size={16} className="text-[#1769AA]" /> الزيارات والاجتماعات الشهرية
              </h3>
              <MiniBar
                data={dashboardSummary.monthlyActivities.map((m) => ({
                  label: m.month.slice(2),
                  value: m.count,
                }))}
                maxVal={Math.max(...dashboardSummary.monthlyActivities.map((m) => m.count), 1)}
                barClass="from-[#1769AA] to-[#25B8C7]"
              />
            </div>

            <div className={cardClass}>
              <h3 className="text-sm font-black text-[#172B3A] mb-2 flex items-center gap-2">
                <TrendingUp size={16} className="text-[#087F8C]" /> اتجاه المرضى المحولين شهرياً
              </h3>
              <MiniBar
                data={dashboardSummary.monthlyReferrals.map((m) => ({
                  label: m.month.slice(2),
                  value: m.patients,
                }))}
                maxVal={Math.max(...dashboardSummary.monthlyReferrals.map((m) => m.patients), 1)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={cardClass}>
              <h3 className="text-sm font-black text-[#172B3A] mb-4 flex items-center gap-2">
                <FileText size={16} className="text-[#087F8C]" /> توزيع حالات العقود
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {CONTRACT_STATUS_OPTIONS.map((st) => (
                  <div
                    key={st}
                    className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-3 text-center"
                  >
                    <p className="text-[11px] font-bold text-[#718394]">{st}</p>
                    <p className="text-lg font-black text-[#172B3A] fv-num mt-0.5">
                      {dashboardSummary.contractStatusDistribution[st] || 0}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className={cardClass}>
              <h3 className="text-sm font-black text-[#172B3A] mb-4 flex items-center gap-2">
                <Building2 size={16} className="text-[#087F8C]" /> توزيع الجهات حسب النوع
              </h3>
              <HorizontalRankList
                items={Object.entries(dashboardSummary.orgTypeDistribution)
                  .sort(([, a], [, b]) => b - a)
                  .map(([label, value]) => ({ label, value }))}
                unit="جهة"
              />
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. ORGANIZATIONS DATABASE ==================== */}
      {activeTab === 'organizations' && (
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h3 className="text-lg font-black text-[#172B3A] flex items-center gap-2">
                <Building2 size={19} className="text-[#087F8C]" /> قاعدة بيانات الجهات المتعاقدة (
                <span className="fv-num">{filteredOrganizations.length}</span>)
              </h3>
              {perm('partners_create_organizations') && (
                <button
                  type="button"
                  onClick={openAddOrg}
                  className="fv-btn-primary text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <Plus size={16} /> إضافة جهة متعاقدة
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <div className="relative">
                <Search className="absolute right-3 top-3 text-[#718394]" size={16} />
                <input
                  type="text"
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  className={`${inputClass} pr-9`}
                  placeholder="بحث بالاسم، الهاتف، المسؤول..."
                />
              </div>
              <select
                value={orgFilterType}
                onChange={(e) => setOrgFilterType(e.target.value)}
                className={inputClass}
              >
                <option value="">جميع أنواع الجهات</option>
                {ORG_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                value={orgFilterStatus}
                onChange={(e) => setOrgFilterStatus(e.target.value)}
                className={inputClass}
              >
                <option value="">جميع حالات العلاقة</option>
                {RELATIONSHIP_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={orgFilterGov}
                onChange={(e) => setOrgFilterGov(e.target.value)}
                className={inputClass}
              >
                <option value="">جميع المحافظات</option>
                {uniqueGovernorates.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {filteredOrganizations.length === 0 ? (
              <div className="text-center py-12 text-[#718394] font-bold">
                لا توجد جهات مطابقة لمعايير البحث
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredOrganizations.map((org) => {
                  const orgRef = computePartnerReferrals(
                    org.id,
                    normalizedBookings,
                    normalizedOperations,
                  );
                  const currentContract = contracts.find(
                    (c) => c.companyId === org.id && c.isCurrentVersion,
                  );
                  const contractEff = currentContract
                    ? computeContractEffectiveStatus(
                        currentContract,
                        alertSettings.autoMarkExpiringDays,
                      )
                    : null;
                  return (
                    <div
                      key={org.id}
                      className="bg-[#F5FAFC] rounded-2xl p-5 border border-[#DFEAF0] hover:border-[#25B8C7]/60 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-black text-base text-[#172B3A]">{org.name}</h4>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-[#DFEAF0] text-[#087F8C] font-bold">
                              {org.orgType || 'شركة تأمين'}
                            </span>
                          </div>
                          <p className="text-xs text-[#718394] mt-0.5">
                            {[org.sector, org.governorate, org.city].filter(Boolean).join(' • ') ||
                              'بدون تفاصيل قطاع/منطقة'}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border shrink-0 ${
                            org.relationshipStatus === 'نشط'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : org.relationshipStatus === 'قيد التفاوض'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {org.relationshipStatus}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-white p-3 rounded-xl border border-[#DFEAF0] mb-3">
                        <div className="flex items-center gap-1.5 text-[#172B3A] font-bold">
                          <User size={13} className="text-[#087F8C]" />
                          {org.managerName || 'مسؤول غير محدد'}
                        </div>
                        <div className="flex items-center gap-1.5 text-[#718394] fv-num" dir="ltr">
                          <Phone size={13} className="text-[#087F8C]" />
                          {org.managerPhone || org.phone || '—'}
                        </div>
                        <div className="text-[11px] text-[#718394] fv-num">
                          المرضى المحولون: <strong className="text-[#172B3A]">{orgRef.uniquePatients}</strong>
                        </div>
                        <div className="text-[11px] text-[#718394] fv-num">
                          العقد الحالي:{' '}
                          <strong className="text-[#087F8C]">
                            {contractEff ? contractEff.effectiveStatus : 'غير مسجل'}
                          </strong>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#DFEAF0]/80">
                        <button
                          type="button"
                          onClick={() => setProfileOrg(org)}
                          className="px-3 py-1.5 rounded-xl bg-white border border-[#DFEAF0] text-[#087F8C] text-xs font-bold flex items-center gap-1.5 hover:border-[#087F8C] cursor-pointer"
                        >
                          <Eye size={14} /> ملف الجهة الكامل
                        </button>
                        <div className="flex items-center gap-1.5">
                          {perm('partners_edit_organizations') && (
                            <button
                              type="button"
                              onClick={() => openEditOrg(org)}
                              className="p-2 rounded-lg bg-white border border-[#DFEAF0] text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                              title="تعديل"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          {perm('partners_delete_organizations') && (
                            <button
                              type="button"
                              onClick={() => setDeletingOrgId(org.id)}
                              className="p-2 rounded-lg bg-white border border-[#DFEAF0] text-red-600 hover:bg-red-50 cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== 3. CONTACTS ==================== */}
      {activeTab === 'contacts' && (
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h3 className="text-lg font-black text-[#172B3A] flex items-center gap-2">
              <Users size={19} className="text-[#087F8C]" /> مسؤولو التواصل بالجهات المتعاقدة
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={contactOrgFilter}
                onChange={(e) => setContactOrgFilter(e.target.value)}
                className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl px-3 py-2 text-xs font-bold text-[#172B3A]"
              >
                <option value="">كل الجهات</option>
                {organizations.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs font-bold text-[#718394] cursor-pointer px-2">
                <input
                  type="checkbox"
                  checked={showArchivedContacts}
                  onChange={(e) => setShowArchivedContacts(e.target.checked)}
                />
                عرض المؤرشفين
              </label>
              {perm('partners_manage_contacts') && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingContactId(null);
                    setContactForm({
                      companyId: contactOrgFilter || String(organizations[0]?.id || ''),
                      name: '',
                      jobTitle: '',
                      phone: '',
                      email: '',
                      department: '',
                      importanceLevel: 'normal',
                      communicationStatus: 'active',
                      isPrimary: false,
                      notes: '',
                    });
                    setContactFormOpen(true);
                  }}
                  className="fv-btn-primary text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={15} /> إضافة مسؤول تواصل
                </button>
              )}
            </div>
          </div>

          {contactFormOpen && (
            <div className="mb-6 bg-[#F5FAFC] p-5 rounded-2xl border border-[#DFEAF0] space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-sm text-[#172B3A]">
                  {editingContactId ? 'تعديل مسؤول تواصل' : 'إضافة مسؤول تواصل جديد'}
                </h4>
                <button
                  type="button"
                  onClick={() => setContactFormOpen(false)}
                  className="text-[#718394] hover:text-red-500 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الجهة *</label>
                  <select
                    value={contactForm.companyId}
                    onChange={(e) => setContactForm({ ...contactForm, companyId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">اختر الجهة...</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الاسم *</label>
                  <input
                    type="text"
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">المسمى الوظيفي</label>
                  <input
                    type="text"
                    value={contactForm.jobTitle}
                    onChange={(e) => setContactForm({ ...contactForm, jobTitle: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الإدارة / القسم</label>
                  <input
                    type="text"
                    value={contactForm.department}
                    onChange={(e) => setContactForm({ ...contactForm, department: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">رقم الهاتف</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    className={`${inputClass} fv-num text-right`}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">البريد الإلكتروني</label>
                  <input
                    type="email"
                    dir="ltr"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className={`${inputClass} fv-mono`}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">درجة الأهمية</label>
                  <select
                    value={contactForm.importanceLevel}
                    onChange={(e) =>
                      setContactForm({
                        ...contactForm,
                        importanceLevel: e.target.value as ContactImportance,
                      })
                    }
                    className={inputClass}
                  >
                    <option value="high">عالية (صانع قرار)</option>
                    <option value="normal">عادية</option>
                    <option value="low">منخفضة</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">حالة التواصل</label>
                  <select
                    value={contactForm.communicationStatus}
                    onChange={(e) =>
                      setContactForm({
                        ...contactForm,
                        communicationStatus: e.target.value as ContactCommunicationStatus,
                      })
                    }
                    className={inputClass}
                  >
                    <option value="active">تواصل نشط</option>
                    <option value="needs_followup">يحتاج متابعة</option>
                    <option value="inactive">غير نشط</option>
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-[#172B3A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={contactForm.isPrimary}
                      onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
                    />
                    تعيين كمسؤول تواصل رئيسي للجهة
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">ملاحظات</label>
                <input
                  type="text"
                  value={contactForm.notes}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveContact}
                  className="fv-btn-primary text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                >
                  حفظ المسؤول
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
            <table className="w-full text-sm text-right">
              <thead className="bg-[#F5FAFC] text-[#718394] text-xs font-bold border-b border-[#DFEAF0]">
                <tr>
                  <th className="p-3.5">المسؤول</th>
                  <th className="p-3.5">الجهة</th>
                  <th className="p-3.5">المسمى / القسم</th>
                  <th className="p-3.5">التواصل</th>
                  <th className="p-3.5">الأهمية والحالة</th>
                  <th className="p-3.5">آخر تواصل</th>
                  <th className="p-3.5 text-center">إدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFEAF0]/70">
                {filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-[#718394] font-bold">
                      لا يوجد مسؤولو تواصل مسجلون بعد
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map((c) => {
                    const linkedActCount = activities.filter((a) => a.contactId === c.id).length;
                    return (
                      <tr key={c.id} className="hover:bg-[#F5FAFC]">
                        <td className="p-3.5">
                          <div className="font-bold text-[#172B3A] flex items-center gap-1.5">
                            {c.name}
                            {c.isPrimary && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                                أساسي
                              </span>
                            )}
                            {c.isArchived && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                                مؤرشف
                              </span>
                            )}
                          </div>
                          {c.notes && <p className="text-[11px] text-[#718394] mt-0.5">{c.notes}</p>}
                        </td>
                        <td className="p-3.5 font-bold text-[#087F8C]">
                          {orgNameMap.get(c.companyId) || `#${c.companyId}`}
                        </td>
                        <td className="p-3.5 text-xs text-[#718394]">
                          {[c.jobTitle, c.department].filter(Boolean).join(' • ') || '—'}
                        </td>
                        <td className="p-3.5 text-xs">
                          <div className="fv-num font-bold text-[#172B3A]">{c.phone || '—'}</div>
                          <div className="fv-mono text-[11px] text-[#718394]">{c.email || ''}</div>
                        </td>
                        <td className="p-3.5 text-xs">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold ${
                              c.importanceLevel === 'high'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {c.importanceLevel === 'high'
                              ? 'أهمية عالية'
                              : c.importanceLevel === 'low'
                                ? 'منخفضة'
                                : 'عادية'}
                          </span>
                          <div className="text-[10px] text-[#718394] mt-1 fv-num">
                            {linkedActCount} أنشطة مرتبطة
                          </div>
                        </td>
                        <td className="p-3.5 text-xs fv-num text-[#718394]">
                          {c.lastContactAt ? c.lastContactAt.slice(0, 10) : '—'}
                        </td>
                        <td className="p-3.5 text-center">
                          {perm('partners_manage_contacts') && (
                            <div className="flex justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingContactId(c.id);
                                  setContactForm({
                                    companyId: String(c.companyId),
                                    name: c.name,
                                    jobTitle: c.jobTitle,
                                    phone: c.phone,
                                    email: c.email,
                                    department: c.department,
                                    importanceLevel: c.importanceLevel,
                                    communicationStatus: c.communicationStatus,
                                    isPrimary: c.isPrimary,
                                    notes: c.notes,
                                  });
                                  setContactFormOpen(true);
                                }}
                                className="p-1.5 rounded-lg bg-[#087F8C]/10 text-[#087F8C] hover:bg-[#087F8C]/20 cursor-pointer"
                                title="تعديل"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await toggleArchivePartnerContact(c);
                                  if (res.error) {
                                    toast.error(res.error);
                                    return;
                                  }
                                  toast.success(
                                    c.isArchived ? 'تم استعادة المسؤول' : 'تم أرشفة المسؤول مع الحفاظ على السجل',
                                  );
                                  await reloadAll();
                                }}
                                className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                                title={c.isArchived ? 'استعادة' : 'أرشفة'}
                              >
                                <Archive size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== 4. VISITS & MEETINGS ==================== */}
      {activeTab === 'activities' && (
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h3 className="text-lg font-black text-[#172B3A] flex items-center gap-2">
              <Handshake size={19} className="text-[#087F8C]" /> سجل الزيارات والاجتماعات والأنشطة (
              <span className="fv-num">{filteredActivities.length}</span>)
            </h3>
            {perm('partners_create_activities') && (
              <button
                type="button"
                onClick={() => {
                  setEditingActId(null);
                  setActForm({
                    companyId: actFilterOrg || String(organizations[0]?.id || ''),
                    contactId: '',
                    contactName: '',
                    activityType: 'visit',
                    activityDate: cairoTodayIso(),
                    activityTime: '',
                    staffUserId: currentUserUuid || '',
                    staffName: currentUser.name,
                    goal: '',
                    summary: '',
                    outcomes: '',
                    agreements: '',
                    nextSteps: '',
                    nextFollowupDate: '',
                    followupStatus: 'pending',
                    attachments: [],
                    createAutoFollowup: true,
                  });
                  setActFormOpen(true);
                }}
                className="fv-btn-primary text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={15} /> تسجيل زيارة / اجتماع
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="relative">
              <Search className="absolute right-3 top-3 text-[#718394]" size={16} />
              <input
                type="text"
                value={actSearch}
                onChange={(e) => setActSearch(e.target.value)}
                className={`${inputClass} pr-9`}
                placeholder="بحث في الهدف، الملخص، النتائج..."
              />
            </div>
            <select
              value={actFilterOrg}
              onChange={(e) => setActFilterOrg(e.target.value)}
              className={inputClass}
            >
              <option value="">كل الجهات</option>
              {organizations.map((o) => (
                <option key={o.id} value={String(o.id)}>
                  {o.name}
                </option>
              ))}
            </select>
            <select
              value={actFilterType}
              onChange={(e) => setActFilterType(e.target.value)}
              className={inputClass}
            >
              <option value="">كل أنواع الأنشطة</option>
              {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {actFormOpen && (
            <div className="mb-6 bg-[#F5FAFC] p-5 rounded-2xl border border-[#DFEAF0] space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-sm text-[#172B3A]">
                  {editingActId ? 'تعديل سجل الزيارة / الاجتماع' : 'تسجيل زيارة أو اجتماع جديد'}
                </h4>
                <button
                  type="button"
                  onClick={() => setActFormOpen(false)}
                  className="text-[#718394] hover:text-red-500 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الجهة *</label>
                  <select
                    value={actForm.companyId}
                    onChange={(e) => setActForm({ ...actForm, companyId: e.target.value, contactId: '' })}
                    className={inputClass}
                  >
                    <option value="">اختر الجهة...</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">نوع النشاط *</label>
                  <select
                    value={actForm.activityType}
                    onChange={(e) =>
                      setActForm({ ...actForm, activityType: e.target.value as PartnerActivityType })
                    }
                    className={inputClass}
                  >
                    {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">التاريخ *</label>
                  <input
                    type="date"
                    value={actForm.activityDate}
                    onChange={(e) => setActForm({ ...actForm, activityDate: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الوقت</label>
                  <input
                    type="time"
                    value={actForm.activityTime}
                    onChange={(e) => setActForm({ ...actForm, activityTime: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">مسؤول التواصل من الجهة</label>
                  <select
                    value={actForm.contactId}
                    onChange={(e) => setActForm({ ...actForm, contactId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">اختيار من القائمة أو كتابة اسم</option>
                    {contacts
                      .filter((c) => !actForm.companyId || String(c.companyId) === actForm.companyId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الموظف القائم بالزيارة</label>
                  <select
                    value={actForm.staffUserId}
                    onChange={(e) => {
                      const s = staffMembers.find((m) => m.user_id === e.target.value);
                      setActForm({
                        ...actForm,
                        staffUserId: e.target.value,
                        staffName: s?.name || currentUser.name,
                      });
                    }}
                    className={inputClass}
                  >
                    <option value={currentUserUuid || ''}>{currentUser.name}</option>
                    {staffMembers
                      .filter((m) => m.user_id !== currentUserUuid)
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الهدف من الزيارة / الاجتماع *</label>
                  <input
                    type="text"
                    value={actForm.goal}
                    onChange={(e) => setActForm({ ...actForm, goal: e.target.value })}
                    className={inputClass}
                    placeholder="مثال: تجديد التعاقد السنوي، مناقشة نسب الخصم، عرض خدمات الليزك"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">تاريخ المتابعة القادمة</label>
                  <input
                    type="date"
                    value={actForm.nextFollowupDate}
                    onChange={(e) => setActForm({ ...actForm, nextFollowupDate: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">ملخص ما دار</label>
                  <textarea
                    rows={2}
                    value={actForm.summary}
                    onChange={(e) => setActForm({ ...actForm, summary: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">النتائج والاتفاقيات والوعود</label>
                  <textarea
                    rows={2}
                    value={actForm.outcomes}
                    onChange={(e) => setActForm({ ...actForm, outcomes: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الخطوات القادمة</label>
                  <input
                    type="text"
                    value={actForm.nextSteps}
                    onChange={(e) => setActForm({ ...actForm, nextSteps: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-4">
                  <label className="px-3.5 py-2 rounded-xl bg-white border border-[#DFEAF0] text-xs font-bold text-[#172B3A] flex items-center gap-1.5 cursor-pointer hover:border-[#087F8C]">
                    <Upload size={14} className="text-[#087F8C]" />
                    {actUploading ? 'جاري الرفع...' : 'إرفاق مستند / محضر'}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setActUploading(true);
                        const up = await uploadPartnerDocument(
                          file,
                          `activities/${actForm.companyId || 'general'}`,
                        );
                        setActUploading(false);
                        if ('error' in up) {
                          toast.error(up.error);
                        } else {
                          setActForm((prev) => ({
                            ...prev,
                            attachments: [...prev.attachments, up],
                          }));
                          toast.success('تم إرفاق الملف');
                        }
                      }}
                    />
                  </label>
                  {!editingActId && actForm.nextFollowupDate && (
                    <label className="flex items-center gap-1.5 text-xs font-bold text-[#087F8C] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={actForm.createAutoFollowup}
                        onChange={(e) =>
                          setActForm({ ...actForm, createAutoFollowup: e.target.checked })
                        }
                      />
                      إنشاء مهمة متابعة تلقائياً
                    </label>
                  )}
                </div>
              </div>
              {actForm.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {actForm.attachments.map((att, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-lg bg-white border border-[#DFEAF0] text-xs font-bold flex items-center gap-1.5"
                    >
                      <Paperclip size={12} className="text-[#087F8C]" />
                      {att.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveActivity}
                  className="fv-btn-primary text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                >
                  حفظ النشاط
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {filteredActivities.length === 0 ? (
              <div className="text-center py-12 text-[#718394] font-bold">
                لا توجد زيارات أو اجتماعات مسجلة
              </div>
            ) : (
              filteredActivities.map((act) => (
                <div
                  key={act.id}
                  className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0] hover:border-[#25B8C7]/50 transition-all"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20">
                        {ACTIVITY_TYPE_LABELS[act.activityType]}
                      </span>
                      <span className="font-black text-sm text-[#172B3A]">
                        {orgNameMap.get(act.companyId) || `#${act.companyId}`}
                      </span>
                      <span className="text-xs font-bold text-[#718394]">— {act.goal}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#718394] fv-num">
                        {act.activityDate} {act.activityTime}
                      </span>
                      {perm('partners_edit_activities') && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingActId(act.id);
                            setActForm({
                              companyId: String(act.companyId),
                              contactId: act.contactId || '',
                              contactName: act.contactName,
                              activityType: act.activityType,
                              activityDate: act.activityDate,
                              activityTime: act.activityTime,
                              staffUserId: act.staffUserId,
                              staffName: act.staffName,
                              goal: act.goal,
                              summary: act.summary,
                              outcomes: act.outcomes,
                              agreements: act.agreements,
                              nextSteps: act.nextSteps,
                              nextFollowupDate: act.nextFollowupDate,
                              followupStatus: act.followupStatus,
                              attachments: act.attachments,
                              createAutoFollowup: false,
                            });
                            setActFormOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-white border border-[#DFEAF0] text-[#087F8C] cursor-pointer"
                        >
                          <Edit2 size={13} />
                        </button>
                      )}
                      {perm('partners_delete_activities') && (
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await deletePartnerActivityRecord(
                              act,
                              currentUser.name,
                              currentUserUuid,
                            );
                            if (res.error) {
                              toast.error(res.error || 'تعذر حذف النشاط');
                              return;
                            }
                            toast.success('تم حذف النشاط');
                            await reloadAll();
                          }}
                          className="p-1.5 rounded-lg bg-white border border-[#DFEAF0] text-red-600 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  {(act.summary || act.outcomes) && (
                    <p className="text-xs text-[#172B3A] leading-relaxed mb-2">
                      {[act.summary, act.outcomes ? `النتائج: ${act.outcomes}` : '']
                        .filter(Boolean)
                        .join(' | ')}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#718394]">
                    <span>
                      المسؤول: <strong className="text-[#172B3A]">{act.staffName}</strong>
                      {act.contactName ? ` • مع: ${act.contactName}` : ''}
                      {act.nextFollowupDate ? ` • المتابعة القادمة: ${act.nextFollowupDate}` : ''}
                    </span>
                    {act.attachments.length > 0 && (
                      <div className="flex gap-2">
                        {act.attachments.map((att, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleOpenAttachment(att.path)}
                            className="text-[#1769AA] font-bold flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <Paperclip size={12} /> {att.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==================== 5. CONTRACTS & RENEWALS ==================== */}
      {activeTab === 'contracts' && (
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h3 className="text-lg font-black text-[#172B3A] flex items-center gap-2">
              <FileText size={19} className="text-[#087F8C]" /> إدارة العقود وسجل التجديدات
            </h3>
            {perm('partners_create_contracts') && (
              <button
                type="button"
                onClick={() => {
                  setEditingContractId(null);
                  setContractForm({
                    companyId: contractFilterOrg || String(organizations[0]?.id || ''),
                    contractNumber: `CNT-${new Date().getFullYear()}-${String(contracts.length + 1).padStart(3, '0')}`,
                    contractType: 'سنوي',
                    signedDate: cairoTodayIso(),
                    startDate: cairoTodayIso(),
                    endDate: '',
                    durationMonths: '12',
                    status: 'نشط',
                    terms: '',
                    discountTerms: '',
                    responsibleStaffId: currentUserUuid || '',
                    responsibleStaffName: currentUser.name,
                    nextRenewalDate: '',
                    notes: '',
                    attachmentPath: '',
                    attachmentName: '',
                  });
                  setContractFormOpen(true);
                }}
                className="fv-btn-primary text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={15} /> إضافة عقد جديد
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-5">
            <select
              value={contractFilterOrg}
              onChange={(e) => setContractFilterOrg(e.target.value)}
              className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl px-3 py-2 text-xs font-bold text-[#172B3A]"
            >
              <option value="">كل الجهات</option>
              {organizations.map((o) => (
                <option key={o.id} value={String(o.id)}>
                  {o.name}
                </option>
              ))}
            </select>
            <select
              value={contractFilterStatus}
              onChange={(e) => setContractFilterStatus(e.target.value)}
              className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl px-3 py-2 text-xs font-bold text-[#172B3A]"
            >
              <option value="">كل حالات العقد</option>
              {CONTRACT_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs font-bold text-[#718394] cursor-pointer">
              <input
                type="checkbox"
                checked={showHistoricalContracts}
                onChange={(e) => setShowHistoricalContracts(e.target.checked)}
              />
              إظهار النسخ التاريخية السابقة للعقود
            </label>
          </div>

          {contractFormOpen && (
            <div className="mb-6 bg-[#F5FAFC] p-5 rounded-2xl border border-[#DFEAF0] space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-sm text-[#172B3A]">
                  {editingContractId ? 'تعديل بيانات العقد' : 'إنشاء عقد جديد'}
                </h4>
                <button
                  type="button"
                  onClick={() => setContractFormOpen(false)}
                  className="text-[#718394] hover:text-red-500 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الجهة *</label>
                  <select
                    value={contractForm.companyId}
                    onChange={(e) => setContractForm({ ...contractForm, companyId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">اختر الجهة...</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">رقم العقد *</label>
                  <input
                    type="text"
                    value={contractForm.contractNumber}
                    onChange={(e) =>
                      setContractForm({ ...contractForm, contractNumber: e.target.value })
                    }
                    className={`${inputClass} fv-num`}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">نوع العقد</label>
                  <select
                    value={contractForm.contractType}
                    onChange={(e) => setContractForm({ ...contractForm, contractType: e.target.value })}
                    className={inputClass}
                  >
                    {CONTRACT_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">تاريخ البداية *</label>
                  <input
                    type="date"
                    value={contractForm.startDate}
                    onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">تاريخ الانتهاء *</label>
                  <input
                    type="date"
                    value={contractForm.endDate}
                    onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">حالة العقد</label>
                  <select
                    value={contractForm.status}
                    onChange={(e) =>
                      setContractForm({ ...contractForm, status: e.target.value as ContractStatus })
                    }
                    className={inputClass}
                  >
                    {CONTRACT_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">تاريخ التوقيع</label>
                  <input
                    type="date"
                    value={contractForm.signedDate}
                    onChange={(e) => setContractForm({ ...contractForm, signedDate: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">الخصم / التسعير المتفق عليه</label>
                  <input
                    type="text"
                    value={contractForm.discountTerms}
                    onChange={(e) =>
                      setContractForm({ ...contractForm, discountTerms: e.target.value })
                    }
                    className={inputClass}
                    placeholder="مثال: خصم 20% على الكشف و15% على العمليات"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#718394] mb-1 block">مرفق العقد (PDF / صورة)</label>
                  {perm('partners_manage_contract_documents') ? (
                    <label className="w-full bg-white border border-[#DFEAF0] rounded-xl p-2.5 text-xs font-bold text-[#087F8C] flex items-center justify-center gap-2 cursor-pointer hover:border-[#087F8C]">
                      <Upload size={14} />
                      {contractUploading
                        ? 'جاري الرفع...'
                        : contractForm.attachmentName || 'رفع نسخة العقد'}
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setContractUploading(true);
                          const up = await uploadPartnerDocument(
                            file,
                            `contracts/${contractForm.companyId || 'general'}`,
                          );
                          setContractUploading(false);
                          if ('error' in up) {
                            toast.error(up.error);
                          } else {
                            setContractForm((prev) => ({
                              ...prev,
                              attachmentPath: up.path,
                              attachmentName: up.name,
                            }));
                            toast.success('تم رفع مستند العقد');
                          }
                        }}
                      />
                    </label>
                  ) : (
                    <p className="text-[11px] text-[#718394] pt-2">يتطلب صلاحية إدارة مرفقات العقود</p>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1 block">الشروط الأساسية والملاحظات</label>
                <textarea
                  rows={2}
                  value={contractForm.terms}
                  onChange={(e) => setContractForm({ ...contractForm, terms: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveContract}
                  className="fv-btn-primary text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                >
                  حفظ العقد
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
            <table className="w-full text-sm text-right">
              <thead className="bg-[#F5FAFC] text-[#718394] text-xs font-bold border-b border-[#DFEAF0]">
                <tr>
                  <th className="p-3.5">الجهة</th>
                  <th className="p-3.5">رقم العقد والإصدار</th>
                  <th className="p-3.5">النوع والخصم</th>
                  <th className="p-3.5">الفترة</th>
                  <th className="p-3.5">الحالة والمتبقي</th>
                  <th className="p-3.5">المستند</th>
                  <th className="p-3.5 text-center">إدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFEAF0]/70">
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-[#718394] font-bold">
                      لا توجد عقود مطابقة
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map((ct) => {
                    const eff = computeContractEffectiveStatus(
                      ct,
                      alertSettings.autoMarkExpiringDays,
                    );
                    const badgeColor =
                      eff.effectiveStatus === 'نشط'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : eff.effectiveStatus === 'قريب الانتهاء'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : eff.effectiveStatus === 'منتهي' || eff.effectiveStatus === 'ملغي'
                            ? 'bg-red-50 text-red-600 border-red-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200';
                    return (
                      <tr key={ct.id} className="hover:bg-[#F5FAFC]">
                        <td className="p-3.5 font-bold text-[#172B3A]">
                          {orgNameMap.get(ct.companyId) || `#${ct.companyId}`}
                        </td>
                        <td className="p-3.5 fv-num">
                          <span className="font-black text-[#172B3A]">{ct.contractNumber}</span>
                          <span className="mr-1.5 text-[10px] px-1.5 py-0.5 rounded bg-[#087F8C]/10 text-[#087F8C] font-bold">
                            v{ct.versionNumber}
                          </span>
                        </td>
                        <td className="p-3.5 text-xs">
                          <div className="font-bold text-[#172B3A]">{ct.contractType}</div>
                          <div className="text-[#718394]">{ct.discountTerms || '—'}</div>
                        </td>
                        <td className="p-3.5 text-xs fv-num text-[#718394]">
                          <div>من: {ct.startDate}</div>
                          <div>إلى: {ct.endDate}</div>
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeColor}`}>
                            {eff.effectiveStatus}
                          </span>
                          {Number.isFinite(eff.daysRemaining) && ct.isCurrentVersion && (
                            <div className="text-[10px] text-[#718394] mt-1 fv-num">
                              {eff.daysRemaining >= 0
                                ? `متبقي ${eff.daysRemaining} يوم`
                                : `منتهي منذ ${Math.abs(eff.daysRemaining)} يوم`}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-xs">
                          {ct.attachmentPath ? (
                            <button
                              type="button"
                              onClick={() => handleOpenAttachment(ct.attachmentPath)}
                              className="text-[#1769AA] font-bold flex items-center gap-1 hover:underline cursor-pointer"
                            >
                              <ExternalLink size={13} /> {ct.attachmentName || 'عرض'}
                            </button>
                          ) : (
                            <span className="text-[#718394]">—</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex justify-center gap-1">
                            {ct.isCurrentVersion && perm('partners_renew_contracts') && (
                              <button
                                type="button"
                                onClick={() => {
                                  const nextStart = ct.endDate || cairoTodayIso();
                                  const endD = new Date(`${nextStart}T00:00:00Z`);
                                  endD.setUTCFullYear(endD.getUTCFullYear() + 1);
                                  const nextEnd = endD.toISOString().slice(0, 10);
                                  setRenewTarget(ct);
                                  setRenewFields({
                                    newContractNumber: `${ct.contractNumber}-R${ct.versionNumber + 1}`,
                                    newStartDate: nextStart,
                                    newEndDate: nextEnd,
                                    nextRenewalDate: nextEnd,
                                    renewalNotes: '',
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-[#087F8C]/10 text-[#087F8C] text-[11px] font-bold hover:bg-[#087F8C]/20 cursor-pointer flex items-center gap-1"
                                title="تجديد العقد"
                              >
                                <RefreshCw size={12} /> تجديد
                              </button>
                            )}
                            {perm('partners_edit_contracts') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingContractId(ct.id);
                                  setContractForm({
                                    companyId: String(ct.companyId),
                                    contractNumber: ct.contractNumber,
                                    contractType: ct.contractType,
                                    signedDate: ct.signedDate,
                                    startDate: ct.startDate,
                                    endDate: ct.endDate,
                                    durationMonths: ct.durationMonths ? String(ct.durationMonths) : '',
                                    status: ct.status,
                                    terms: ct.terms,
                                    discountTerms: ct.discountTerms,
                                    responsibleStaffId: ct.responsibleStaffId,
                                    responsibleStaffName: ct.responsibleStaffName,
                                    nextRenewalDate: ct.nextRenewalDate,
                                    notes: ct.notes,
                                    attachmentPath: ct.attachmentPath,
                                    attachmentName: ct.attachmentName,
                                  });
                                  setContractFormOpen(true);
                                }}
                                className="p-1.5 rounded-lg bg-white border border-[#DFEAF0] text-emerald-600 cursor-pointer"
                              >
                                <Edit2 size={13} />
                              </button>
                            )}
                            {perm('partners_delete_contracts') && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await deletePartnerContractRecord(
                                    ct,
                                    currentUser.name,
                                    currentUserUuid,
                                  );
                                  if (res.error) {
                                    toast.error(res.error || 'تعذر حذف العقد');
                                    return;
                                  }
                                  toast.success('تم حذف العقد');
                                  await reloadAll();
                                }}
                                className="p-1.5 rounded-lg bg-white border border-[#DFEAF0] text-red-600 cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== 6. REFERRED PATIENTS ==================== */}
      {activeTab === 'referrals' && (
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-black text-[#172B3A] flex items-center gap-2">
                <UserCheck size={19} className="text-[#087F8C]" /> المرضى المحولون عبر شركاء النجاح
              </h3>
              <button
                type="button"
                onClick={() => {
                  setAnalyticsOrgId('');
                  setAnalyticsDateFrom('');
                  setAnalyticsDateTo('');
                  setAnalyticsMonth('');
                  setAnalyticsYear('');
                  setAnalyticsDoctor('');
                  setAnalyticsStatus('');
                }}
                className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
              >
                مسح الفلاتر
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              <select
                value={analyticsOrgId}
                onChange={(e) => setAnalyticsOrgId(e.target.value)}
                className={inputClass}
              >
                <option value="">كل الجهات</option>
                {organizations.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.name}
                  </option>
                ))}
              </select>
              <select
                value={analyticsDoctor}
                onChange={(e) => setAnalyticsDoctor(e.target.value)}
                className={inputClass}
              >
                <option value="">كل الأطباء</option>
                {doctors.map((d) => (
                  <option key={String(d.id)} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                value={analyticsStatus}
                onChange={(e) => setAnalyticsStatus(e.target.value)}
                className={inputClass}
              >
                <option value="">كل الحالات</option>
                <option value="confirmed">مؤكد / حضر</option>
                <option value="cancelled">ملغي</option>
              </select>
              <input
                type="month"
                value={analyticsMonth}
                onChange={(e) => setAnalyticsMonth(e.target.value)}
                className={inputClass}
                title="الشهر"
              />
              <input
                type="date"
                value={analyticsDateFrom}
                onChange={(e) => setAnalyticsDateFrom(e.target.value)}
                className={inputClass}
                title="من تاريخ"
              />
              <input
                type="date"
                value={analyticsDateTo}
                onChange={(e) => setAnalyticsDateTo(e.target.value)}
                className={inputClass}
                title="إلى تاريخ"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              <StatCard
                label="المرضى الفريدون"
                value={overallReferrals.uniquePatients}
                icon={Users}
                color="bg-[#087F8C]/10 text-[#087F8C]"
              />
              <StatCard
                label="إجمالي الحجوزات"
                value={overallReferrals.totalBookings}
                icon={CalendarDays}
                color="bg-[#1769AA]/10 text-[#1769AA]"
              />
              <StatCard
                label="الحضور / المؤكد"
                value={overallReferrals.confirmedBookings}
                icon={CheckCircle}
                color="bg-emerald-50 text-emerald-700"
              />
              <StatCard
                label="الملغي"
                value={overallReferrals.cancelledBookings}
                icon={X}
                color="bg-red-50 text-red-600"
              />
              <StatCard
                label="محول لعملية"
                value={overallReferrals.totalSurgeries}
                icon={Scissors}
                color="bg-teal-50 text-teal-700"
                sub={`نسبة التحويل: ${overallReferrals.conversionRate}%`}
              />
              <StatCard
                label="الشهر الحالي / السابق"
                value={`${overallReferrals.currentMonthPatients} / ${overallReferrals.previousMonthPatients}`}
                icon={TrendingUp}
                color="bg-indigo-50 text-indigo-700"
                sub={`السنة: ${overallReferrals.currentYearPatients} / ${overallReferrals.previousYearPatients}`}
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
              <table className="w-full text-sm text-right">
                <thead className="bg-[#F5FAFC] text-[#718394] text-xs font-bold border-b border-[#DFEAF0]">
                  <tr>
                    <th className="p-3.5">الجهة المتعاقدة</th>
                    <th className="p-3.5">المرضى الفريدون</th>
                    <th className="p-3.5">الحجوزات</th>
                    <th className="p-3.5">الحضور المؤكد</th>
                    <th className="p-3.5">الملغي</th>
                    <th className="p-3.5">العمليات</th>
                    <th className="p-3.5">التحويل للعملية</th>
                    <th className="p-3.5">الشهر الحالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFEAF0]/70">
                  {perOrgReferrals.map(({ org, stats }) => (
                    <tr key={org.id} className="hover:bg-[#F5FAFC]">
                      <td className="p-3.5 font-bold text-[#172B3A]">{org.name}</td>
                      <td className="p-3.5 fv-num font-black text-[#087F8C]">{stats.uniquePatients}</td>
                      <td className="p-3.5 fv-num">{stats.totalBookings}</td>
                      <td className="p-3.5 fv-num text-emerald-700 font-bold">
                        {stats.confirmedBookings}
                      </td>
                      <td className="p-3.5 fv-num text-red-600">{stats.cancelledBookings}</td>
                      <td className="p-3.5 fv-num font-bold">{stats.totalSurgeries}</td>
                      <td className="p-3.5 fv-num">{stats.conversionRate}%</td>
                      <td className="p-3.5 fv-num">{stats.currentMonthPatients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 7. REVENUE ANALYTICS (STRICTLY GATED) ==================== */}
      {activeTab === 'revenue' && (perm('partners_view_revenue') || perm('partners_view_financial_reports')) && (
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-black text-[#172B3A] flex items-center gap-2">
                <Banknote size={19} className="text-emerald-600" /> الإيرادات المالية لكل تعاقد
              </h3>
              <div className="flex flex-wrap gap-2">
                <select
                  value={analyticsOrgId}
                  onChange={(e) => setAnalyticsOrgId(e.target.value)}
                  className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl px-3 py-2 text-xs font-bold"
                >
                  <option value="">كل الجهات</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <input
                  type="month"
                  value={analyticsMonth}
                  onChange={(e) => setAnalyticsMonth(e.target.value)}
                  className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl px-3 py-2 text-xs font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              <StatCard
                label="إجمالي المفوتر"
                value={`${overallRevenue.totalBilled.toLocaleString('ar-EG')} ج.م`}
                icon={FileText}
                color="bg-[#1769AA]/10 text-[#1769AA]"
              />
              <StatCard
                label="المحصل الفعلي"
                value={`${overallRevenue.collectedAmount.toLocaleString('ar-EG')} ج.م`}
                icon={CheckCircle}
                color="bg-emerald-50 text-emerald-700"
              />
              <StatCard
                label="المتبقي / المستحق"
                value={`${overallRevenue.outstandingAmount.toLocaleString('ar-EG')} ج.م`}
                icon={Clock}
                color="bg-amber-50 text-amber-700"
              />
              <StatCard
                label="ملغي / مسترد"
                value={`${overallRevenue.refundedOrCancelledAmount.toLocaleString('ar-EG')} ج.م`}
                icon={AlertTriangle}
                color="bg-red-50 text-red-600"
              />
              <StatCard
                label="متوسط إيراد المريض"
                value={`${overallRevenue.avgRevenuePerPatient.toLocaleString('ar-EG')} ج.م`}
                icon={TrendingUp}
                color="bg-[#087F8C]/10 text-[#087F8C]"
              />
              <StatCard
                label="عدد المعاملات"
                value={overallRevenue.transactionCount}
                icon={Activity}
                color="bg-indigo-50 text-indigo-700"
                sub={`كشوفات: ${overallRevenue.examRevenue.toLocaleString('ar-EG')} | عمليات: ${overallRevenue.surgeryRevenue.toLocaleString('ar-EG')}`}
              />
            </div>

            <div className="mb-6 bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0]">
              <h4 className="text-xs font-black text-[#172B3A] mb-2">التوزيع الشهري للإيرادات المحصلة</h4>
              <MiniBar
                data={overallRevenue.monthlySeries.slice(-8).map((m) => ({
                  label: m.month.slice(2),
                  value: m.collected,
                }))}
                maxVal={Math.max(...overallRevenue.monthlySeries.map((m) => m.collected), 1)}
                barClass="from-emerald-600 to-teal-400"
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
              <table className="w-full text-sm text-right">
                <thead className="bg-[#F5FAFC] text-[#718394] text-xs font-bold border-b border-[#DFEAF0]">
                  <tr>
                    <th className="p-3.5">الجهة المتعاقدة</th>
                    <th className="p-3.5">المرضى</th>
                    <th className="p-3.5">إجمالي المفوتر</th>
                    <th className="p-3.5">المحصل</th>
                    <th className="p-3.5">المتبقي</th>
                    <th className="p-3.5">كشوفات</th>
                    <th className="p-3.5">عمليات</th>
                    <th className="p-3.5">ملغي/مسترد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFEAF0]/70">
                  {perOrgRevenue.map(({ org, rev, ref }) => (
                    <tr key={org.id} className="hover:bg-[#F5FAFC]">
                      <td className="p-3.5 font-bold text-[#172B3A]">{org.name}</td>
                      <td className="p-3.5 fv-num">{ref.uniquePatients}</td>
                      <td className="p-3.5 fv-num font-bold">
                        {rev.totalBilled.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3.5 fv-num font-black text-emerald-700">
                        {rev.collectedAmount.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3.5 fv-num text-amber-700 font-bold">
                        {rev.outstandingAmount.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3.5 fv-num">{rev.examRevenue.toLocaleString('ar-EG')} ج.م</td>
                      <td className="p-3.5 fv-num">{rev.surgeryRevenue.toLocaleString('ar-EG')} ج.م</td>
                      <td className="p-3.5 fv-num text-red-600">
                        {rev.refundedOrCancelledAmount.toLocaleString('ar-EG')} ج.م
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 8. FOLLOW-UPS & RENEWAL ALERTS ==================== */}
      {activeTab === 'followups' && (
        <div className="space-y-6">
          {/* Renewal Alert Engine Panel */}
          <div className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-black text-[#172B3A] flex items-center gap-2">
                  <Bell size={18} className="text-[#087F8C]" /> محرك تنبيهات تجديد العقود (
                  <span className="fv-num">{pendingAlertsPreview.length}</span>)
                </h3>
                <p className="text-xs text-[#718394]">
                  تُرسل التنبيهات تلقائياً إلى جرس الإشعارات دون تكرار حسب الفترات المحددة
                </p>
              </div>
              {perm('partners_manage_renewal_alerts') && (
                <button
                  type="button"
                  onClick={handleRunAlertsCheck}
                  className="fv-btn-primary text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Bell size={14} /> فحص وإصدار التنبيهات الآن
                </button>
              )}
            </div>

            {pendingAlertsPreview.length === 0 ? (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3 font-bold">
                جميع العقود الحالية ضمن النطاق الآمن وفق فترات التنبيه المحددة.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                {pendingAlertsPreview.map((al) => (
                  <div
                    key={al.contractId}
                    className={`p-3.5 rounded-xl border text-xs ${
                      al.severity === 'warning'
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    <p className="font-black">{al.title}</p>
                    <p className="mt-1 font-medium">{al.message}</p>
                  </div>
                ))}
              </div>
            )}

            {(perm('partners_manage_renewal_alerts') || perm('partners_manage_settings')) && (
              <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0] space-y-3">
                <h4 className="text-xs font-black text-[#172B3A] flex items-center gap-1.5">
                  <Settings size={14} className="text-[#087F8C]" /> إعدادات فترات تنبيه التجديد (بالأيام قبل الانتهاء)
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[90, 60, 30, 15, 7, 0].map((day) => {
                    const checked = alertSettingsDraft.alertDays.includes(day);
                    return (
                      <label
                        key={day}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer flex items-center gap-1.5 ${
                          checked
                            ? 'bg-[#087F8C] text-white border-[#087F8C]'
                            : 'bg-white text-[#718394] border-[#DFEAF0]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={() =>
                            setAlertSettingsDraft((prev) => ({
                              ...prev,
                              alertDays: checked
                                ? prev.alertDays.filter((d) => d !== day)
                                : [...prev.alertDays, day].sort((a, b) => b - a),
                            }))
                          }
                        />
                        {day === 0 ? 'يوم الانتهاء (0)' : `قبل ${day} يوم`}
                      </label>
                    );
                  })}
                  <label className="flex items-center gap-1.5 text-xs font-bold text-[#172B3A] px-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alertSettingsDraft.notifyOverdue}
                      onChange={(e) =>
                        setAlertSettingsDraft((prev) => ({
                          ...prev,
                          notifyOverdue: e.target.checked,
                        }))
                      }
                    />
                    تنبيه العقود المنتهية
                  </label>
                  <button
                    type="button"
                    onClick={handleSaveAlertSettings}
                    className="px-4 py-1.5 rounded-xl bg-[#1769AA] text-white text-xs font-bold cursor-pointer hover:opacity-90"
                  >
                    حفظ الإعدادات
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Follow-up Tasks */}
          {perm('partners_view_followups') && (
            <div className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h3 className="text-lg font-black text-[#172B3A] flex items-center gap-2">
                  <ListChecks size={19} className="text-[#087F8C]" /> مهام المتابعة (
                  <span className="fv-num">{filteredFollowups.length}</span>)
                </h3>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={followupFilterOrg}
                    onChange={(e) => setFollowupFilterOrg(e.target.value)}
                    className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    <option value="">كل الجهات</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={followupFilterStatus}
                    onChange={(e) => setFollowupFilterStatus(e.target.value)}
                    className="bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    <option value="">كل الحالات</option>
                    <option value="__overdue__">متأخرة عن الموعد</option>
                    {FOLLOWUP_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {perm('partners_create_followups') && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFollowupId(null);
                        setFollowupForm({
                          companyId: followupFilterOrg || String(organizations[0]?.id || ''),
                          title: '',
                          assigneeUserId: currentUserUuid || '',
                          assigneeName: currentUser.name,
                          dueDate: cairoTodayIso(),
                          followupType: 'متابعة عامة',
                          priority: 'medium',
                          description: '',
                          status: 'جديدة',
                          outcome: '',
                        });
                        setFollowupFormOpen(true);
                      }}
                      className="fv-btn-primary text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={15} /> مهمة متابعة جديدة
                    </button>
                  )}
                </div>
              </div>

              {followupFormOpen && (
                <div className="mb-6 bg-[#F5FAFC] p-5 rounded-2xl border border-[#DFEAF0] space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-sm text-[#172B3A]">
                      {editingFollowupId ? 'تعديل مهمة متابعة' : 'إنشاء مهمة متابعة'}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setFollowupFormOpen(false)}
                      className="text-[#718394] hover:text-red-500 cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-[#718394] mb-1 block">الجهة *</label>
                      <select
                        value={followupForm.companyId}
                        onChange={(e) =>
                          setFollowupForm({ ...followupForm, companyId: e.target.value })
                        }
                        className={inputClass}
                      >
                        <option value="">اختر الجهة...</option>
                        {organizations.map((o) => (
                          <option key={o.id} value={String(o.id)}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-bold text-[#718394] mb-1 block">عنوان المهمة *</label>
                      <input
                        type="text"
                        value={followupForm.title}
                        onChange={(e) => setFollowupForm({ ...followupForm, title: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#718394] mb-1 block">تاريخ الاستحقاق *</label>
                      <input
                        type="date"
                        value={followupForm.dueDate}
                        onChange={(e) => setFollowupForm({ ...followupForm, dueDate: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#718394] mb-1 block">الأولوية</label>
                      <select
                        value={followupForm.priority}
                        onChange={(e) =>
                          setFollowupForm({
                            ...followupForm,
                            priority: e.target.value as FollowupPriority,
                          })
                        }
                        className={inputClass}
                      >
                        {Object.entries(FOLLOWUP_PRIORITY_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#718394] mb-1 block">الحالة</label>
                      <select
                        value={followupForm.status}
                        onChange={(e) =>
                          setFollowupForm({
                            ...followupForm,
                            status: e.target.value as FollowupTaskStatus,
                          })
                        }
                        className={inputClass}
                      >
                        {FOLLOWUP_STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    {(perm('partners_assign_followups') || !editingFollowupId) && (
                      <div>
                        <label className="text-xs font-bold text-[#718394] mb-1 block">الموظف المكلف</label>
                        <select
                          value={followupForm.assigneeUserId}
                          onChange={(e) => {
                            const s = staffMembers.find((m) => m.user_id === e.target.value);
                            setFollowupForm({
                              ...followupForm,
                              assigneeUserId: e.target.value,
                              assigneeName: s?.name || currentUser.name,
                            });
                          }}
                          className={inputClass}
                        >
                          <option value={currentUserUuid || ''}>{currentUser.name}</option>
                          {staffMembers
                            .filter((m) => m.user_id !== currentUserUuid)
                            .map((m) => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    <div className="md:col-span-2">
                      <label className="text-xs font-bold text-[#718394] mb-1 block">النتيجة / الوصف</label>
                      <input
                        type="text"
                        value={followupForm.outcome || followupForm.description}
                        onChange={(e) =>
                          setFollowupForm({
                            ...followupForm,
                            description: e.target.value,
                            outcome: e.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveFollowup}
                      className="fv-btn-primary text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      حفظ المهمة
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
                <table className="w-full text-sm text-right">
                  <thead className="bg-[#F5FAFC] text-[#718394] text-xs font-bold border-b border-[#DFEAF0]">
                    <tr>
                      <th className="p-3.5">المهمة</th>
                      <th className="p-3.5">الجهة</th>
                      <th className="p-3.5">المكلف</th>
                      <th className="p-3.5">تاريخ الاستحقاق</th>
                      <th className="p-3.5">الأولوية</th>
                      <th className="p-3.5">الحالة</th>
                      <th className="p-3.5 text-center">إدارة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DFEAF0]/70">
                    {filteredFollowups.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-[#718394] font-bold">
                          لا توجد مهام متابعة مسجلة
                        </td>
                      </tr>
                    ) : (
                      filteredFollowups.map((f) => {
                        const isOverdue =
                          f.status !== 'مكتملة' && f.status !== 'ملغاة' && f.dueDate < todayIso;
                        return (
                          <tr key={f.id} className="hover:bg-[#F5FAFC]">
                            <td className="p-3.5">
                              <div className="font-bold text-[#172B3A]">{f.title}</div>
                              {(f.outcome || f.description) && (
                                <p className="text-[11px] text-[#718394] mt-0.5">
                                  {f.outcome || f.description}
                                </p>
                              )}
                            </td>
                            <td className="p-3.5 font-bold text-[#087F8C]">
                              {orgNameMap.get(f.companyId) || `#${f.companyId}`}
                            </td>
                            <td className="p-3.5 text-xs text-[#172B3A]">
                              {f.assigneeName || 'غير محدد'}
                            </td>
                            <td className="p-3.5 text-xs fv-num">
                              <span className={isOverdue ? 'text-red-600 font-black' : 'text-[#172B3A]'}>
                                {f.dueDate}
                              </span>
                              {isOverdue && (
                                <span className="block text-[10px] text-red-600 font-bold">متأخرة</span>
                              )}
                            </td>
                            <td className="p-3.5 text-xs font-bold">
                              {FOLLOWUP_PRIORITY_LABELS[f.priority]}
                            </td>
                            <td className="p-3.5">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  f.status === 'مكتملة'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : isOverdue || f.status === 'متأخرة'
                                      ? 'bg-red-50 text-red-600'
                                      : 'bg-[#087F8C]/10 text-[#087F8C]'
                                }`}
                              >
                                {f.status}
                              </span>
                            </td>
                            <td className="p-3.5 text-center">
                              {perm('partners_edit_followups') && (
                                <div className="flex justify-center gap-1">
                                  {f.status !== 'مكتملة' && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const res = await completePartnerFollowupRecord(
                                          f,
                                          currentUser.name,
                                          currentUserUuid,
                                        );
                                        if (res.error) {
                                          toast.error(res.error || 'تعذر إكمال المهمة');
                                          return;
                                        }
                                        toast.success('تم إكمال المهمة');
                                        await reloadAll();
                                      }}
                                      className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 cursor-pointer"
                                      title="إكمال المهمة"
                                    >
                                      <CheckCircle size={13} />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingFollowupId(f.id);
                                      setFollowupForm({
                                        companyId: String(f.companyId),
                                        title: f.title,
                                        assigneeUserId: f.assigneeUserId,
                                        assigneeName: f.assigneeName,
                                        dueDate: f.dueDate,
                                        followupType: f.followupType,
                                        priority: f.priority,
                                        description: f.description,
                                        status: f.status,
                                        outcome: f.outcome,
                                      });
                                      setFollowupFormOpen(true);
                                    }}
                                    className="p-1.5 rounded-lg bg-white border border-[#DFEAF0] text-[#087F8C] cursor-pointer"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== 9. REPORTS & AUDIT LOG ==================== */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className={cardClass}>
            <h3 className="text-lg font-black text-[#172B3A] mb-2 flex items-center gap-2">
              <FileSpreadsheet size={19} className="text-[#087F8C]" /> التقارير والتصدير (Excel CSV / طباعة)
            </h3>
            <p className="text-xs text-[#718394] mb-5">
              يتم تسجيل كافة عمليات التصدير والطباعة في سجل التدقيق وتُحمى بيانات التقارير وفق صلاحيات كل موظف
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Organizations Report */}
              <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0] space-y-3">
                <h4 className="font-black text-sm text-[#172B3A]">تقرير الجهات المتعاقدة</h4>
                <p className="text-xs text-[#718394]">دليل الجهات، المحافظة، الحالة، المسؤول الرئيسي</p>
                <div className="flex gap-2">
                  {perm('partners_export_reports') && (
                    <button
                      type="button"
                      onClick={() =>
                        triggerCsvDownload(
                          'partners-organizations',
                          ['الجهة', 'النوع', 'المحافظة', 'الحالة', 'المسؤول', 'الهاتف'],
                          organizations.map((o) => [
                            o.name,
                            o.orgType,
                            o.governorate,
                            o.relationshipStatus,
                            o.managerName || '',
                            o.managerPhone || o.phone,
                          ]),
                          'الجهات المتعاقدة',
                        )
                      }
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#DFEAF0] text-[#087F8C] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer hover:border-[#087F8C]"
                    >
                      <Download size={14} /> Excel CSV
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      handlePrintTableReport(
                        'تقرير الجهات المتعاقدة (شركاء النجاح)',
                        ['الجهة', 'النوع', 'المحافظة', 'الحالة', 'المسؤول', 'الهاتف'],
                        organizations.map((o) => [
                          o.name,
                          o.orgType,
                          o.governorate || '-',
                          o.relationshipStatus,
                          o.managerName || '-',
                          o.managerPhone || o.phone || '-',
                        ]),
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-[#087F8C]/10 text-[#087F8C] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={14} /> طباعة
                  </button>
                </div>
              </div>

              {/* Contracts Report */}
              <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0] space-y-3">
                <h4 className="font-black text-sm text-[#172B3A]">تقرير العقود والتجديدات</h4>
                <p className="text-xs text-[#718394]">حالة العقود، تواريخ الانتهاء، الإصدارات</p>
                <div className="flex gap-2">
                  {perm('partners_export_reports') && (
                    <button
                      type="button"
                      onClick={() =>
                        triggerCsvDownload(
                          'partners-contracts',
                          ['الجهة', 'رقم العقد', 'الإصدار', 'النوع', 'البداية', 'النهاية', 'الحالة'],
                          contracts.map((c) => [
                            orgNameMap.get(c.companyId) || c.companyId,
                            c.contractNumber,
                            `v${c.versionNumber}`,
                            c.contractType,
                            c.startDate,
                            c.endDate,
                            computeContractEffectiveStatus(c, alertSettings.autoMarkExpiringDays)
                              .effectiveStatus,
                          ]),
                          'العقود والتجديدات',
                        )
                      }
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#DFEAF0] text-[#087F8C] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer hover:border-[#087F8C]"
                    >
                      <Download size={14} /> Excel CSV
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      handlePrintTableReport(
                        'تقرير عقود شركاء النجاح',
                        ['الجهة', 'رقم العقد', 'النوع', 'البداية', 'النهاية', 'الحالة'],
                        contracts.map((c) => [
                          orgNameMap.get(c.companyId) || String(c.companyId),
                          c.contractNumber,
                          c.contractType,
                          c.startDate,
                          c.endDate,
                          computeContractEffectiveStatus(c, alertSettings.autoMarkExpiringDays)
                            .effectiveStatus,
                        ]),
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-[#087F8C]/10 text-[#087F8C] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={14} /> طباعة
                  </button>
                </div>
              </div>

              {/* Referrals Report */}
              <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0] space-y-3">
                <h4 className="font-black text-sm text-[#172B3A]">تقرير المرضى المحولين</h4>
                <p className="text-xs text-[#718394]">المرضى الفريدون، الحجوزات، العمليات ونسبة التحويل</p>
                <div className="flex gap-2">
                  {perm('partners_export_reports') && (
                    <button
                      type="button"
                      onClick={() =>
                        triggerCsvDownload(
                          'partners-referrals',
                          ['الجهة', 'المرضى الفريدون', 'الحجوزات', 'المؤكد', 'الملغي', 'العمليات', 'نسبة التحويل%'],
                          perOrgReferrals.map(({ org, stats }) => [
                            org.name,
                            stats.uniquePatients,
                            stats.totalBookings,
                            stats.confirmedBookings,
                            stats.cancelledBookings,
                            stats.totalSurgeries,
                            stats.conversionRate,
                          ]),
                          'المرضى المحولون',
                        )
                      }
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#DFEAF0] text-[#087F8C] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer hover:border-[#087F8C]"
                    >
                      <Download size={14} /> Excel CSV
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      handlePrintTableReport(
                        'تقرير المرضى المحولين من شركاء النجاح',
                        ['الجهة', 'المرضى الفريدون', 'الحجوزات', 'المؤكد', 'العمليات', 'نسبة التحويل%'],
                        perOrgReferrals.map(({ org, stats }) => [
                          org.name,
                          String(stats.uniquePatients),
                          String(stats.totalBookings),
                          String(stats.confirmedBookings),
                          String(stats.totalSurgeries),
                          `${stats.conversionRate}%`,
                        ]),
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-[#087F8C]/10 text-[#087F8C] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={14} /> طباعة
                  </button>
                </div>
              </div>

              {/* Financial Revenue Report (STRICTLY GATED) */}
              {(perm('partners_view_revenue') || perm('partners_view_financial_reports')) && (
                <div className="bg-emerald-50/70 rounded-2xl p-4 border border-emerald-200/80 space-y-3">
                  <h4 className="font-black text-sm text-emerald-900">التقرير المالي لإيرادات التعاقدات</h4>
                  <p className="text-xs text-emerald-700">المفوتر، المحصل، المتبقي، والملغي/المسترد</p>
                  <div className="flex gap-2">
                    {perm('partners_export_reports') && (
                      <button
                        type="button"
                        onClick={() =>
                          triggerCsvDownload(
                            'partners-revenue',
                            ['الجهة', 'المفوتر', 'المحصل', 'المتبقي', 'ملغي/مسترد', 'كشوفات', 'عمليات'],
                            perOrgRevenue.map(({ org, rev }) => [
                              org.name,
                              rev.totalBilled,
                              rev.collectedAmount,
                              rev.outstandingAmount,
                              rev.refundedOrCancelledAmount,
                              rev.examRevenue,
                              rev.surgeryRevenue,
                            ]),
                            'الإيرادات المالية للتعاقدات',
                          )
                        }
                        className="flex-1 px-3 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download size={14} /> Excel CSV
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        handlePrintTableReport(
                          'التقرير المالي لشركاء النجاح',
                          ['الجهة', 'المفوتر', 'المحصل', 'المتبقي', 'كشوفات', 'عمليات'],
                          perOrgRevenue.map(({ org, rev }) => [
                            org.name,
                            `${rev.totalBilled} ج.م`,
                            `${rev.collectedAmount} ج.م`,
                            `${rev.outstandingAmount} ج.م`,
                            `${rev.examRevenue} ج.م`,
                            `${rev.surgeryRevenue} ج.م`,
                          ]),
                        )
                      }
                      className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer size={14} /> طباعة
                    </button>
                  </div>
                </div>
              )}

              {/* Activities Report */}
              <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0] space-y-3">
                <h4 className="font-black text-sm text-[#172B3A]">تقرير الزيارات والاجتماعات</h4>
                <p className="text-xs text-[#718394]">سجل التواصل الميداني والنتائج والتواريخ</p>
                <div className="flex gap-2">
                  {perm('partners_export_reports') && (
                    <button
                      type="button"
                      onClick={() =>
                        triggerCsvDownload(
                          'partners-activities',
                          ['التاريخ', 'النوع', 'الجهة', 'الهدف', 'الموظف', 'النتائج'],
                          activities.map((a) => [
                            a.activityDate,
                            ACTIVITY_TYPE_LABELS[a.activityType],
                            orgNameMap.get(a.companyId) || a.companyId,
                            a.goal,
                            a.staffName,
                            a.outcomes,
                          ]),
                          'الزيارات والاجتماعات',
                        )
                      }
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#DFEAF0] text-[#087F8C] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer hover:border-[#087F8C]"
                    >
                      <Download size={14} /> Excel CSV
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      handlePrintTableReport(
                        'تقرير الزيارات والاجتماعات',
                        ['التاريخ', 'النوع', 'الجهة', 'الهدف', 'الموظف'],
                        activities.map((a) => [
                          a.activityDate,
                          ACTIVITY_TYPE_LABELS[a.activityType],
                          orgNameMap.get(a.companyId) || String(a.companyId),
                          a.goal,
                          a.staffName,
                        ]),
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-[#087F8C]/10 text-[#087F8C] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={14} /> طباعة
                  </button>
                </div>
              </div>

              {/* Followups Report */}
              <div className="bg-[#F5FAFC] rounded-2xl p-4 border border-[#DFEAF0] space-y-3">
                <h4 className="font-black text-sm text-[#172B3A]">تقرير مهام المتابعة</h4>
                <p className="text-xs text-[#718394]">المهام المفتوحة والمكتملة والمتأخرة</p>
                <div className="flex gap-2">
                  {perm('partners_export_reports') && (
                    <button
                      type="button"
                      onClick={() =>
                        triggerCsvDownload(
                          'partners-followups',
                          ['الجهة', 'المهمة', 'المكلف', 'الاستحقاق', 'الأولوية', 'الحالة'],
                          followups.map((f) => [
                            orgNameMap.get(f.companyId) || f.companyId,
                            f.title,
                            f.assigneeName,
                            f.dueDate,
                            FOLLOWUP_PRIORITY_LABELS[f.priority],
                            f.status,
                          ]),
                          'مهام المتابعة',
                        )
                      }
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#DFEAF0] text-[#087F8C] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer hover:border-[#087F8C]"
                    >
                      <Download size={14} /> Excel CSV
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      handlePrintTableReport(
                        'تقرير مهام المتابعة لشركاء النجاح',
                        ['الجهة', 'المهمة', 'المكلف', 'الاستحقاق', 'الحالة'],
                        followups.map((f) => [
                          orgNameMap.get(f.companyId) || String(f.companyId),
                          f.title,
                          f.assigneeName || '-',
                          f.dueDate,
                          f.status,
                        ]),
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-[#087F8C]/10 text-[#087F8C] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={14} /> طباعة
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Log */}
          <div className={cardClass}>
            <h3 className="text-base font-black text-[#172B3A] mb-4 flex items-center gap-2">
              <Shield size={17} className="text-[#087F8C]" /> سجل التدقيق والعمليات (Audit Log)
            </h3>
            <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
              <table className="w-full text-xs text-right">
                <thead className="bg-[#F5FAFC] text-[#718394] font-bold border-b border-[#DFEAF0]">
                  <tr>
                    <th className="p-3">الوقت</th>
                    <th className="p-3">الموظف</th>
                    <th className="p-3">نوع الإجراء</th>
                    <th className="p-3">الملخص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFEAF0]/70">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-[#718394] font-bold">
                        لا توجد سجلات تدقيق بعد
                      </td>
                    </tr>
                  ) : (
                    auditLogs.slice(0, 50).map((log) => (
                      <tr key={log.id} className="hover:bg-[#F5FAFC]">
                        <td className="p-3 fv-num text-[#718394]">
                          {log.createdAt.replace('T', ' ').slice(0, 16)}
                        </td>
                        <td className="p-3 font-bold text-[#172B3A]">{log.actorName}</td>
                        <td className="p-3 fv-mono text-[#087F8C]">{log.actionType}</td>
                        <td className="p-3 text-[#172B3A]">{log.summary}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <PartnerOrgFormModal
        isOpen={orgModalOpen}
        isEditing={Boolean(editingOrgId)}
        form={orgForm}
        setForm={setOrgForm}
        staffMembers={staffMembers}
        errorMsg={orgError}
        saving={savingOrg}
        inputClass={inputClass}
        onSave={handleSaveOrg}
        onClose={() => setOrgModalOpen(false)}
      />

      <PartnerProfileModal
        organization={profileOrg}
        contacts={contacts}
        activities={activities}
        contracts={contracts}
        renewals={renewals}
        followups={followups}
        referrals={
          profileOrg
            ? computePartnerReferrals(profileOrg.id, normalizedBookings, normalizedOperations)
            : null
        }
        revenue={
          profileOrg && perm('partners_view_revenue')
            ? computePartnerRevenue(
                profileOrg.id,
                normalizedBookings,
                normalizedOperations,
                normalizedPayments,
                doctors,
                services,
              )
            : null
        }
        canViewRevenue={perm('partners_view_revenue')}
        canEditOrg={perm('partners_edit_organizations')}
        canViewContracts={perm('partners_view_contracts')}
        canViewActivities={perm('partners_view_activities')}
        canExport={perm('partners_export_reports') || currentUser.role === 'admin'}
        autoExpiringDays={alertSettings.autoMarkExpiringDays}
        onClose={() => setProfileOrg(null)}
        onEditOrg={openEditOrg}
        onOpenAttachment={handleOpenAttachment}
        onPrintProfile={(org) => {
          const ref = computePartnerReferrals(org.id, normalizedBookings, normalizedOperations);
          handlePrintTableReport(
            `ملف شريك النجاح: ${org.name}`,
            ['البند', 'القيمة'],
            [
              ['اسم الجهة', org.name],
              ['نوع الجهة', org.orgType],
              ['المحافظة والمدينة', [org.governorate, org.city].filter(Boolean).join(' - ') || '-'],
              ['حالة العلاقة', org.relationshipStatus],
              ['مسؤول التواصل الرئيسي', org.managerName || '-'],
              ['هاتف المسؤول', org.managerPhone || org.phone || '-'],
              ['المرضى المحولون', String(ref.uniquePatients)],
              ['الحجوزات المؤكدة', String(ref.confirmedBookings)],
              ['العمليات الجراحية', String(ref.totalSurgeries)],
            ],
          );
        }}
      />

      <ContractRenewModal
        contract={renewTarget}
        companyName={renewTarget ? orgNameMap.get(renewTarget.companyId) || '' : ''}
        newContractNumber={renewFields.newContractNumber}
        setNewContractNumber={(v) => setRenewFields((p) => ({ ...p, newContractNumber: v }))}
        newStartDate={renewFields.newStartDate}
        setNewStartDate={(v) => setRenewFields((p) => ({ ...p, newStartDate: v }))}
        newEndDate={renewFields.newEndDate}
        setNewEndDate={(v) => setRenewFields((p) => ({ ...p, newEndDate: v }))}
        nextRenewalDate={renewFields.nextRenewalDate}
        setNextRenewalDate={(v) => setRenewFields((p) => ({ ...p, nextRenewalDate: v }))}
        renewalNotes={renewFields.renewalNotes}
        setRenewalNotes={(v) => setRenewFields((p) => ({ ...p, renewalNotes: v }))}
        saving={renewSaving}
        inputClass={inputClass}
        onConfirm={handleConfirmRenew}
        onClose={() => setRenewTarget(null)}
      />

      {deletingOrgId && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#DFEAF0] p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="w-12 h-12 bg-red-50 border border-red-200 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="font-black text-[#172B3A] text-lg mb-2">حذف الجهة المتعاقدة؟</h3>
            <p className="text-sm text-[#718394] mb-6">
              سيتم حذف هذه الجهة وكافة العقود والأنشطة المرتبطة بها نهائياً. لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={confirmDeleteOrg}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-xl font-bold hover:bg-red-700 cursor-pointer"
              >
                تأكيد الحذف
              </button>
              <button
                type="button"
                onClick={() => setDeletingOrgId(null)}
                className="flex-1 bg-[#F5FAFC] border border-[#DFEAF0] text-[#718394] py-2.5 rounded-xl font-bold cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
