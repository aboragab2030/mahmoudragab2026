import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart2,
  CheckCircle,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  HeartHandshake,
  Link2,
  Lock,
  MessageSquare,
  PhoneCall,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Stethoscope,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { withMinSpin } from '@/lib/refreshSpin';
import { hasGeneralEvaluationPermission, type PermissionUser } from './permissions';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_LIFECYCLE_STATUSES,
  COMPLAINT_PRIORITY_LABELS,
  COMPLAINT_STATUS_BADGE,
  FEEDBACK_TYPE_LABELS,
  NON_RETURN_REASONS,
  RECOMMENDATION_OPTIONS,
  WAITING_TIME_RANGE_OPTIONS,
  computeDoctorRatingsReport,
  computeEvaluationAnalytics,
  exportEvaluationsReport,
  filterComplaintsList,
  filterEvaluations,
  loadGeneralEvaluationBundle,
  maskPatientIdentity,
  recordNonReturnReasonFromCall,
  saveEvaluationSettings,
  updateComplaintWorkflow,
  updateEvaluationReview,
  type ComplaintLifecycleStatus,
  type ComplaintPriority,
  type EvaluationComplaintRecord,
  type EvaluationFilters,
  type EvaluationFollowupRecord,
  type EvaluationRecord,
  type EvaluationSettingsRecord,
  type NonReturnReasonRecord,
} from './generalEvaluationService';

type EvalSubTab =
  | 'overview'
  | 'evaluations'
  | 'doctor-ratings'
  | 'reception'
  | 'waiting-time'
  | 'complaints'
  | 'followups'
  | 'non-return'
  | 'reports'
  | 'settings';

interface GeneralEvaluationHubProps {
  currentUser: PermissionUser;
  currentUserUuid?: string;
  currentUserName: string;
  doctors: Array<{ id: number; name: string; specialty?: string }>;
  services: Array<{ id: number; title: string }>;
  staffMembers: Array<{ user_id: string; name: string; role: 'admin' | 'staff'; is_active?: boolean }>;
  cardClass: string;
  inputClass: string;
  onComplaintsSynced?: () => Promise<void> | void;
  onPrintReport?: (title: string, htmlBody: string) => void;
}

const CHART_COLORS = ['#087F8C', '#1769AA', '#25B8C7', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#8B5CF6'];

const escHtml = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const GeneralEvaluationHub: React.FC<GeneralEvaluationHubProps> = ({
  currentUser,
  currentUserUuid,
  currentUserName,
  doctors,
  services,
  staffMembers,
  cardClass,
  inputClass,
  onComplaintsSynced,
  onPrintReport,
}) => {
  // Permission gates
  const canViewOverview =
    hasGeneralEvaluationPermission(currentUser, 'general_evaluation_view') ||
    hasGeneralEvaluationPermission(currentUser, 'general_evaluation_manage') ||
    hasGeneralEvaluationPermission(currentUser, 'general_evaluation_view_reports');
  const canViewReports =
    hasGeneralEvaluationPermission(currentUser, 'general_evaluation_view_reports') ||
    hasGeneralEvaluationPermission(currentUser, 'general_evaluation_manage');
  const canExport = hasGeneralEvaluationPermission(currentUser, 'general_evaluation_export');
  const canManageSettings = hasGeneralEvaluationPermission(currentUser, 'general_evaluation_manage_settings');
  const canViewPatientDetails = hasGeneralEvaluationPermission(currentUser, 'general_evaluation_view_patient_details');
  const canManageComplaints =
    hasGeneralEvaluationPermission(currentUser, 'general_evaluation_manage_complaints') ||
    hasGeneralEvaluationPermission(currentUser, 'general_evaluation_manage');
  const canAssignComplaints =
    hasGeneralEvaluationPermission(currentUser, 'general_evaluation_assign_complaints') ||
    canManageComplaints;
  const canResolveComplaints =
    hasGeneralEvaluationPermission(currentUser, 'general_evaluation_resolve_complaints') ||
    canManageComplaints;
  const canManageFollowups =
    hasGeneralEvaluationPermission(currentUser, 'general_evaluation_manage_followups') ||
    canManageComplaints;
  const canViewDoctorRatings =
    hasGeneralEvaluationPermission(currentUser, 'general_evaluation_view_doctor_ratings') ||
    canViewReports;
  const canAccessAnyComplaint =
    canManageComplaints || canAssignComplaints || canResolveComplaints || canManageFollowups || canViewReports;

  const availableTabs = useMemo(() => {
    const list: { id: EvalSubTab; label: string; icon: React.ReactNode }[] = [];
    if (canViewOverview) list.push({ id: 'overview', label: 'لوحة المؤشرات', icon: <BarChart2 size={16} /> });
    if (canViewOverview) list.push({ id: 'evaluations', label: 'تقييمات المرضى', icon: <Star size={16} /> });
    if (canViewDoctorRatings) list.push({ id: 'doctor-ratings', label: 'تقييمات الأطباء', icon: <Stethoscope size={16} /> });
    if (canViewOverview || canViewReports) list.push({ id: 'reception', label: 'تقييمات الاستقبال', icon: <HeartHandshake size={16} /> });
    if (canViewOverview || canViewReports) list.push({ id: 'waiting-time', label: 'أوقات الانتظار', icon: <Clock size={16} /> });
    if (canAccessAnyComplaint) list.push({ id: 'complaints', label: 'الشكاوى والمقترحات', icon: <MessageSquare size={16} /> });
    if (canManageFollowups || canAccessAnyComplaint) list.push({ id: 'followups', label: 'متابعة الشكاوى', icon: <PhoneCall size={16} /> });
    if (canViewOverview || canViewReports || canManageFollowups) list.push({ id: 'non-return', label: 'أسباب عدم العودة', icon: <AlertTriangle size={16} /> });
    if (canViewReports) list.push({ id: 'reports', label: 'تقارير رضا المرضى', icon: <TrendingUp size={16} /> });
    if (canManageSettings) list.push({ id: 'settings', label: 'إعدادات التقييم', icon: <Settings size={16} /> });
    return list;
  }, [
    canViewOverview,
    canViewDoctorRatings,
    canViewReports,
    canAccessAnyComplaint,
    canManageFollowups,
    canManageSettings,
  ]);

  const [subTab, setSubTab] = useState<EvalSubTab>(() => availableTabs[0]?.id || 'overview');
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.some((t) => t.id === subTab)) {
      setSubTab(availableTabs[0].id);
    }
  }, [availableTabs, subTab]);

  // Core state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [complaints, setComplaints] = useState<EvaluationComplaintRecord[]>([]);
  const [followups, setFollowups] = useState<EvaluationFollowupRecord[]>([]);
  const [nonReturnReasons, setNonReturnReasons] = useState<NonReturnReasonRecord[]>([]);
  const [settings, setSettings] = useState<EvaluationSettingsRecord | null>(null);

  // Filters
  const [filters, setFilters] = useState<EvaluationFilters>({
    search: '',
    startDate: '',
    endDate: '',
    doctorName: '',
    serviceName: '',
    feedbackType: '',
    minRating: undefined,
    complaintCategory: '',
    complaintStatus: '',
    assignedStaffId: '',
  });

  // Modals & action state
  const [selectedEval, setSelectedEval] = useState<EvaluationRecord | null>(null);
  const [evalNotesDraft, setEvalNotesDraft] = useState('');
  const [evalStatusDraft, setEvalStatusDraft] = useState('جديد');
  const [savingEvalReview, setSavingEvalReview] = useState(false);

  const [editingComplaint, setEditingComplaint] = useState<EvaluationComplaintRecord | null>(null);
  const [cmpDraft, setCmpDraft] = useState<{
    status: ComplaintLifecycleStatus | string;
    priority: ComplaintPriority;
    category: string;
    assignedStaffId: string;
    resolutionNote: string;
    rejectionReason: string;
    internalNotes: string;
    followupDate: string;
    patientContacted: boolean;
    patientSatisfaction: number | '';
    actionTaken: string;
    followupNote: string;
    nonReturnReason: string;
    nonReturnExplanation: string;
  }>({
    status: 'جديدة',
    priority: 'medium',
    category: 'أخرى',
    assignedStaffId: '',
    resolutionNote: '',
    rejectionReason: '',
    internalNotes: '',
    followupDate: '',
    patientContacted: false,
    patientSatisfaction: '',
    actionTaken: '',
    followupNote: '',
    nonReturnReason: '',
    nonReturnExplanation: '',
  });
  const [savingComplaint, setSavingComplaint] = useState(false);

  // Follow-up call non-return entry
  const [callReasonForm, setCallReasonForm] = useState({
    reasonCode: '',
    doctorName: '',
    explanation: '',
  });
  const [savingCallReason, setSavingCallReason] = useState(false);

  // Settings form state
  const [settingsDraft, setSettingsDraft] = useState<EvaluationSettingsRecord | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const bundle = await loadGeneralEvaluationBundle({
        canReadComplaints: canAccessAnyComplaint || canViewReports || canViewOverview,
        canManageSettings,
      });
      setEvaluations(bundle.evaluations);
      setComplaints(bundle.complaints);
      setFollowups(bundle.followups);
      setNonReturnReasons(bundle.nonReturnReasons);
      setSettings(bundle.settings);
      setSettingsDraft((prev) => prev || bundle.settings);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تحميل بيانات التقييم العام');
    } finally {
      setLoading(false);
    }
  }, [canAccessAnyComplaint, canViewReports, canViewOverview, canManageSettings]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await withMinSpin(async () => {
        await loadData();
        await onComplaintsSynced?.();
      });
      toast.success('تم تحديث بيانات التقييم العام');
    } finally {
      setRefreshing(false);
    }
  }, [loadData, onComplaintsSynced]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Real-time synchronization across evaluations, complaints & follow-ups
  useEffect(() => {
    const channel = supabase
      .channel(`general-eval-sync-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_experience_evaluations' }, () => {
        void loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => {
        void loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_experience_followups' }, () => {
        void loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_non_return_reasons' }, () => {
        void loadData();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Filtered datasets
  const filteredEvaluations = useMemo(() => filterEvaluations(evaluations, filters), [evaluations, filters]);
  const filteredComplaints = useMemo(() => filterComplaintsList(complaints, filters), [complaints, filters]);

  const filteredNonReturn = useMemo(() => {
    return nonReturnReasons.filter((r) => {
      const day = (r.recordedAt || '').slice(0, 10);
      if (filters.startDate && day && day < filters.startDate) return false;
      if (filters.endDate && day && day > filters.endDate) return false;
      if (filters.doctorName && (r.doctorName || '') !== filters.doctorName) return false;
      return true;
    });
  }, [nonReturnReasons, filters]);

  const analytics = useMemo(
    () => computeEvaluationAnalytics(filteredEvaluations, filteredComplaints, filteredNonReturn),
    [filteredEvaluations, filteredComplaints, filteredNonReturn],
  );

  const doctorReport = useMemo(
    () => computeDoctorRatingsReport(filteredEvaluations, doctors.map((d) => d.name)),
    [filteredEvaluations, doctors],
  );

  const openComplaintModal = (c: EvaluationComplaintRecord) => {
    setEditingComplaint(c);
    setCmpDraft({
      status: c.status || 'جديدة',
      priority: c.priority || 'medium',
      category: c.category || 'أخرى',
      assignedStaffId: c.assignedStaffId || '',
      resolutionNote: c.resolutionNote || '',
      rejectionReason: c.rejectionReason || '',
      internalNotes: c.internalNotes || '',
      followupDate: c.followupDate || '',
      patientContacted: c.patientContacted,
      patientSatisfaction: c.patientResolutionSatisfaction ?? '',
      actionTaken: '',
      followupNote: '',
      nonReturnReason: '',
      nonReturnExplanation: '',
    });
  };

  const handleSaveComplaintUpdate = async () => {
    if (!editingComplaint) return;
    if (cmpDraft.status === 'تم الحل' && !cmpDraft.resolutionNote.trim()) {
      toast.error('يجب كتابة تفاصيل الحل قبل تغيير الحالة إلى "تم الحل"');
      return;
    }
    if (
      cmpDraft.status === 'مرفوضة مع توضيح السبب' &&
      !cmpDraft.rejectionReason.trim() &&
      !cmpDraft.resolutionNote.trim()
    ) {
      toast.error('يجب توضيح سبب رفض الشكوى');
      return;
    }

    setSavingComplaint(true);
    try {
      const assignedStaff = staffMembers.find((s) => s.user_id === cmpDraft.assignedStaffId);
      await updateComplaintWorkflow(editingComplaint.dbId, {
        status: cmpDraft.status,
        priority: cmpDraft.priority,
        category: cmpDraft.category,
        assigned_staff_id: cmpDraft.assignedStaffId || null,
        assigned_staff_name: assignedStaff?.name || null,
        resolution_note: cmpDraft.resolutionNote.trim() || undefined,
        rejection_reason: cmpDraft.rejectionReason.trim() || undefined,
        internal_notes: cmpDraft.internalNotes.trim() || undefined,
        followup_date: cmpDraft.followupDate || null,
        patient_contacted: cmpDraft.patientContacted,
        patient_resolution_satisfaction: cmpDraft.patientSatisfaction ? Number(cmpDraft.patientSatisfaction) : null,
        action_taken: cmpDraft.actionTaken.trim() || undefined,
        followup_note: cmpDraft.followupNote.trim() || undefined,
        non_return_reason: cmpDraft.nonReturnReason || undefined,
        non_return_explanation: cmpDraft.nonReturnExplanation.trim() || undefined,
      });
      toast.success('تم تحديث الشكوى ومزامنتها بنجاح');
      setEditingComplaint(null);
      await loadData();
      await onComplaintsSynced?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تحديث الشكوى');
    } finally {
      setSavingComplaint(false);
    }
  };

  const handleSaveEvaluationReview = async () => {
    if (!selectedEval) return;
    setSavingEvalReview(true);
    try {
      await updateEvaluationReview(selectedEval.id, {
        reviewStatus: evalStatusDraft,
        internalNotes: evalNotesDraft,
      });
      toast.success('تم حفظ حالة المراجعة والملاحظات الداخلية');
      setSelectedEval(null);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر حفظ الملاحظات');
    } finally {
      setSavingEvalReview(false);
    }
  };

  const handleSaveCallReason = async () => {
    if (!callReasonForm.reasonCode) {
      toast.error('يرجى اختيار سبب عدم العودة المؤكد من المريض');
      return;
    }
    setSavingCallReason(true);
    try {
      await recordNonReturnReasonFromCall({
        reasonCode: callReasonForm.reasonCode,
        doctorName: callReasonForm.doctorName || undefined,
        explanation: callReasonForm.explanation || undefined,
        staffId: currentUserUuid,
        staffName: currentUserName,
      });
      toast.success('تم تسجيل سبب عدم العودة من مكالمة المتابعة');
      setCallReasonForm({ reasonCode: '', doctorName: '', explanation: '' });
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تسجيل السبب');
    } finally {
      setSavingCallReason(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settingsDraft) return;
    setSavingSettings(true);
    try {
      await saveEvaluationSettings(settingsDraft, currentUserUuid);
      toast.success('تم حفظ إعدادات التقييم العام');
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر حفظ الإعدادات');
    } finally {
      setSavingSettings(false);
    }
  };

  const directEvaluationLink = useMemo(() => {
    if (typeof window === 'undefined') return '?section=general-evaluation';
    return `${window.location.origin}/?section=general-evaluation`;
  }, []);

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('تم نسخ رابط التقييم العام');
    } catch {
      toast.error('تعذر النسخ التلقائي، يمكنك نسخ الرابط يدوياً');
    }
  };

  const handlePrintSummary = () => {
    if (!canExport) {
      toast.error('ليس لديك صلاحية طباعة أو تصدير التقارير');
      return;
    }
    const html = `
      <table>
        <thead>
          <tr><th>المؤشر</th><th>القيمة</th></tr>
        </thead>
        <tbody>
          <tr><td>إجمالي التقييمات</td><td>${analytics.totalEvaluations}</td></tr>
          <tr><td>متوسط الرضا العام</td><td>${analytics.avgOverallSatisfaction} / 5</td></tr>
          <tr><td>متوسط تقييم الأطباء</td><td>${analytics.avgDoctorRating} / 5</td></tr>
          <tr><td>متوسط تقييم الخدمة</td><td>${analytics.avgServiceRating} / 5</td></tr>
          <tr><td>متوسط تقييم الاستقبال</td><td>${analytics.avgReceptionRating} / 5</td></tr>
          <tr><td>متوسط تقييم الانتظار</td><td>${analytics.avgWaitingTimeRating} / 5</td></tr>
          <tr><td>نسبة الترشيح الإيجابية</td><td>${analytics.recommendationRatePct}%</td></tr>
          <tr><td>الشكاوى المفتوحة / المحلولة</td><td>${analytics.complaintIndicators.openComplaints} / ${analytics.complaintIndicators.resolvedComplaints}</td></tr>
          <tr><td>معدل حل الشكاوى</td><td>${analytics.complaintIndicators.resolutionRatePct}%</td></tr>
        </tbody>
      </table>
      <h3>تقييمات الأطباء</h3>
      <table>
        <thead><tr><th>الطبيب</th><th>عدد التقييمات</th><th>المتوسط</th><th>إيجابي</th><th>سلبي</th></tr></thead>
        <tbody>
          ${doctorReport
            .map(
              (d) =>
                `<tr><td>${escHtml(d.doctorName)}</td><td>${d.evaluationCount}</td><td>${d.avgOverallDoctorRating}</td><td>${d.positiveCount}</td><td>${d.negativeCount}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
    if (onPrintReport) {
      onPrintReport('تقرير رضا المرضى والتقييم العام', html);
    } else {
      window.print();
    }
  };

  if (availableTabs.length === 0) {
    return (
      <div className={cardClass} dir="rtl">
        <div className="py-12 text-center">
          <Lock size={34} className="mx-auto text-[#718394] mb-3" />
          <h3 className="font-black text-lg text-[#172B3A]">غير مصرح بالوصول</h3>
          <p className="text-sm text-[#718394] mt-1">ليس لديك صلاحيات كافية لعرض قسم التقييم العام.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
      {/* Header Card & Navigation Pills */}
      <div className={cardClass}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-black text-[#172B3A] flex items-center gap-2.5">
              <Star size={22} className="text-[#087F8C]" />
              <span>التقييم العام وتجربة المريض</span>
            </h2>
            <p className="text-xs font-bold text-[#718394] mt-1">
              قياس رضا المرضى، تقييمات الأطباء والاستقبال وأوقات الانتظار، ومتابعة الشكاوى والمقترحات وأسباب عدم العودة
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyLink(directEvaluationLink)}
              className="px-3.5 py-2 rounded-xl border border-[#DFEAF0] bg-[#F5FAFC] text-[#172B3A] hover:border-[#087F8C] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Link2 size={14} className="text-[#087F8C]" />
              نسخ رابط التقييم العام
            </button>
            {canExport && (
              <>
                <button
                  type="button"
                  onClick={() => exportEvaluationsReport(filteredEvaluations, canViewPatientDetails, 'csv')}
                  className="px-3.5 py-2 rounded-xl border border-[#DFEAF0] bg-white text-[#172B3A] hover:bg-[#F5FAFC] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Download size={14} className="text-[#087F8C]" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => exportEvaluationsReport(filteredEvaluations, canViewPatientDetails, 'excel')}
                  className="px-3.5 py-2 rounded-xl border border-[#DFEAF0] bg-white text-[#172B3A] hover:bg-[#F5FAFC] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <FileSpreadsheet size={14} className="text-emerald-600" />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={handlePrintSummary}
                  className="px-3.5 py-2 rounded-xl border border-[#DFEAF0] bg-white text-[#087F8C] hover:bg-[#087F8C]/10 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Printer size={14} />
                  طباعة
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="fv-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              تحديث
            </button>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-[#DFEAF0]">
          {availableTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                subTab === t.id
                  ? 'bg-[#087F8C] text-white shadow-xs'
                  : 'bg-[#F5FAFC] text-[#172B3A] border border-[#DFEAF0] hover:border-[#087F8C]/40'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Shared Filters Bar (hidden on Settings tab) */}
      {subTab !== 'settings' && (
        <div className="bg-white rounded-2xl border border-[#DFEAF0] p-4 shadow-[0_10px_28px_-16px_rgba(11,31,53,0.08)]">
          <div className="flex items-center gap-2 text-xs font-black text-[#172B3A] mb-3">
            <Filter size={15} className="text-[#087F8C]" />
            <span>تصفية البيانات الفعلية</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="relative lg:col-span-2">
              <Search size={15} className="absolute right-3 top-3 text-[#718394]" />
              <input
                type="text"
                value={filters.search || ''}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className={`${inputClass} pr-9 py-2 text-xs`}
                placeholder="بحث بالكود، الطبيب، الملاحظات..."
              />
            </div>
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              className={`${inputClass} py-2 text-xs fv-num`}
              title="من تاريخ"
            />
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              className={`${inputClass} py-2 text-xs fv-num`}
              title="إلى تاريخ"
            />
            <select
              value={filters.doctorName || ''}
              onChange={(e) => setFilters((f) => ({ ...f, doctorName: e.target.value }))}
              className={`${inputClass} py-2 text-xs`}
            >
              <option value="">كل الأطباء</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              value={filters.feedbackType || ''}
              onChange={(e) => setFilters((f) => ({ ...f, feedbackType: e.target.value }))}
              className={`${inputClass} py-2 text-xs`}
            >
              <option value="">كل أنواع المشاركات</option>
              <option value="evaluation">تقييم عام</option>
              <option value="positive_comment">تعليق إيجابي</option>
              <option value="suggestion">اقتراح</option>
              <option value="complaint">شكوى</option>
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className={`${cardClass} text-center py-14`}>
          <RefreshCw size={28} className="animate-spin text-[#087F8C] mx-auto mb-3" />
          <p className="text-sm font-bold text-[#718394]">جاري تحميل بيانات التقييم العام...</p>
        </div>
      ) : (
        <>
          {/* 1. OVERVIEW TAB */}
          {subTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'إجمالي التقييمات', value: analytics.totalEvaluations, suffix: '' },
                  { label: 'متوسط الرضا العام', value: analytics.avgOverallSatisfaction || 0, suffix: ' / 5' },
                  { label: 'متوسط تقييم الأطباء', value: analytics.avgDoctorRating || 0, suffix: ' / 5' },
                  { label: 'متوسط تقييم الخدمة', value: analytics.avgServiceRating || 0, suffix: ' / 5' },
                  { label: 'متوسط تقييم الاستقبال', value: analytics.avgReceptionRating || 0, suffix: ' / 5' },
                  { label: 'متوسط وقت الانتظار', value: analytics.avgWaitingTimeRating || 0, suffix: ' / 5' },
                  { label: 'نسبة ترشيح المركز', value: analytics.recommendationRatePct, suffix: '%' },
                  { label: 'نسبة حل الشكاوى', value: analytics.complaintIndicators.resolutionRatePct, suffix: '%' },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white rounded-2xl border border-[#DFEAF0] p-4 shadow-[0_8px_20px_-14px_rgba(11,31,53,0.1)]">
                    <p className="text-xs font-bold text-[#718394]">{kpi.label}</p>
                    <p className="text-2xl font-black text-[#172B3A] mt-1.5 fv-num">
                      {kpi.value}
                      <span className="text-xs font-bold text-[#087F8C]">{kpi.suffix}</span>
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white rounded-2xl border border-[#DFEAF0] p-4">
                  <p className="text-xs font-bold text-[#718394]">إجمالي الشكاوى</p>
                  <p className="text-xl font-black text-red-600 mt-1 fv-num">{analytics.complaintIndicators.complaintsCount}</p>
                </div>
                <div className="bg-white rounded-2xl border border-[#DFEAF0] p-4">
                  <p className="text-xs font-bold text-[#718394]">إجمالي المقترحات</p>
                  <p className="text-xl font-black text-[#087F8C] mt-1 fv-num">{analytics.complaintIndicators.suggestionsCount}</p>
                </div>
                <div className="bg-white rounded-2xl border border-[#DFEAF0] p-4">
                  <p className="text-xs font-bold text-[#718394]">الشكاوى المفتوحة</p>
                  <p className="text-xl font-black text-amber-600 mt-1 fv-num">{analytics.complaintIndicators.openComplaints}</p>
                </div>
                <div className="bg-white rounded-2xl border border-[#DFEAF0] p-4">
                  <p className="text-xs font-bold text-[#718394]">الشكاوى المحلولة</p>
                  <p className="text-xl font-black text-emerald-600 mt-1 fv-num">{analytics.complaintIndicators.resolvedComplaints}</p>
                </div>
                <div className="bg-white rounded-2xl border border-[#DFEAF0] p-4">
                  <p className="text-xs font-bold text-[#718394]">متوسط زمن الحل</p>
                  <p className="text-xl font-black text-[#172B3A] mt-1 fv-num">{analytics.complaintIndicators.avgResolutionHours} ساعة</p>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={cardClass}>
                  <h3 className="text-sm font-black text-[#172B3A] mb-4">اتجاه الرضا العام عبر الأيام</h3>
                  {analytics.satisfactionTrend.length === 0 ? (
                    <p className="text-xs text-[#718394] text-center py-12">لا توجد بيانات تقييم كافية بعد</p>
                  ) : (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={analytics.satisfactionTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#DFEAF0" />
                          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="avgOverall" name="متوسط الرضا" stroke="#087F8C" strokeWidth={3} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className={cardClass}>
                  <h3 className="text-sm font-black text-[#172B3A] mb-4">توزيع إجابات الترشيح (هل ترشح المركز؟)</h3>
                  {analytics.totalEvaluations === 0 ? (
                    <p className="text-xs text-[#718394] text-center py-12">لا توجد تقييمات مسجلة بعد</p>
                  ) : (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.recommendationDistribution}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#DFEAF0" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="count" name="عدد المرضى" fill="#1769AA" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. PATIENT EVALUATIONS TAB */}
          {subTab === 'evaluations' && (
            <div className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h3 className="text-lg font-black text-[#172B3A]">
                  سجل تقييمات المرضى (<span className="fv-num">{filteredEvaluations.length}</span>)
                </h3>
                {!canViewPatientDetails && (
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                    <ShieldCheck size={14} />
                    بيانات المريض الشخصية محجوبة لعدم وجود صلاحية عرض التفاصيل
                  </span>
                )}
              </div>

              {filteredEvaluations.length === 0 ? (
                <p className="text-center text-[#718394] py-12 font-bold text-sm">لا توجد تقييمات مطابقة لمعايير البحث</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#F5FAFC] text-[#718394] font-bold border-b border-[#DFEAF0]">
                      <tr>
                        <th className="p-3.5">المرجع</th>
                        <th className="p-3.5">التاريخ</th>
                        <th className="p-3.5">المريض</th>
                        <th className="p-3.5">الطبيب</th>
                        <th className="p-3.5">النوع</th>
                        <th className="p-3.5">الرضا العام</th>
                        <th className="p-3.5">الطبيب</th>
                        <th className="p-3.5">الاستقبال</th>
                        <th className="p-3.5">الانتظار</th>
                        <th className="p-3.5 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DFEAF0]/70">
                      {filteredEvaluations.map((ev) => {
                        const idInfo = maskPatientIdentity(ev, canViewPatientDetails);
                        return (
                          <tr key={ev.id} className="hover:bg-[#F5FAFC] transition-colors">
                            <td className="p-3.5 font-bold text-[#087F8C] fv-mono" dir="ltr">{ev.evaluationCode}</td>
                            <td className="p-3.5 text-[#718394] fv-num">{ev.visitDate || ev.createdAt.slice(0, 10)}</td>
                            <td className="p-3.5">
                              <div className="font-bold text-[#172B3A]">{idInfo.displayName}</div>
                              <div className="text-[11px] text-[#718394] fv-num">{idInfo.displayPhone}</div>
                            </td>
                            <td className="p-3.5 font-bold text-[#172B3A]">{ev.doctorName || '-'}</td>
                            <td className="p-3.5 font-bold">{FEEDBACK_TYPE_LABELS[ev.feedbackType] || ev.feedbackType}</td>
                            <td className="p-3.5 font-black text-[#172B3A] fv-num">{ev.overallSatisfaction} / 5</td>
                            <td className="p-3.5 fv-num">{ev.doctorOverallRating ?? '-'}</td>
                            <td className="p-3.5 fv-num">{ev.receptionOverallRating ?? '-'}</td>
                            <td className="p-3.5 fv-num">{ev.waitingTimeRating ?? '-'}</td>
                            <td className="p-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedEval(ev);
                                  setEvalNotesDraft(ev.internalNotes || '');
                                  setEvalStatusDraft(ev.reviewStatus || 'جديد');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#087F8C]/10 text-[#087F8C] hover:bg-[#087F8C]/20 font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye size={13} />
                                تفاصيل
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 3. DOCTOR RATINGS TAB */}
          {subTab === 'doctor-ratings' && (
            <div className="space-y-6">
              <div className={cardClass}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                  <div>
                    <h3 className="text-lg font-black text-[#172B3A]">تقييمات وأداء الأطباء</h3>
                    <p className="text-xs text-[#718394] font-bold mt-1">
                      ملاحظة مهنية: يتم عرض عدد التقييمات دائماً بجانب المتوسط، والتقييم الفردي المنخفض لا يُعد مؤشراً سريرياً منفرداً دون سياق.
                    </p>
                  </div>
                </div>

                {doctorReport.length === 0 ? (
                  <p className="text-center text-[#718394] py-12 text-sm font-bold">لا توجد تقييمات مرتبطة بأطباء بعد</p>
                ) : (
                  <>
                    <div className="h-64 mb-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={doctorReport}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#DFEAF0" />
                          <XAxis dataKey="doctorName" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="avgOverallDoctorRating" name="متوسط تقييم الطبيب" fill="#087F8C" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-[#F5FAFC] text-[#718394] font-bold border-b border-[#DFEAF0]">
                          <tr>
                            <th className="p-3.5">الطبيب</th>
                            <th className="p-3.5">عدد التقييمات</th>
                            <th className="p-3.5">المتوسط العام</th>
                            <th className="p-3.5">التعامل</th>
                            <th className="p-3.5">الشرح</th>
                            <th className="p-3.5">الاهتمام</th>
                            <th className="p-3.5">الوضوح</th>
                            <th className="p-3.5">إيجابي / سلبي</th>
                            <th className="p-3.5">أبرز الموضوعات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#DFEAF0]/70">
                          {doctorReport.map((doc) => (
                            <tr key={doc.doctorName} className="hover:bg-[#F5FAFC]">
                              <td className="p-3.5 font-black text-[#172B3A]">{doc.doctorName}</td>
                              <td className="p-3.5 fv-num font-bold">
                                {doc.evaluationCount}
                                {doc.smallSampleWarning && (
                                  <span className="mr-2 text-[10px] text-amber-700 font-bold">· عينة محدودة</span>
                                )}
                              </td>
                              <td className="p-3.5 font-black text-[#087F8C] fv-num">{doc.avgOverallDoctorRating} / 5</td>
                              <td className="p-3.5 fv-num">{doc.avgTreatment || '-'}</td>
                              <td className="p-3.5 fv-num">{doc.avgExplanation || '-'}</td>
                              <td className="p-3.5 fv-num">{doc.avgAttention || '-'}</td>
                              <td className="p-3.5 fv-num">{doc.avgClarity || '-'}</td>
                              <td className="p-3.5 fv-num">
                                <span className="text-emerald-700 font-bold">{doc.positiveCount}</span> /{' '}
                                <span className="text-red-600 font-bold">{doc.negativeCount}</span>
                              </td>
                              <td className="p-3.5 text-[#718394]">{doc.commonTopics.join(' · ') || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 4. RECEPTION RATINGS TAB */}
          {subTab === 'reception' && (
            <div className="space-y-6">
              <div className={cardClass}>
                <h3 className="text-lg font-black text-[#172B3A] mb-5">تقييمات فريق الاستقبال</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {analytics.receptionBreakdown.map((item) => (
                    <div key={item.criterion} className="bg-[#F5FAFC] rounded-2xl border border-[#DFEAF0] p-4">
                      <p className="text-xs font-bold text-[#718394]">{item.criterion}</p>
                      <p className="text-2xl font-black text-[#172B3A] mt-1 fv-num">
                        {item.avgScore || 0} <span className="text-xs text-[#087F8C]">/ 5</span>
                      </p>
                    </div>
                  ))}
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.receptionBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#DFEAF0" />
                      <XAxis dataKey="criterion" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="avgScore" name="متوسط التقييم" fill="#25B8C7" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* 5. WAITING TIME TAB */}
          {subTab === 'waiting-time' && (
            <div className="space-y-6">
              <div className={cardClass}>
                <h3 className="text-lg font-black text-[#172B3A] mb-5">تحليل أوقات الانتظار</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="bg-[#F5FAFC] rounded-2xl border border-[#DFEAF0] p-4">
                    <p className="text-xs font-bold text-[#718394]">متوسط تقييم وقت الانتظار</p>
                    <p className="text-2xl font-black text-[#172B3A] mt-1 fv-num">{analytics.avgWaitingTimeRating || 0} / 5</p>
                  </div>
                  <div className="bg-[#F5FAFC] rounded-2xl border border-[#DFEAF0] p-4">
                    <p className="text-xs font-bold text-[#718394]">نسبة الرضا عن مدة الانتظار</p>
                    <p className="text-2xl font-black text-emerald-600 mt-1 fv-num">{analytics.waitingSatisfactionRatePct}%</p>
                  </div>
                  <div className="bg-[#F5FAFC] rounded-2xl border border-[#DFEAF0] p-4">
                    <p className="text-xs font-bold text-[#718394]">تقييمات شملت وقت الانتظار</p>
                    <p className="text-2xl font-black text-[#087F8C] mt-1 fv-num">
                      {filteredEvaluations.filter((e) => e.waitingTimeRange || e.waitingTimeRating).length}
                    </p>
                  </div>
                </div>
                <div className="h-64 mb-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.waitingRangeDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#DFEAF0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="عدد المرضى" fill="#1769AA" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2.5">
                  <h4 className="text-sm font-black text-[#172B3A]">ملاحظات المرضى حول التأخير</h4>
                  {filteredEvaluations.filter((e) => e.waitingTimeComment).length === 0 ? (
                    <p className="text-xs text-[#718394] py-4">لا توجد ملاحظات تأخير مسجلة</p>
                  ) : (
                    filteredEvaluations
                      .filter((e) => e.waitingTimeComment)
                      .map((e) => (
                        <div key={e.id} className="p-3.5 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0] text-xs">
                          <div className="flex justify-between font-bold text-[#718394] mb-1">
                            <span>{e.doctorName || 'عام'} · {WAITING_TIME_RANGE_OPTIONS.find((w) => w.value === e.waitingTimeRange)?.labelAr || '-'}</span>
                            <span className="fv-num">{e.visitDate || e.createdAt.slice(0, 10)}</span>
                          </div>
                          <p className="text-[#172B3A] font-medium">{e.waitingTimeComment}</p>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 6. UNIFIED COMPLAINTS & SUGGESTIONS TAB */}
          {subTab === 'complaints' && (
            <div className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-lg font-black text-[#172B3A]">
                    الشكاوى والمقترحات الموحدة (<span className="fv-num">{filteredComplaints.length}</span>)
                  </h3>
                  <p className="text-xs text-[#718394] font-bold mt-0.5">
                    مرتبطة مباشرة بسجل الشكاوى الموحد في لوحة التحكم — أي تحديث هنا ينعكس فوراً في صندوق الشكاوى والعكس
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={filters.complaintCategory || ''}
                    onChange={(e) => setFilters((f) => ({ ...f, complaintCategory: e.target.value }))}
                    className={`${inputClass} py-2 text-xs w-40`}
                  >
                    <option value="">كل التصنيفات</option>
                    {COMPLAINT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    value={filters.complaintStatus || ''}
                    onChange={(e) => setFilters((f) => ({ ...f, complaintStatus: e.target.value }))}
                    className={`${inputClass} py-2 text-xs w-44`}
                  >
                    <option value="">كل الحالات</option>
                    {COMPLAINT_LIFECYCLE_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredComplaints.length === 0 ? (
                <p className="text-center text-[#718394] py-12 font-bold text-sm">لا توجد شكاوى أو مقترحات مطابقة</p>
              ) : (
                <div className="space-y-3">
                  {filteredComplaints.map((c) => {
                    const idInfo = maskPatientIdentity(c, canViewPatientDetails);
                    const priorityMeta = COMPLAINT_PRIORITY_LABELS[c.priority] || COMPLAINT_PRIORITY_LABELS.medium;
                    return (
                      <div key={c.dbId} className="p-4 rounded-2xl border border-[#DFEAF0] bg-[#F5FAFC] hover:bg-white transition-colors">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                              <span className="text-[#087F8C] fv-mono" dir="ltr">{c.referenceNumber}</span>
                              <span aria-hidden="true">·</span>
                              <span className={c.type === 'complaint' ? 'text-red-600' : 'text-[#1769AA]'}>
                                {c.type === 'complaint' ? 'شكوى' : 'اقتراح'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#172B3A]">{c.category}</span>
                              <span aria-hidden="true">·</span>
                              <span className={`px-2 py-0.5 rounded-md border text-[11px] ${priorityMeta.badge}`}>
                                أولوية: {priorityMeta.label}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md border text-[11px] ${COMPLAINT_STATUS_BADGE[c.status] || 'bg-white border-[#DFEAF0]'}`}>
                                {c.status}
                              </span>
                            </div>
                            <div className="text-sm font-black text-[#172B3A]">
                              {idInfo.displayName} <span className="text-xs font-bold text-[#718394] fv-num">({idInfo.displayPhone})</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#718394] fv-num">{c.date}</span>
                            {canAccessAnyComplaint && (
                              <button
                                type="button"
                                onClick={() => openComplaintModal(c)}
                                className="fv-btn-primary px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                <ClipboardCheck size={14} />
                                إدارة ومتابعة
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-[#172B3A] mt-3 bg-white p-3.5 rounded-xl border border-[#DFEAF0] leading-relaxed">
                          {c.message}
                        </p>
                        {(c.assignedStaffName || c.resolutionNote || c.rejectionReason) && (
                          <div className="mt-2.5 flex flex-wrap gap-4 text-xs font-bold text-[#718394]">
                            {c.assignedStaffName && <span>المسؤول: <strong className="text-[#172B3A]">{c.assignedStaffName}</strong></span>}
                            {c.followupDate && <span className="fv-num">موعد المتابعة: <strong className="text-[#172B3A]">{c.followupDate}</strong></span>}
                            {c.resolutionNote && <span>الحل: <strong className="text-emerald-700">{c.resolutionNote}</strong></span>}
                            {c.rejectionReason && <span>سبب الرفض: <strong className="text-rose-700">{c.rejectionReason}</strong></span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 7. COMPLAINT FOLLOW-UP TAB */}
          {subTab === 'followups' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {[
                  { label: 'شكاوى جديدة', value: analytics.complaintIndicators.newComplaints, cls: 'text-red-600' },
                  { label: 'شكاوى مفتوحة', value: analytics.complaintIndicators.openComplaints, cls: 'text-amber-600' },
                  { label: 'بانتظار إجراء', value: analytics.complaintIndicators.awaitingActionComplaints, cls: 'text-[#1769AA]' },
                  { label: 'شكاوى متأخرة', value: analytics.complaintIndicators.overdueComplaints, cls: 'text-rose-700' },
                  { label: 'تم الحل / مغلقة', value: analytics.complaintIndicators.resolvedComplaints, cls: 'text-emerald-600' },
                  { label: 'متوسط زمن الحل (ساعة)', value: analytics.complaintIndicators.avgResolutionHours, cls: 'text-[#172B3A]' },
                ].map((m) => (
                  <div key={m.label} className="bg-white rounded-2xl border border-[#DFEAF0] p-4">
                    <p className="text-[11px] font-bold text-[#718394]">{m.label}</p>
                    <p className={`text-xl font-black mt-1 fv-num ${m.cls}`}>{m.value}</p>
                  </div>
                ))}
              </div>

              <div className={cardClass}>
                <h3 className="text-lg font-black text-[#172B3A] mb-4">سجل إجراءات ومتابعات الشكاوى ({followups.length})</h3>
                {followups.length === 0 ? (
                  <p className="text-center text-[#718394] py-8 text-sm font-bold">لم يتم تسجيل إجراءات متابعة بعد</p>
                ) : (
                  <div className="space-y-3">
                    {followups.map((f) => {
                      const linkedCmp = complaints.find((c) => c.dbId === f.complaintId);
                      return (
                        <div key={f.id} className="p-4 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0] text-xs space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                            <span className="text-[#087F8C] fv-mono" dir="ltr">
                              {linkedCmp?.referenceNumber || f.complaintId.slice(-8)}
                            </span>
                            <span className="text-[#172B3A]">
                              بواسطة: {f.createdByStaffName || 'موظف'} · الحالة: {f.statusAfter || '-'}
                            </span>
                            <span className="text-[#718394] fv-num">{new Date(f.createdAt).toLocaleString('ar-EG')}</span>
                          </div>
                          {f.actionTaken && <p className="font-bold text-[#172B3A]">الإجراء المتخذ: {f.actionTaken}</p>}
                          {f.note && <p className="text-[#718394]">{f.note}</p>}
                          <div className="flex flex-wrap gap-4 text-[11px] text-[#718394] font-bold">
                            <span>تواصل مع المريض: {f.patientContacted ? 'نعم' : 'لا'}</span>
                            {f.followupDate && <span className="fv-num">متابعة قادمة: {f.followupDate}</span>}
                            {f.patientSatisfaction && <span className="fv-num">رضا المريض عن الحل: {f.patientSatisfaction}/5</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 8. NON-RETURN REASONS TAB */}
          {subTab === 'non-return' && (
            <div className="space-y-6">
              <div className={cardClass}>
                <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                  <div>
                    <h3 className="text-lg font-black text-[#172B3A]">أسباب عدم عودة المرضى</h3>
                    <p className="text-xs font-bold text-[#718394] mt-1">
                      تعتمد هذه القائمة حصراً على الأسباب المؤكدة التي صرح بها المريض أو سُجلت أثناء مكالمة متابعة، ولا تُصنّف قلة الزيارات تلقائياً كعدم رضا.
                    </p>
                  </div>
                </div>

                {analytics.nonReturnDistribution.length === 0 ? (
                  <p className="text-center text-[#718394] py-8 text-sm font-bold">لا توجد أسباب مسجلة بعد</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.nonReturnDistribution} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#DFEAF0" />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="reason" width={150} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="patientCount" name="تقييم المريض" stackId="a" fill="#087F8C" />
                          <Bar dataKey="callCount" name="مكالمة متابعة" stackId="a" fill="#F59E0B" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-[#DFEAF0]">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-[#F5FAFC] text-[#718394] font-bold border-b border-[#DFEAF0]">
                          <tr>
                            <th className="p-3">السبب المؤكد</th>
                            <th className="p-3">الإجمالي</th>
                            <th className="p-3">إجابة المريض</th>
                            <th className="p-3">مكالمة متابعة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#DFEAF0]/70">
                          {analytics.nonReturnDistribution.map((row) => (
                            <tr key={row.reason}>
                              <td className="p-3 font-bold text-[#172B3A]">{row.reason}</td>
                              <td className="p-3 font-black fv-num">{row.totalCount}</td>
                              <td className="p-3 text-[#087F8C] font-bold fv-num">{row.patientCount}</td>
                              <td className="p-3 text-amber-700 font-bold fv-num">{row.callCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {canManageFollowups && (
                  <div className="pt-5 border-t border-[#DFEAF0]">
                    <h4 className="text-sm font-black text-[#172B3A] mb-3 flex items-center gap-2">
                      <PhoneCall size={16} className="text-[#087F8C]" />
                      تسجيل سبب عدم عودة مؤكد أثناء مكالمة متابعة
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <select
                        value={callReasonForm.reasonCode}
                        onChange={(e) => setCallReasonForm((f) => ({ ...f, reasonCode: e.target.value }))}
                        className={inputClass}
                      >
                        <option value="">اختر السبب الرئيسي...</option>
                        {NON_RETURN_REASONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <select
                        value={callReasonForm.doctorName}
                        onChange={(e) => setCallReasonForm((f) => ({ ...f, doctorName: e.target.value }))}
                        className={inputClass}
                      >
                        <option value="">الطبيب المعني (اختياري)</option>
                        {doctors.map((d) => (
                          <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={callReasonForm.explanation}
                        onChange={(e) => setCallReasonForm((f) => ({ ...f, explanation: e.target.value }))}
                        className={inputClass}
                        placeholder="توضيح المريض أثناء المكالمة (اختياري)"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveCallReason()}
                      disabled={savingCallReason}
                      className="mt-3 fv-btn-primary px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <Plus size={14} />
                      {savingCallReason ? 'جاري الحفظ...' : 'حفظ السبب من مكالمة المتابعة'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 9. SATISFACTION REPORTS TAB */}
          {subTab === 'reports' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={cardClass}>
                <h3 className="text-sm font-black text-[#172B3A] mb-4">توزيع تصنيفات الشكاوى والمقترحات</h3>
                {analytics.complaintCategoryDistribution.length === 0 ? (
                  <p className="text-xs text-[#718394] text-center py-12">لا توجد بيانات شكاوى بعد</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.complaintCategoryDistribution}
                          dataKey="count"
                          nameKey="category"
                          outerRadius={88}
                          label
                        >
                          {analytics.complaintCategoryDistribution.map((_, idx) => (
                            <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className={cardClass}>
                <h3 className="text-sm font-black text-[#172B3A] mb-4">أداء الاستقبال مقابل أوقات الانتظار</h3>
                <div className="space-y-3">
                  {analytics.receptionBreakdown.map((item) => (
                    <div key={item.criterion} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-[#172B3A]">{item.criterion}</span>
                        <span className="text-[#087F8C] fv-num">{item.avgScore} / 5</span>
                      </div>
                      <div className="h-2.5 bg-[#F5FAFC] rounded-full overflow-hidden border border-[#DFEAF0]">
                        <div
                          className="h-full bg-[#087F8C] rounded-full transition-all"
                          style={{ width: `${Math.min(100, (item.avgScore / 5) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="space-y-1 pt-2 border-t border-[#DFEAF0]">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-[#172B3A]">تقييم وقت الانتظار العام</span>
                      <span className="text-[#1769AA] fv-num">{analytics.avgWaitingTimeRating} / 5</span>
                    </div>
                    <div className="h-2.5 bg-[#F5FAFC] rounded-full overflow-hidden border border-[#DFEAF0]">
                      <div
                        className="h-full bg-[#1769AA] rounded-full transition-all"
                        style={{ width: `${Math.min(100, (analytics.avgWaitingTimeRating / 5) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 10. EVALUATION SETTINGS TAB */}
          {subTab === 'settings' && settingsDraft && (
            <div className={cardClass}>
              <h3 className="text-lg font-black text-[#172B3A] mb-5">إعدادات التقييم العام والروابط</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {[
                  { key: 'publicFormEnabled', label: 'تفعيل صفحة التقييم العام للزوار' },
                  { key: 'allowAnonymousSubmission', label: 'السماح بإرسال التقييم بدون كتابة الاسم في التقييمات العامة' },
                  { key: 'requirePhoneForComplaint', label: 'اشتراط رقم الهاتف عند تسجيل شكوى أو اقتراح' },
                  { key: 'showWaitingTimeSection', label: 'إظهار قسم تقييم وقت الانتظار' },
                  { key: 'showNonReturnQuestion', label: 'إظهار سؤال أسباب عدم العودة' },
                  { key: 'autoCreateComplaintOnLowRating', label: 'إنشاء سجل شكوى تلقائياً عند التقييم المنخفض' },
                ].map((toggle) => (
                  <label
                    key={toggle.key}
                    className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0] cursor-pointer"
                  >
                    <span className="text-xs font-bold text-[#172B3A]">{toggle.label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean((settingsDraft as any)[toggle.key])}
                      onChange={(e) =>
                        setSettingsDraft((prev) => (prev ? { ...prev, [toggle.key]: e.target.checked } : prev))
                      }
                      className="w-4 h-4 accent-[#087F8C]"
                    />
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-[#718394] mb-1.5">حد منع التكرار لنفس الهاتف (بالدقائق)</label>
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={settingsDraft.rateLimitMinutes}
                    onChange={(e) =>
                      setSettingsDraft((prev) =>
                        prev ? { ...prev, rateLimitMinutes: Number(e.target.value) || 0 } : prev,
                      )
                    }
                    className={`${inputClass} fv-num`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#718394] mb-1.5">حد التقييم المنخفض لإنشاء الشكوى التلقائية (من 5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={settingsDraft.lowRatingThreshold}
                    onChange={(e) =>
                      setSettingsDraft((prev) =>
                        prev ? { ...prev, lowRatingThreshold: Number(e.target.value) || 2 } : prev,
                      )
                    }
                    className={`${inputClass} fv-num`}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-[#718394] mb-1.5">رسالة الترحيب في نموذج التقييم (عربي)</label>
                  <input
                    type="text"
                    value={settingsDraft.welcomeMessageAr}
                    onChange={(e) =>
                      setSettingsDraft((prev) => (prev ? { ...prev, welcomeMessageAr: e.target.value } : prev))
                    }
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-[#718394] mb-1.5">رسالة الشكر بعد الإرسال (عربي)</label>
                  <input
                    type="text"
                    value={settingsDraft.thankYouMessageAr}
                    onChange={(e) =>
                      setSettingsDraft((prev) => (prev ? { ...prev, thankYouMessageAr: e.target.value } : prev))
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0] flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                  <p className="text-xs font-black text-[#172B3A]">الرابط المباشر لصفحة التقييم العام</p>
                  <p className="text-xs text-[#087F8C] fv-mono mt-0.5" dir="ltr">{directEvaluationLink}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyLink(directEvaluationLink)}
                  className="px-4 py-2 rounded-xl bg-white border border-[#DFEAF0] text-xs font-bold text-[#172B3A] hover:border-[#087F8C] flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy size={14} className="text-[#087F8C]" />
                  نسخ الرابط
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleSaveSettings()}
                disabled={savingSettings}
                className="fv-btn-primary px-6 py-3 rounded-xl font-black text-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Save size={16} />
                {savingSettings ? 'جاري الحفظ...' : 'حفظ إعدادات التقييم العام'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Evaluation Detail Modal */}
      {selectedEval && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#DFEAF0] shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#DFEAF0]">
              <div>
                <h3 className="text-lg font-black text-[#172B3A]">تفاصيل التقييم</h3>
                <p className="text-xs font-bold text-[#087F8C] fv-mono" dir="ltr">{selectedEval.evaluationCode}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEval(null)}
                className="p-2 rounded-xl text-[#718394] hover:bg-[#F5FAFC] cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {(() => {
              const idInfo = maskPatientIdentity(selectedEval, canViewPatientDetails);
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-[#F5FAFC] p-4 rounded-2xl border border-[#DFEAF0]">
                  <div><span className="text-[#718394] block">المريض</span><strong className="text-[#172B3A]">{idInfo.displayName}</strong></div>
                  <div><span className="text-[#718394] block">الهاتف</span><strong className="text-[#172B3A] fv-num">{idInfo.displayPhone}</strong></div>
                  <div><span className="text-[#718394] block">الطبيب</span><strong className="text-[#172B3A]">{selectedEval.doctorName || '-'}</strong></div>
                  <div><span className="text-[#718394] block">الرضا العام</span><strong className="text-[#087F8C] fv-num">{selectedEval.overallSatisfaction} / 5</strong></div>
                  <div><span className="text-[#718394] block">تقييم الطبيب</span><strong className="fv-num">{selectedEval.doctorOverallRating ?? '-'} / 5</strong></div>
                  <div><span className="text-[#718394] block">تقييم الاستقبال</span><strong className="fv-num">{selectedEval.receptionOverallRating ?? '-'} / 5</strong></div>
                  <div><span className="text-[#718394] block">الخدمة</span><strong className="fv-num">{selectedEval.serviceOverallRating ?? '-'} / 5</strong></div>
                  <div><span className="text-[#718394] block">وقت الانتظار</span><strong className="fv-num">{selectedEval.waitingTimeRating ?? '-'} / 5</strong></div>
                  <div><span className="text-[#718394] block">الترشيح</span><strong>{RECOMMENDATION_OPTIONS.find((r) => r.value === selectedEval.recommendationChoice)?.labelAr || '-'}</strong></div>
                </div>
              );
            })()}

            {(selectedEval.overallComment || selectedEval.doctorComment || selectedEval.waitingTimeComment || selectedEval.feedbackMessage) && (
              <div className="space-y-2 text-xs">
                {selectedEval.doctorComment && (
                  <div className="p-3 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0]">
                    <span className="font-bold text-[#718394] block mb-1">تعليق حول الطبيب:</span>
                    <p className="text-[#172B3A]">{selectedEval.doctorComment}</p>
                  </div>
                )}
                {selectedEval.waitingTimeComment && (
                  <div className="p-3 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0]">
                    <span className="font-bold text-[#718394] block mb-1">ملاحظة وقت الانتظار:</span>
                    <p className="text-[#172B3A]">{selectedEval.waitingTimeComment}</p>
                  </div>
                )}
                {selectedEval.overallComment && (
                  <div className="p-3 rounded-xl bg-[#F5FAFC] border border-[#DFEAF0]">
                    <span className="font-bold text-[#718394] block mb-1">التعليق العام:</span>
                    <p className="text-[#172B3A]">{selectedEval.overallComment}</p>
                  </div>
                )}
                {selectedEval.feedbackMessage && (
                  <div className="p-3 rounded-xl bg-red-50/70 border border-red-200">
                    <span className="font-bold text-red-700 block mb-1">تفاصيل الشكوى / الاقتراح:</span>
                    <p className="text-[#172B3A]">{selectedEval.feedbackMessage}</p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 pt-3 border-t border-[#DFEAF0]">
              <div>
                <label className="block text-xs font-bold text-[#718394] mb-1">حالة المراجعة الداخلية</label>
                <select
                  value={evalStatusDraft}
                  onChange={(e) => setEvalStatusDraft(e.target.value)}
                  className={inputClass}
                >
                  <option value="جديد">جديد</option>
                  <option value="تمت المراجعة">تمت المراجعة</option>
                  <option value="يتطلب متابعة">يتطلب متابعة</option>
                  <option value="مغلق">مغلق</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#718394] mb-1">ملاحظات الإدارة الداخلية (لا تظهر للجمهور)</label>
                <textarea
                  rows={2}
                  value={evalNotesDraft}
                  onChange={(e) => setEvalNotesDraft(e.target.value)}
                  className={inputClass}
                  placeholder="أضف ملاحظة داخلية لفريق الجودة..."
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveEvaluationReview()}
                  disabled={savingEvalReview}
                  className="fv-btn-primary px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {savingEvalReview ? 'جاري الحفظ...' : 'حفظ المراجعة'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEval(null)}
                  className="px-5 py-2.5 rounded-xl border border-[#DFEAF0] text-[#718394] text-xs font-bold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unified Complaint Workflow & Follow-up Modal */}
      {editingComplaint && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-[#0B1F35]/65 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#DFEAF0] shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6 md:p-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#DFEAF0]">
              <div>
                <h3 className="text-lg font-black text-[#172B3A]">إدارة ومتابعة الشكوى الموحدة</h3>
                <p className="text-xs font-bold text-[#087F8C] fv-mono" dir="ltr">{editingComplaint.referenceNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingComplaint(null)}
                className="p-2 rounded-xl text-[#718394] hover:bg-[#F5FAFC] cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0] text-xs space-y-1">
              <p className="font-black text-[#172B3A]">
                {maskPatientIdentity(editingComplaint, canViewPatientDetails).displayName} ·{' '}
                <span className="fv-num">{maskPatientIdentity(editingComplaint, canViewPatientDetails).displayPhone}</span>
              </p>
              <p className="text-[#172B3A] leading-relaxed">{editingComplaint.message}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#718394] mb-1">حالة الشكوى</label>
                <select
                  value={cmpDraft.status}
                  onChange={(e) => setCmpDraft((d) => ({ ...d, status: e.target.value }))}
                  className={inputClass}
                >
                  {COMPLAINT_LIFECYCLE_STATUSES.map((s) => (
                    <option
                      key={s}
                      value={s}
                      disabled={['تم الحل', 'مغلقة', 'مرفوضة مع توضيح السبب'].includes(s) && !canResolveComplaints}
                    >
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#718394] mb-1">الأولوية</label>
                <select
                  value={cmpDraft.priority}
                  onChange={(e) => setCmpDraft((d) => ({ ...d, priority: e.target.value as ComplaintPriority }))}
                  className={inputClass}
                >
                  <option value="low">منخفضة</option>
                  <option value="medium">متوسطة</option>
                  <option value="high">عالية</option>
                  <option value="urgent">عاجلة</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#718394] mb-1">التصنيف</label>
                <select
                  value={cmpDraft.category}
                  onChange={(e) => setCmpDraft((d) => ({ ...d, category: e.target.value }))}
                  className={inputClass}
                >
                  {COMPLAINT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#718394] mb-1">تعيين الموظف المسؤول</label>
                <select
                  value={cmpDraft.assignedStaffId}
                  disabled={!canAssignComplaints}
                  onChange={(e) => setCmpDraft((d) => ({ ...d, assignedStaffId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">غير معين</option>
                  {staffMembers
                    .filter((s) => s.is_active !== false)
                    .map((s) => (
                      <option key={s.user_id} value={s.user_id}>{s.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#718394] mb-1">موعد المتابعة القادم</label>
                <input
                  type="date"
                  value={cmpDraft.followupDate}
                  onChange={(e) => setCmpDraft((d) => ({ ...d, followupDate: e.target.value }))}
                  className={`${inputClass} fv-num`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#718394] mb-1">رضا المريض عن الحل (1–5)</label>
                <select
                  value={cmpDraft.patientSatisfaction}
                  onChange={(e) =>
                    setCmpDraft((d) => ({
                      ...d,
                      patientSatisfaction: e.target.value ? Number(e.target.value) : '',
                    }))
                  }
                  className={inputClass}
                >
                  <option value="">لم يُقَس بعد</option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>{n} / 5</option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-bold text-[#172B3A] cursor-pointer">
              <input
                type="checkbox"
                checked={cmpDraft.patientContacted}
                onChange={(e) => setCmpDraft((d) => ({ ...d, patientContacted: e.target.checked }))}
                className="w-4 h-4 accent-[#087F8C]"
              />
              <span>تم التواصل مع المريض ومتابعته هاتفياً</span>
            </label>

            <div>
              <label className="block text-xs font-bold text-[#718394] mb-1">الإجراء المتخذ في هذه المتابعة</label>
              <input
                type="text"
                value={cmpDraft.actionTaken}
                onChange={(e) => setCmpDraft((d) => ({ ...d, actionTaken: e.target.value }))}
                className={inputClass}
                placeholder="مثال: تم التواصل مع الطبيب المختص وجدولة موعد بديل..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#718394] mb-1">ملاحظة المتابعة</label>
              <textarea
                rows={2}
                value={cmpDraft.followupNote}
                onChange={(e) => setCmpDraft((d) => ({ ...d, followupNote: e.target.value }))}
                className={inputClass}
                placeholder="تفاصيل المتابعة أو مكالمة المريض..."
              />
            </div>

            {cmpDraft.status === 'مرفوضة مع توضيح السبب' && (
              <div>
                <label className="block text-xs font-bold text-rose-700 mb-1">سبب الرفض <span className="text-red-500">*</span></label>
                <textarea
                  rows={2}
                  value={cmpDraft.rejectionReason}
                  onChange={(e) => setCmpDraft((d) => ({ ...d, rejectionReason: e.target.value }))}
                  className={inputClass}
                  placeholder="يجب توضيح سبب رفض الشكوى..."
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#718394] mb-1">
                تفاصيل الحل النهائي {cmpDraft.status === 'تم الحل' && <span className="text-red-500">*</span>}
              </label>
              <textarea
                rows={2}
                value={cmpDraft.resolutionNote}
                onChange={(e) => setCmpDraft((d) => ({ ...d, resolutionNote: e.target.value }))}
                className={inputClass}
                placeholder="ملخص الحل المعتمد لإغلاق الشكوى..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#718394] mb-1">ملاحظات الإدارة الداخلية (لا تظهر للعموم)</label>
              <textarea
                rows={2}
                value={cmpDraft.internalNotes}
                onChange={(e) => setCmpDraft((d) => ({ ...d, internalNotes: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0] space-y-2">
              <label className="block text-xs font-bold text-[#172B3A]">
                هل ذكر المريض سبباً لعدم العودة أثناء المكالمة؟ (اختياري)
              </label>
              <select
                value={cmpDraft.nonReturnReason}
                onChange={(e) => setCmpDraft((d) => ({ ...d, nonReturnReason: e.target.value }))}
                className={inputClass}
              >
                <option value="">لا يوجد</option>
                {NON_RETURN_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              {cmpDraft.nonReturnReason && (
                <input
                  type="text"
                  value={cmpDraft.nonReturnExplanation}
                  onChange={(e) => setCmpDraft((d) => ({ ...d, nonReturnExplanation: e.target.value }))}
                  className={inputClass}
                  placeholder="توضيح إضافي من المكالمة..."
                />
              )}
            </div>

            <div className="flex gap-3 pt-3 border-t border-[#DFEAF0]">
              <button
                type="button"
                onClick={() => void handleSaveComplaintUpdate()}
                disabled={savingComplaint}
                className="flex-1 fv-btn-primary py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <CheckCircle size={17} />
                {savingComplaint ? 'جاري الحفظ...' : 'حفظ ومزامنة الشكوى'}
              </button>
              <button
                type="button"
                onClick={() => setEditingComplaint(null)}
                className="px-6 py-3 rounded-xl border border-[#DFEAF0] text-[#718394] font-bold text-sm cursor-pointer"
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

export default GeneralEvaluationHub;
