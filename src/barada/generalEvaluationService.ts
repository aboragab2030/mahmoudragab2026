import { supabase } from '@/integrations/supabase/client';
import { ensureClinicErpSchemaReady } from './patientsService';
import { cairoTodayStr } from './dateUtils';
import { mapComplaintRow } from './clinicRecords';
import { exportRowsToCsv, exportRowsToExcel } from './accountingService';

export type EvaluationFeedbackType = 'evaluation' | 'positive_comment' | 'suggestion' | 'complaint';
export type WaitingTimeRange = '<15' | '15-30' | '30-60' | '>60' | 'not_sure';
export type RecommendationChoice =
  | 'definitely_yes'
  | 'probably_yes'
  | 'not_sure'
  | 'probably_no'
  | 'definitely_no';

export type ComplaintLifecycleStatus =
  | 'جديدة'
  | 'قيد المراجعة'
  | 'تم تعيين مسؤول'
  | 'جاري الحل'
  | 'بانتظار رد المريض'
  | 'تم الحل'
  | 'مغلقة'
  | 'مرفوضة مع توضيح السبب';

export type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent';

export const WAITING_TIME_RANGE_OPTIONS: { value: WaitingTimeRange; labelAr: string; labelEn: string }[] = [
  { value: '<15', labelAr: 'أقل من 15 دقيقة', labelEn: 'Less than 15 minutes' },
  { value: '15-30', labelAr: '15 – 30 دقيقة', labelEn: '15–30 minutes' },
  { value: '30-60', labelAr: '30 – 60 دقيقة', labelEn: '30–60 minutes' },
  { value: '>60', labelAr: 'أكثر من 60 دقيقة', labelEn: 'More than 60 minutes' },
  { value: 'not_sure', labelAr: 'غير متأكد', labelEn: 'Not sure' },
];

export const RECOMMENDATION_OPTIONS: { value: RecommendationChoice; labelAr: string; labelEn: string }[] = [
  { value: 'definitely_yes', labelAr: 'بالتأكيد نعم', labelEn: 'Definitely yes' },
  { value: 'probably_yes', labelAr: 'غالباً نعم', labelEn: 'Probably yes' },
  { value: 'not_sure', labelAr: 'غير متأكد', labelEn: 'Not sure' },
  { value: 'probably_no', labelAr: 'غالباً لا', labelEn: 'Probably no' },
  { value: 'definitely_no', labelAr: 'بالتأكيد لا', labelEn: 'Definitely no' },
];

export const COMPLAINT_CATEGORIES = [
  'الطبيب',
  'الاستقبال',
  'مدة الانتظار',
  'الخدمة الطبية',
  'الحجز',
  'الخدمات المالية',
  'تعامل الموظفين',
  'النظافة والمرافق',
  'أخرى',
] as const;

export const COMPLAINT_LIFECYCLE_STATUSES: ComplaintLifecycleStatus[] = [
  'جديدة',
  'قيد المراجعة',
  'تم تعيين مسؤول',
  'جاري الحل',
  'بانتظار رد المريض',
  'تم الحل',
  'مغلقة',
  'مرفوضة مع توضيح السبب',
];

export const COMPLAINT_PRIORITY_LABELS: Record<ComplaintPriority, { label: string; badge: string }> = {
  low: { label: 'منخفضة', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
  medium: { label: 'متوسطة', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  high: { label: 'عالية', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  urgent: { label: 'عاجلة', badge: 'bg-red-50 text-red-700 border-red-200' },
};

export const COMPLAINT_STATUS_BADGE: Record<string, string> = {
  'جديدة': 'bg-red-50 text-red-700 border-red-200',
  'قيد المراجعة': 'bg-amber-50 text-amber-800 border-amber-200',
  'تم تعيين مسؤول': 'bg-sky-50 text-sky-700 border-sky-200',
  'جاري الحل': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'بانتظار رد المريض': 'bg-purple-50 text-purple-700 border-purple-200',
  'تم الحل': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'مغلقة': 'bg-slate-100 text-slate-700 border-slate-200',
  'مرفوضة مع توضيح السبب': 'bg-rose-50 text-rose-700 border-rose-200',
};

export const NON_RETURN_REASONS = [
  'طول فترة الانتظار',
  'تكلفة الكشف أو الخدمة',
  'صعوبة الحجز',
  'عدم الرضا عن التعامل',
  'عدم الرضا عن الخدمة الطبية',
  'عدم وضوح المعلومات أو التعليمات',
  'صعوبة الوصول إلى المركز',
  'عدم توافر الطبيب في الموعد المناسب',
  'تجربة سلبية سابقة',
  'تلقي الخدمة في مركز آخر',
  'سبب شخصي',
  'سبب آخر',
] as const;

export const FEEDBACK_TYPE_LABELS: Record<EvaluationFeedbackType, string> = {
  evaluation: 'تقييم عام',
  positive_comment: 'تعليق إيجابي',
  suggestion: 'اقتراح',
  complaint: 'شكوى',
};

export interface PublicEvaluationConfig {
  publicFormEnabled: boolean;
  allowAnonymousSubmission: boolean;
  requirePhoneForComplaint: boolean;
  showNonReturnQuestion: boolean;
  showWaitingTimeSection: boolean;
  welcomeMessageAr: string;
  welcomeMessageEn: string;
  thankYouMessageAr: string;
  thankYouMessageEn: string;
}

export interface EvaluationSettingsRecord extends PublicEvaluationConfig {
  id: number;
  rateLimitMinutes: number;
  autoCreateComplaintOnLowRating: boolean;
  lowRatingThreshold: number;
  updatedAt?: string;
}

export interface EvaluationRecord {
  id: string;
  evaluationCode: string;
  submissionChannel: string;
  feedbackType: EvaluationFeedbackType;
  patientId?: string;
  bookingId?: string;
  patientName: string;
  patientPhone: string;
  patientFileNumber?: string;
  doctorId?: string;
  doctorName?: string;
  serviceName?: string;
  visitDate?: string;
  appointmentRef?: string;
  doctorTreatmentRating?: number;
  doctorExplanationRating?: number;
  doctorAttentionRating?: number;
  doctorClarityRating?: number;
  doctorOverallRating?: number;
  doctorComment?: string;
  serviceQualityRating?: number;
  staffCooperationRating?: number;
  proceduresEaseRating?: number;
  serviceOverallRating?: number;
  receptionTreatmentRating?: number;
  receptionRespectRating?: number;
  receptionSpeedRating?: number;
  receptionHelpfulnessRating?: number;
  receptionOverallRating?: number;
  waitingTimeRange?: WaitingTimeRange | string;
  actualWaitMinutes?: number;
  waitingTimeSatisfied?: boolean;
  waitingTimeRating?: number;
  waitingTimeComment?: string;
  overallSatisfaction: number;
  overallComment?: string;
  recommendationChoice: RecommendationChoice | string;
  nonReturnReason?: string;
  nonReturnExplanation?: string;
  complaintId?: string;
  complaintCategory?: string;
  complaintPriority?: ComplaintPriority;
  feedbackMessage?: string;
  contactConsent: boolean;
  reviewStatus: string;
  internalNotes?: string;
  createdByStaffName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationComplaintRecord {
  id: number;
  dbId: string;
  name: string;
  phone: string;
  type: 'complaint' | 'suggestion';
  message: string;
  date: string;
  createdAt?: string;
  referenceNumber: string;
  source: 'contact_form' | 'evaluation' | 'staff';
  category: string;
  priority: ComplaintPriority;
  status: ComplaintLifecycleStatus | string;
  patientId?: string;
  bookingId?: string;
  evaluationId?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  resolutionNote?: string;
  rejectionReason?: string;
  internalNotes?: string;
  patientContacted: boolean;
  patientContactedAt?: string;
  patientResolutionSatisfaction?: number;
  followupDate?: string;
  resolvedAt?: string;
  updatedAt?: string;
}

export interface EvaluationFollowupRecord {
  id: string;
  complaintId: string;
  evaluationId?: string;
  actionType: string;
  statusAfter?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  followupDate?: string;
  actionTaken?: string;
  note?: string;
  patientContacted: boolean;
  patientSatisfaction?: number;
  createdByStaffId?: string;
  createdByStaffName?: string;
  createdAt: string;
}

export interface NonReturnReasonRecord {
  id: string;
  evaluationId?: string;
  patientId?: string;
  bookingId?: string;
  doctorName?: string;
  reasonCode: string;
  explanation?: string;
  source: 'patient_evaluation' | 'followup_call';
  recordedByStaffId?: string;
  recordedByStaffName?: string;
  recordedAt: string;
}

export interface SubmitEvaluationPayload {
  idempotency_key: string;
  submission_channel?: 'public_nav' | 'direct_link' | 'booking_link' | 'staff_entry';
  feedback_type: EvaluationFeedbackType;
  patient_name: string;
  patient_phone: string;
  patient_file_number?: string;
  doctor_name?: string;
  service_name?: string;
  visit_date?: string;
  appointment_ref?: string;
  booking_id?: string;
  booking_token?: string;
  doctor_treatment_rating?: number;
  doctor_explanation_rating?: number;
  doctor_attention_rating?: number;
  doctor_clarity_rating?: number;
  doctor_comment?: string;
  service_quality_rating?: number;
  staff_cooperation_rating?: number;
  procedures_ease_rating?: number;
  reception_treatment_rating?: number;
  reception_respect_rating?: number;
  reception_speed_rating?: number;
  reception_helpfulness_rating?: number;
  waiting_time_range?: WaitingTimeRange;
  actual_wait_minutes?: number | null;
  waiting_time_satisfied?: boolean | null;
  waiting_time_rating?: number;
  waiting_time_comment?: string;
  overall_satisfaction: number;
  overall_comment?: string;
  recommendation_choice: RecommendationChoice;
  non_return_reason?: string;
  non_return_explanation?: string;
  complaint_category?: string;
  complaint_priority?: ComplaintPriority;
  feedback_message?: string;
  contact_consent: boolean;
  client_fingerprint_hash?: string;
}

export interface EvaluationFilters {
  startDate?: string;
  endDate?: string;
  doctorName?: string;
  serviceName?: string;
  feedbackType?: string;
  minRating?: number;
  maxRating?: number;
  complaintCategory?: string;
  complaintStatus?: string;
  assignedStaffId?: string;
  search?: string;
}

const numOrUndef = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export const mapEvaluationRow = (r: Record<string, unknown>): EvaluationRecord => ({
  id: String(r.id || ''),
  evaluationCode: String(r.evaluation_code || ''),
  submissionChannel: String(r.submission_channel || 'public_nav'),
  feedbackType: (String(r.feedback_type || 'evaluation') as EvaluationFeedbackType),
  patientId: r.patient_id ? String(r.patient_id) : undefined,
  bookingId: r.booking_id ? String(r.booking_id) : undefined,
  patientName: String(r.patient_name || 'مريض زائر'),
  patientPhone: String(r.patient_phone || ''),
  patientFileNumber: r.patient_file_number ? String(r.patient_file_number) : undefined,
  doctorId: r.doctor_id ? String(r.doctor_id) : undefined,
  doctorName: r.doctor_name ? String(r.doctor_name) : undefined,
  serviceName: r.service_name ? String(r.service_name) : undefined,
  visitDate: r.visit_date ? String(r.visit_date) : undefined,
  appointmentRef: r.appointment_ref ? String(r.appointment_ref) : undefined,
  doctorTreatmentRating: numOrUndef(r.doctor_treatment_rating),
  doctorExplanationRating: numOrUndef(r.doctor_explanation_rating),
  doctorAttentionRating: numOrUndef(r.doctor_attention_rating),
  doctorClarityRating: numOrUndef(r.doctor_clarity_rating),
  doctorOverallRating: numOrUndef(r.doctor_overall_rating),
  doctorComment: r.doctor_comment ? String(r.doctor_comment) : undefined,
  serviceQualityRating: numOrUndef(r.service_quality_rating),
  staffCooperationRating: numOrUndef(r.staff_cooperation_rating),
  proceduresEaseRating: numOrUndef(r.procedures_ease_rating),
  serviceOverallRating: numOrUndef(r.service_overall_rating),
  receptionTreatmentRating: numOrUndef(r.reception_treatment_rating),
  receptionRespectRating: numOrUndef(r.reception_respect_rating),
  receptionSpeedRating: numOrUndef(r.reception_speed_rating),
  receptionHelpfulnessRating: numOrUndef(r.reception_helpfulness_rating),
  receptionOverallRating: numOrUndef(r.reception_overall_rating),
  waitingTimeRange: r.waiting_time_range ? String(r.waiting_time_range) : undefined,
  actualWaitMinutes: numOrUndef(r.actual_wait_minutes),
  waitingTimeSatisfied: typeof r.waiting_time_satisfied === 'boolean' ? r.waiting_time_satisfied : undefined,
  waitingTimeRating: numOrUndef(r.waiting_time_rating),
  waitingTimeComment: r.waiting_time_comment ? String(r.waiting_time_comment) : undefined,
  overallSatisfaction: Number(r.overall_satisfaction || 0),
  overallComment: r.overall_comment ? String(r.overall_comment) : undefined,
  recommendationChoice: String(r.recommendation_choice || 'not_sure'),
  nonReturnReason: r.non_return_reason ? String(r.non_return_reason) : undefined,
  nonReturnExplanation: r.non_return_explanation ? String(r.non_return_explanation) : undefined,
  complaintId: r.complaint_id ? String(r.complaint_id) : undefined,
  complaintCategory: r.complaint_category ? String(r.complaint_category) : undefined,
  complaintPriority: (r.complaint_priority ? String(r.complaint_priority) : 'medium') as ComplaintPriority,
  feedbackMessage: r.feedback_message ? String(r.feedback_message) : undefined,
  contactConsent: r.contact_consent !== false,
  reviewStatus: String(r.review_status || 'جديد'),
  internalNotes: r.internal_notes ? String(r.internal_notes) : undefined,
  createdByStaffName: r.created_by_staff_name ? String(r.created_by_staff_name) : undefined,
  createdAt: String(r.created_at || ''),
  updatedAt: String(r.updated_at || ''),
});

export const mapFollowupRow = (r: Record<string, unknown>): EvaluationFollowupRecord => ({
  id: String(r.id || ''),
  complaintId: String(r.complaint_id || ''),
  evaluationId: r.evaluation_id ? String(r.evaluation_id) : undefined,
  actionType: String(r.action_type || 'followup'),
  statusAfter: r.status_after ? String(r.status_after) : undefined,
  assignedStaffId: r.assigned_staff_id ? String(r.assigned_staff_id) : undefined,
  assignedStaffName: r.assigned_staff_name ? String(r.assigned_staff_name) : undefined,
  followupDate: r.followup_date ? String(r.followup_date) : undefined,
  actionTaken: r.action_taken ? String(r.action_taken) : undefined,
  note: r.note ? String(r.note) : undefined,
  patientContacted: Boolean(r.patient_contacted),
  patientSatisfaction: numOrUndef(r.patient_satisfaction),
  createdByStaffId: r.created_by_staff_id ? String(r.created_by_staff_id) : undefined,
  createdByStaffName: r.created_by_staff_name ? String(r.created_by_staff_name) : undefined,
  createdAt: String(r.created_at || ''),
});

export const mapNonReturnRow = (r: Record<string, unknown>): NonReturnReasonRecord => ({
  id: String(r.id || ''),
  evaluationId: r.evaluation_id ? String(r.evaluation_id) : undefined,
  patientId: r.patient_id ? String(r.patient_id) : undefined,
  bookingId: r.booking_id ? String(r.booking_id) : undefined,
  doctorName: r.doctor_name ? String(r.doctor_name) : undefined,
  reasonCode: String(r.reason_code || ''),
  explanation: r.explanation ? String(r.explanation) : undefined,
  source: (r.source === 'followup_call' ? 'followup_call' : 'patient_evaluation'),
  recordedByStaffId: r.recorded_by_staff_id ? String(r.recorded_by_staff_id) : undefined,
  recordedByStaffName: r.recorded_by_staff_name ? String(r.recorded_by_staff_name) : undefined,
  recordedAt: String(r.recorded_at || r.created_at || ''),
});

export function maskPatientIdentity(
  row: { patientName?: string; name?: string; patientPhone?: string; phone?: string; patientFileNumber?: string; evaluationCode?: string; referenceNumber?: string },
  canViewPatientDetails: boolean,
): { displayName: string; displayPhone: string; displayFile: string } {
  if (canViewPatientDetails) {
    return {
      displayName: row.patientName || row.name || 'مريض زائر',
      displayPhone: row.patientPhone || row.phone || 'غير مسجل',
      displayFile: row.patientFileNumber || '-',
    };
  }
  const ref = row.evaluationCode || row.referenceNumber || 'مجهول';
  return {
    displayName: `مريض (${ref})`,
    displayPhone: 'محجوب (يتطلب صلاحية)',
    displayFile: 'محجوب',
  };
}

export async function fetchPublicEvaluationConfig(): Promise<PublicEvaluationConfig> {
  const defaults: PublicEvaluationConfig = {
    publicFormEnabled: true,
    allowAnonymousSubmission: true,
    requirePhoneForComplaint: true,
    showNonReturnQuestion: true,
    showWaitingTimeSection: true,
    welcomeMessageAr: 'رأيك يهمنا لتطوير جودة الرعاية الطبية والخدمات المقدمة في مركز برادة للعيون',
    welcomeMessageEn: 'Your feedback helps us improve medical care and patient experience at Barada Eye Center',
    thankYouMessageAr: 'شكراً لمشاركتنا تقييمك. ملاحظاتك محل تقدير واهتمام إدارة المركز.',
    thankYouMessageEn: 'Thank you for sharing your evaluation with Barada Eye Center.',
  };

  try {
    const { data, error } = await supabase.rpc('get_public_evaluation_config' as any);
    if (error || !data) return defaults;
    const raw = data as Record<string, unknown>;
    return {
      publicFormEnabled: raw.public_form_enabled !== false,
      allowAnonymousSubmission: raw.allow_anonymous_submission !== false,
      requirePhoneForComplaint: raw.require_phone_for_complaint !== false,
      showNonReturnQuestion: raw.show_non_return_question !== false,
      showWaitingTimeSection: raw.show_waiting_time_section !== false,
      welcomeMessageAr: String(raw.welcome_message_ar || defaults.welcomeMessageAr),
      welcomeMessageEn: String(raw.welcome_message_en || defaults.welcomeMessageEn),
      thankYouMessageAr: String(raw.thank_you_message_ar || defaults.thankYouMessageAr),
      thankYouMessageEn: String(raw.thank_you_message_en || defaults.thankYouMessageEn),
    };
  } catch {
    return defaults;
  }
}

export async function fetchEvaluationBookingContext(
  bookingId: string,
  token: string,
): Promise<{
  valid: boolean;
  bookingId?: string;
  patientName?: string;
  doctorName?: string;
  serviceName?: string;
  visitDate?: string;
}> {
  if (!bookingId || !token) return { valid: false };
  try {
    const { data, error } = await supabase.rpc('get_evaluation_booking_context' as any, {
      _booking_id: bookingId,
      _token: token,
    } as any);
    if (error || !data) return { valid: false };
    const r = data as Record<string, unknown>;
    if (!r.valid) return { valid: false };
    return {
      valid: true,
      bookingId: String(r.booking_id || bookingId),
      patientName: r.patient_name ? String(r.patient_name) : undefined,
      doctorName: r.doctor_name ? String(r.doctor_name) : undefined,
      serviceName: r.service_name ? String(r.service_name) : undefined,
      visitDate: r.visit_date ? String(r.visit_date) : undefined,
    };
  } catch {
    return { valid: false };
  }
}

export async function submitPatientEvaluation(payload: SubmitEvaluationPayload): Promise<{
  ok: boolean;
  deduplicated?: boolean;
  evaluationId?: string;
  evaluationCode?: string;
  complaintId?: string | null;
  complaintReference?: string | null;
}> {
  await ensureClinicErpSchemaReady();
  const { data, error } = await supabase.rpc('submit_patient_experience_evaluation' as any, {
    _payload: payload as unknown as Record<string, unknown>,
  } as any);
  if (error) {
    throw new Error(error.message || 'تعذر إرسال التقييم، يرجى المحاولة مرة أخرى');
  }
  const r = (data || {}) as Record<string, unknown>;
  return {
    ok: r.ok !== false,
    deduplicated: Boolean(r.deduplicated),
    evaluationId: r.evaluation_id ? String(r.evaluation_id) : undefined,
    evaluationCode: r.evaluation_code ? String(r.evaluation_code) : undefined,
    complaintId: r.complaint_id ? String(r.complaint_id) : null,
    complaintReference: r.complaint_reference ? String(r.complaint_reference) : null,
  };
}

export async function loadGeneralEvaluationBundle(options?: {
  canReadComplaints?: boolean;
  canManageSettings?: boolean;
}): Promise<{
  evaluations: EvaluationRecord[];
  complaints: EvaluationComplaintRecord[];
  followups: EvaluationFollowupRecord[];
  nonReturnReasons: NonReturnReasonRecord[];
  settings: EvaluationSettingsRecord;
}> {
  await ensureClinicErpSchemaReady();
  const canReadComplaints = options?.canReadComplaints !== false;

  const [evalRes, cmpRes, folRes, nrRes, setRes] = await Promise.all([
    supabase.from('patient_experience_evaluations' as any).select('*').order('created_at', { ascending: false }),
    canReadComplaints
      ? supabase.from('complaints').select('*').order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from('patient_experience_followups' as any).select('*').order('created_at', { ascending: false }),
    supabase.from('patient_non_return_reasons' as any).select('*').order('recorded_at', { ascending: false }),
    supabase.from('patient_experience_settings' as any).select('*').eq('id', 1).maybeSingle(),
  ]);

  if (evalRes.error && !/does not exist|schema cache/i.test(evalRes.error.message || '')) {
    throw new Error(evalRes.error.message || 'تعذر تحميل التقييمات');
  }

  const rawSettings = (setRes.data || {}) as Record<string, unknown>;
  const settings: EvaluationSettingsRecord = {
    id: 1,
    publicFormEnabled: rawSettings.public_form_enabled !== false,
    allowAnonymousSubmission: rawSettings.allow_anonymous_submission !== false,
    requirePhoneForComplaint: rawSettings.require_phone_for_complaint !== false,
    rateLimitMinutes: Number(rawSettings.rate_limit_minutes ?? 10),
    showNonReturnQuestion: rawSettings.show_non_return_question !== false,
    showWaitingTimeSection: rawSettings.show_waiting_time_section !== false,
    autoCreateComplaintOnLowRating: Boolean(rawSettings.auto_create_complaint_on_low_rating),
    lowRatingThreshold: Number(rawSettings.low_rating_threshold ?? 2),
    welcomeMessageAr: String(rawSettings.welcome_message_ar || 'رأيك يهمنا لتطوير جودة الرعاية الطبية والخدمات المقدمة في مركز برادة للعيون'),
    welcomeMessageEn: String(rawSettings.welcome_message_en || 'Your feedback helps us improve medical care and patient experience at Barada Eye Center'),
    thankYouMessageAr: String(rawSettings.thank_you_message_ar || 'شكراً لمشاركتنا تقييمك. ملاحظاتك محل تقدير واهتمام إدارة المركز.'),
    thankYouMessageEn: String(rawSettings.thank_you_message_en || 'Thank you for sharing your evaluation with Barada Eye Center.'),
    updatedAt: rawSettings.updated_at ? String(rawSettings.updated_at) : undefined,
  };

  return {
    evaluations: Array.isArray(evalRes.data)
      ? (evalRes.data as unknown as Record<string, unknown>[]).map(mapEvaluationRow)
      : [],
    complaints: Array.isArray(cmpRes.data)
      ? (cmpRes.data as unknown as Record<string, unknown>[]).map(mapComplaintRow) as EvaluationComplaintRecord[]
      : [],
    followups: Array.isArray(folRes.data)
      ? (folRes.data as unknown as Record<string, unknown>[]).map(mapFollowupRow)
      : [],
    nonReturnReasons: Array.isArray(nrRes.data)
      ? (nrRes.data as unknown as Record<string, unknown>[]).map(mapNonReturnRow)
      : [],
    settings,
  };
}

export async function updateComplaintWorkflow(
  complaintDbId: string,
  payload: {
    status?: ComplaintLifecycleStatus | string;
    priority?: ComplaintPriority;
    category?: string;
    assigned_staff_id?: string | null;
    assigned_staff_name?: string | null;
    resolution_note?: string;
    rejection_reason?: string;
    internal_notes?: string;
    followup_date?: string | null;
    patient_contacted?: boolean;
    patient_resolution_satisfaction?: number | null;
    action_taken?: string;
    followup_note?: string;
    non_return_reason?: string;
    non_return_explanation?: string;
  },
): Promise<void> {
  await ensureClinicErpSchemaReady();
  const { error } = await supabase.rpc('update_complaint_workflow' as any, {
    _complaint_id: complaintDbId,
    _payload: payload as Record<string, unknown>,
  } as any);
  if (error) {
    throw new Error(error.message || 'تعذر تحديث الشكوى');
  }
}

export async function updateEvaluationReview(
  evaluationId: string,
  patch: { reviewStatus?: string; internalNotes?: string },
): Promise<void> {
  await ensureClinicErpSchemaReady();
  const updateBody: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.reviewStatus !== undefined) updateBody.review_status = patch.reviewStatus;
  if (patch.internalNotes !== undefined) updateBody.internal_notes = patch.internalNotes || null;

  const { error } = await supabase
    .from('patient_experience_evaluations' as any)
    .update(updateBody)
    .eq('id', evaluationId);
  if (error) throw new Error(error.message || 'تعذر تحديث ملاحظات التقييم');
}

export async function recordNonReturnReasonFromCall(input: {
  reasonCode: string;
  explanation?: string;
  doctorName?: string;
  patientId?: string;
  bookingId?: string;
  evaluationId?: string;
  staffId?: string;
  staffName: string;
}): Promise<void> {
  await ensureClinicErpSchemaReady();
  const { error } = await supabase.from('patient_non_return_reasons' as any).insert({
    reason_code: input.reasonCode,
    explanation: input.explanation?.trim() || null,
    doctor_name: input.doctorName?.trim() || null,
    patient_id: input.patientId || null,
    booking_id: input.bookingId || null,
    evaluation_id: input.evaluationId || null,
    source: 'followup_call',
    recorded_by_staff_id: input.staffId || null,
    recorded_by_staff_name: input.staffName || 'موظف',
    recorded_at: new Date().toISOString(),
  } as any);
  if (error) throw new Error(error.message || 'تعذر حفظ سبب عدم العودة');
}

export async function saveEvaluationSettings(
  patch: Partial<EvaluationSettingsRecord>,
  staffId?: string,
): Promise<void> {
  await ensureClinicErpSchemaReady();
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by_staff_id: staffId || null,
  };
  if (patch.publicFormEnabled !== undefined) row.public_form_enabled = patch.publicFormEnabled;
  if (patch.allowAnonymousSubmission !== undefined) row.allow_anonymous_submission = patch.allowAnonymousSubmission;
  if (patch.requirePhoneForComplaint !== undefined) row.require_phone_for_complaint = patch.requirePhoneForComplaint;
  if (patch.rateLimitMinutes !== undefined) row.rate_limit_minutes = Math.max(0, Number(patch.rateLimitMinutes) || 0);
  if (patch.showNonReturnQuestion !== undefined) row.show_non_return_question = patch.showNonReturnQuestion;
  if (patch.showWaitingTimeSection !== undefined) row.show_waiting_time_section = patch.showWaitingTimeSection;
  if (patch.autoCreateComplaintOnLowRating !== undefined) row.auto_create_complaint_on_low_rating = patch.autoCreateComplaintOnLowRating;
  if (patch.lowRatingThreshold !== undefined) row.low_rating_threshold = Math.min(5, Math.max(1, Number(patch.lowRatingThreshold) || 2));
  if (patch.welcomeMessageAr !== undefined) row.welcome_message_ar = patch.welcomeMessageAr;
  if (patch.welcomeMessageEn !== undefined) row.welcome_message_en = patch.welcomeMessageEn;
  if (patch.thankYouMessageAr !== undefined) row.thank_you_message_ar = patch.thankYouMessageAr;
  if (patch.thankYouMessageEn !== undefined) row.thank_you_message_en = patch.thankYouMessageEn;

  const { error } = await supabase
    .from('patient_experience_settings' as any)
    .update(row)
    .eq('id', 1);
  if (error) throw new Error(error.message || 'تعذر حفظ إعدادات التقييم العام');
}

export function filterEvaluations(rows: EvaluationRecord[], filters: EvaluationFilters): EvaluationRecord[] {
  const q = (filters.search || '').trim().toLowerCase();
  return rows.filter((r) => {
    const day = (r.visitDate || r.createdAt || '').slice(0, 10);
    if (filters.startDate && day && day < filters.startDate) return false;
    if (filters.endDate && day && day > filters.endDate) return false;
    if (filters.doctorName && (r.doctorName || '') !== filters.doctorName) return false;
    if (filters.serviceName && (r.serviceName || '') !== filters.serviceName) return false;
    if (filters.feedbackType && r.feedbackType !== filters.feedbackType) return false;
    if (filters.minRating && r.overallSatisfaction < filters.minRating) return false;
    if (filters.maxRating && r.overallSatisfaction > filters.maxRating) return false;
    if (q) {
      const hay = [
        r.evaluationCode,
        r.patientName,
        r.patientPhone,
        r.doctorName,
        r.serviceName,
        r.overallComment,
        r.feedbackMessage,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function filterComplaintsList(rows: EvaluationComplaintRecord[], filters: EvaluationFilters): EvaluationComplaintRecord[] {
  const q = (filters.search || '').trim().toLowerCase();
  return rows.filter((c) => {
    const day = (c.date || c.createdAt || '').slice(0, 10);
    if (filters.startDate && day && day < filters.startDate) return false;
    if (filters.endDate && day && day > filters.endDate) return false;
    if (filters.complaintCategory && c.category !== filters.complaintCategory) return false;
    if (filters.complaintStatus && c.status !== filters.complaintStatus) return false;
    if (filters.assignedStaffId && (c.assignedStaffId || '') !== filters.assignedStaffId) return false;
    if (q) {
      const hay = [c.referenceNumber, c.name, c.phone, c.message, c.category, c.assignedStaffName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const avg = (nums: Array<number | undefined>): number => {
  const valid = nums.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
  if (valid.length === 0) return 0;
  return Math.round((valid.reduce((s, n) => s + n, 0) / valid.length) * 100) / 100;
};

export interface ComplaintIndicators {
  totalComplaintsAndSuggestions: number;
  complaintsCount: number;
  suggestionsCount: number;
  newComplaints: number;
  openComplaints: number;
  awaitingActionComplaints: number;
  overdueComplaints: number;
  resolvedComplaints: number;
  resolutionRatePct: number;
  avgResolutionHours: number;
}

export function computeComplaintIndicators(complaints: EvaluationComplaintRecord[], todayStr = cairoTodayStr()): ComplaintIndicators {
  // Deduplicate strictly by dbId so each complaint record is counted once
  const uniqueMap = new Map<string, EvaluationComplaintRecord>();
  for (const c of complaints) {
    uniqueMap.set(c.dbId || String(c.id), c);
  }
  const unique = Array.from(uniqueMap.values());

  const closedStatuses = new Set(['تم الحل', 'مغلقة', 'مرفوضة مع توضيح السبب']);
  const complaintsOnly = unique.filter((c) => c.type === 'complaint');
  const suggestionsOnly = unique.filter((c) => c.type === 'suggestion');

  let newComplaints = 0;
  let openComplaints = 0;
  let awaitingActionComplaints = 0;
  let overdueComplaints = 0;
  let resolvedComplaints = 0;
  const resolutionHours: number[] = [];

  const nowMs = Date.now();
  for (const c of unique) {
    const status = c.status || 'جديدة';
    const isClosed = closedStatuses.has(status);
    if (status === 'جديدة') newComplaints += 1;
    if (!isClosed) {
      openComplaints += 1;
      if (status === 'جديدة' || status === 'قيد المراجعة' || status === 'بانتظار رد المريض') {
        awaitingActionComplaints += 1;
      }
      const createdMs = c.createdAt ? new Date(c.createdAt).getTime() : NaN;
      const isOverdueDate = Boolean(c.followupDate && c.followupDate < todayStr);
      const isOverdueAge = Number.isFinite(createdMs) && nowMs - createdMs > 48 * 3600 * 1000;
      if (isOverdueDate || isOverdueAge) overdueComplaints += 1;
    } else {
      resolvedComplaints += 1;
      if (status === 'تم الحل' || status === 'مغلقة') {
        const startMs = c.createdAt ? new Date(c.createdAt).getTime() : NaN;
        const endMs = c.resolvedAt ? new Date(c.resolvedAt).getTime() : c.updatedAt ? new Date(c.updatedAt).getTime() : NaN;
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
          resolutionHours.push((endMs - startMs) / 3600000);
        }
      }
    }
  }

  const total = unique.length;
  const resolutionRatePct = total > 0 ? Math.round((resolvedComplaints / total) * 1000) / 10 : 0;
  const avgResolutionHours =
    resolutionHours.length > 0
      ? Math.round((resolutionHours.reduce((s, h) => s + h, 0) / resolutionHours.length) * 10) / 10
      : 0;

  return {
    totalComplaintsAndSuggestions: total,
    complaintsCount: complaintsOnly.length,
    suggestionsCount: suggestionsOnly.length,
    newComplaints,
    openComplaints,
    awaitingActionComplaints,
    overdueComplaints,
    resolvedComplaints,
    resolutionRatePct,
    avgResolutionHours,
  };
}

export interface DoctorPerformanceMetric {
  doctorName: string;
  evaluationCount: number;
  smallSampleWarning: boolean;
  avgOverallDoctorRating: number;
  avgTreatment: number;
  avgExplanation: number;
  avgAttention: number;
  avgClarity: number;
  avgOverallExperience: number;
  positiveCount: number;
  negativeCount: number;
  starDistribution: { star: number; count: number }[];
  commonTopics: string[];
  trendByMonth: { month: string; avgRating: number; count: number }[];
}

export function computeDoctorRatingsReport(
  evaluations: EvaluationRecord[],
  knownDoctorNames: string[] = [],
): DoctorPerformanceMetric[] {
  const byDoc = new Map<string, EvaluationRecord[]>();
  for (const d of knownDoctorNames) {
    if (d.trim()) byDoc.set(d.trim(), []);
  }
  for (const e of evaluations) {
    const key = (e.doctorName || '').trim();
    if (!key) continue;
    const arr = byDoc.get(key) || [];
    arr.push(e);
    byDoc.set(key, arr);
  }

  const results: DoctorPerformanceMetric[] = [];
  for (const [doctorName, list] of byDoc.entries()) {
    if (list.length === 0) continue;
    const docScores = list.map((e) => {
      if (typeof e.doctorOverallRating === 'number') return e.doctorOverallRating;
      const sub = avg([
        e.doctorTreatmentRating,
        e.doctorExplanationRating,
        e.doctorAttentionRating,
        e.doctorClarityRating,
      ]);
      return sub > 0 ? sub : e.overallSatisfaction;
    });

    const starDistribution = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: docScores.filter((s) => Math.round(s) === star).length,
    }));

    const positiveCount = list.filter((e) => (e.doctorOverallRating ?? e.overallSatisfaction) >= 4).length;
    const negativeCount = list.filter((e) => (e.doctorOverallRating ?? e.overallSatisfaction) <= 2).length;

    const topicCounts = new Map<string, number>();
    for (const e of list) {
      if (e.complaintCategory) {
        topicCounts.set(e.complaintCategory, (topicCounts.get(e.complaintCategory) || 0) + 1);
      }
      if (e.nonReturnReason) {
        topicCounts.set(e.nonReturnReason, (topicCounts.get(e.nonReturnReason) || 0) + 1);
      }
    }
    const commonTopics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([t]) => t);

    const monthMap = new Map<string, number[]>();
    for (const e of list) {
      const m = (e.visitDate || e.createdAt || '').slice(0, 7);
      if (!m) continue;
      const arr = monthMap.get(m) || [];
      arr.push(e.doctorOverallRating ?? e.overallSatisfaction);
      monthMap.set(m, arr);
    }
    const trendByMonth = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, scores]) => ({
        month,
        avgRating: avg(scores),
        count: scores.length,
      }));

    results.push({
      doctorName,
      evaluationCount: list.length,
      smallSampleWarning: list.length < 5,
      avgOverallDoctorRating: avg(docScores),
      avgTreatment: avg(list.map((e) => e.doctorTreatmentRating)),
      avgExplanation: avg(list.map((e) => e.doctorExplanationRating)),
      avgAttention: avg(list.map((e) => e.doctorAttentionRating)),
      avgClarity: avg(list.map((e) => e.doctorClarityRating)),
      avgOverallExperience: avg(list.map((e) => e.overallSatisfaction)),
      positiveCount,
      negativeCount,
      starDistribution,
      commonTopics,
      trendByMonth,
    });
  }

  return results.sort((a, b) => b.evaluationCount - a.evaluationCount || b.avgOverallDoctorRating - a.avgOverallDoctorRating);
}

export interface EvaluationDashboardAnalytics {
  totalEvaluations: number;
  avgOverallSatisfaction: number;
  avgDoctorRating: number;
  avgServiceRating: number;
  avgReceptionRating: number;
  avgWaitingTimeRating: number;
  waitingSatisfactionRatePct: number;
  recommendationRatePct: number;
  complaintIndicators: ComplaintIndicators;
  recommendationDistribution: { key: string; label: string; count: number }[];
  waitingRangeDistribution: { key: string; label: string; count: number }[];
  complaintCategoryDistribution: { category: string; count: number }[];
  nonReturnDistribution: { reason: string; totalCount: number; patientCount: number; callCount: number }[];
  satisfactionTrend: { period: string; avgOverall: number; count: number }[];
  receptionBreakdown: { criterion: string; avgScore: number }[];
}

export function computeEvaluationAnalytics(
  evaluations: EvaluationRecord[],
  complaints: EvaluationComplaintRecord[],
  nonReturnReasons: NonReturnReasonRecord[],
): EvaluationDashboardAnalytics {
  const totalEvaluations = evaluations.length;
  const avgOverallSatisfaction = avg(evaluations.map((e) => e.overallSatisfaction));
  const avgDoctorRating = avg(evaluations.map((e) => e.doctorOverallRating));
  const avgServiceRating = avg(evaluations.map((e) => e.serviceOverallRating));
  const avgReceptionRating = avg(evaluations.map((e) => e.receptionOverallRating));
  const avgWaitingTimeRating = avg(evaluations.map((e) => e.waitingTimeRating));

  const waitAnswered = evaluations.filter((e) => typeof e.waitingTimeSatisfied === 'boolean');
  const waitingSatisfactionRatePct =
    waitAnswered.length > 0
      ? Math.round((waitAnswered.filter((e) => e.waitingTimeSatisfied === true).length / waitAnswered.length) * 1000) / 10
      : 0;

  const positiveRecommend = evaluations.filter(
    (e) => e.recommendationChoice === 'definitely_yes' || e.recommendationChoice === 'probably_yes',
  ).length;
  const recommendationRatePct =
    totalEvaluations > 0 ? Math.round((positiveRecommend / totalEvaluations) * 1000) / 10 : 0;

  const recommendationDistribution = RECOMMENDATION_OPTIONS.map((opt) => ({
    key: opt.value,
    label: opt.labelAr,
    count: evaluations.filter((e) => e.recommendationChoice === opt.value).length,
  }));

  const waitingRangeDistribution = WAITING_TIME_RANGE_OPTIONS.map((opt) => ({
    key: opt.value,
    label: opt.labelAr,
    count: evaluations.filter((e) => e.waitingTimeRange === opt.value).length,
  }));

  const catMap = new Map<string, number>();
  for (const c of complaints) {
    const cat = c.category || 'أخرى';
    catMap.set(cat, (catMap.get(cat) || 0) + 1);
  }
  const complaintCategoryDistribution = Array.from(catMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const nrMap = new Map<string, { totalCount: number; patientCount: number; callCount: number }>();
  for (const r of nonReturnReasons) {
    const cur = nrMap.get(r.reasonCode) || { totalCount: 0, patientCount: 0, callCount: 0 };
    cur.totalCount += 1;
    if (r.source === 'followup_call') cur.callCount += 1;
    else cur.patientCount += 1;
    nrMap.set(r.reasonCode, cur);
  }
  const nonReturnDistribution = Array.from(nrMap.entries())
    .map(([reason, counts]) => ({ reason, ...counts }))
    .sort((a, b) => b.totalCount - a.totalCount);

  const trendMap = new Map<string, number[]>();
  for (const e of evaluations) {
    const day = (e.visitDate || e.createdAt || '').slice(0, 10);
    if (!day) continue;
    const arr = trendMap.get(day) || [];
    arr.push(e.overallSatisfaction);
    trendMap.set(day, arr);
  }
  const satisfactionTrend = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([period, scores]) => ({
      period,
      avgOverall: avg(scores),
      count: scores.length,
    }));

  const receptionBreakdown = [
    { criterion: 'تعامل موظفي الاستقبال', avgScore: avg(evaluations.map((e) => e.receptionTreatmentRating)) },
    { criterion: 'الاحترام والمهنية', avgScore: avg(evaluations.map((e) => e.receptionRespectRating)) },
    { criterion: 'سرعة التسجيل', avgScore: avg(evaluations.map((e) => e.receptionSpeedRating)) },
    { criterion: 'المساعدة والتواصل', avgScore: avg(evaluations.map((e) => e.receptionHelpfulnessRating)) },
  ];

  return {
    totalEvaluations,
    avgOverallSatisfaction,
    avgDoctorRating,
    avgServiceRating,
    avgReceptionRating,
    avgWaitingTimeRating,
    waitingSatisfactionRatePct,
    recommendationRatePct,
    complaintIndicators: computeComplaintIndicators(complaints),
    recommendationDistribution,
    waitingRangeDistribution,
    complaintCategoryDistribution,
    nonReturnDistribution,
    satisfactionTrend,
    receptionBreakdown,
  };
}

export function exportEvaluationsReport(
  evaluations: EvaluationRecord[],
  canViewPatientDetails: boolean,
  format: 'csv' | 'excel',
): void {
  const headers = [
    'الكود',
    'التاريخ',
    'نوع المشاركة',
    'المريض',
    'الهاتف',
    'الطبيب',
    'الخدمة',
    'الرضا العام',
    'تقييم الطبيب',
    'تقييم الخدمة',
    'تقييم الاستقبال',
    'تقييم الانتظار',
    'الترشيح',
    'سبب عدم العودة',
  ];
  const rows = evaluations.map((e) => {
    const masked = maskPatientIdentity(e, canViewPatientDetails);
    const recLabel = RECOMMENDATION_OPTIONS.find((o) => o.value === e.recommendationChoice)?.labelAr || e.recommendationChoice;
    return [
      e.evaluationCode,
      e.visitDate || e.createdAt.slice(0, 10),
      FEEDBACK_TYPE_LABELS[e.feedbackType] || e.feedbackType,
      masked.displayName,
      masked.displayPhone,
      e.doctorName || '-',
      e.serviceName || '-',
      e.overallSatisfaction,
      e.doctorOverallRating ?? '-',
      e.serviceOverallRating ?? '-',
      e.receptionOverallRating ?? '-',
      e.waitingTimeRating ?? '-',
      recLabel,
      e.nonReturnReason || '-',
    ];
  });
  const stamp = cairoTodayStr();
  if (format === 'excel') {
    exportRowsToExcel(`barada-evaluations-${stamp}.xls`, 'تقرير التقييم العام', headers, rows);
  } else {
    exportRowsToCsv(`barada-evaluations-${stamp}.csv`, headers, rows);
  }
}
