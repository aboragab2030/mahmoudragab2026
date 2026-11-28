import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  HeartHandshake,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { cairoTodayStr } from './dateUtils';
import {
  COMPLAINT_CATEGORIES,
  NON_RETURN_REASONS,
  RECOMMENDATION_OPTIONS,
  WAITING_TIME_RANGE_OPTIONS,
  fetchEvaluationBookingContext,
  fetchPublicEvaluationConfig,
  submitPatientEvaluation,
  type EvaluationFeedbackType,
  type PublicEvaluationConfig,
  type RecommendationChoice,
  type WaitingTimeRange,
} from './generalEvaluationService';

interface PublicEvaluationViewProps {
  doctors: Array<{ id: number; name: string; specialty?: string }>;
  services: Array<{ id: number; title: string }>;
  language: 'ar' | 'en';
  initialBookingId?: string;
  initialBookingToken?: string;
  onNavigate: (section: string) => void;
}

const StarRatingField: React.FC<{
  label: string;
  value: number;
  onChange: (val: number) => void;
  required?: boolean;
}> = ({ label, value, onChange, required = false }) => {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;
  const labels = ['', 'ضعيف جداً', 'ضعيف', 'جيد', 'جيد جداً', 'ممتاز'];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0]">
      <div className="text-sm font-bold text-[#172B3A]">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              aria-label={`${star} من 5`}
              aria-checked={value === star}
              role="radio"
              className="p-1.5 rounded-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#087F8C]"
            >
              <Star
                size={22}
                className={
                  star <= active
                    ? 'fill-amber-400 text-amber-500 transition-colors'
                    : 'text-[#C5D5E0] transition-colors'
                }
              />
            </button>
          ))}
        </div>
        <span className="text-xs font-bold text-[#718394] min-w-[68px] text-left fv-num">
          {value > 0 ? `${value}/5 · ${labels[value]}` : 'اختر التقييم'}
        </span>
      </div>
    </div>
  );
};

export const PublicEvaluationView: React.FC<PublicEvaluationViewProps> = ({
  doctors,
  services,
  language,
  initialBookingId,
  initialBookingToken,
  onNavigate,
}) => {
  const isAr = language === 'ar';
  const [config, setConfig] = useState<PublicEvaluationConfig>({
    publicFormEnabled: true,
    allowAnonymousSubmission: true,
    requirePhoneForComplaint: true,
    showNonReturnQuestion: true,
    showWaitingTimeSection: true,
    welcomeMessageAr: 'رأيك يهمنا لتطوير جودة الرعاية الطبية والخدمات المقدمة في مركز برادة للعيون',
    welcomeMessageEn: 'Your feedback helps us improve medical care and patient experience at Barada Eye Center',
    thankYouMessageAr: 'شكراً لمشاركتنا تقييمك. ملاحظاتك محل تقدير واهتمام إدارة المركز.',
    thankYouMessageEn: 'Thank you for sharing your evaluation with Barada Eye Center.',
  });

  const [idempotencyKey, setIdempotencyKey] = useState(() => `pub-eval-${crypto.randomUUID()}`);
  const [bookingPrefilled, setBookingPrefilled] = useState(false);

  // Section A: Patient & Visit info
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientFileNumber, setPatientFileNumber] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [visitDate, setVisitDate] = useState(cairoTodayStr());
  const [appointmentRef, setAppointmentRef] = useState('');

  // Section B: Doctor evaluation (1-5)
  const [docTreatment, setDocTreatment] = useState(0);
  const [docExplanation, setDocExplanation] = useState(0);
  const [docAttention, setDocAttention] = useState(0);
  const [docClarity, setDocClarity] = useState(0);
  const [docOverall, setDocOverall] = useState(0);
  const [docComment, setDocComment] = useState('');

  // Section C: Service evaluation (1-5)
  const [srvQuality, setSrvQuality] = useState(0);
  const [srvCoop, setSrvCoop] = useState(0);
  const [srvEase, setSrvEase] = useState(0);
  const [srvOverall, setSrvOverall] = useState(0);

  // Section D: Reception evaluation (1-5)
  const [recTreatment, setRecTreatment] = useState(0);
  const [recRespect, setRecRespect] = useState(0);
  const [recSpeed, setRecSpeed] = useState(0);
  const [recHelpfulness, setRecHelpfulness] = useState(0);

  // Section E: Waiting time
  const [waitRange, setWaitRange] = useState<WaitingTimeRange | ''>('');
  const [waitMinutes, setWaitMinutes] = useState('');
  const [waitSatisfied, setWaitSatisfied] = useState<boolean | null>(null);
  const [waitRating, setWaitRating] = useState(0);
  const [waitComment, setWaitComment] = useState('');

  // Section F & G: Overall satisfaction & recommendation
  const [overallSatisfaction, setOverallSatisfaction] = useState(0);
  const [overallComment, setOverallComment] = useState('');
  const [recommendation, setRecommendation] = useState<RecommendationChoice | ''>('');

  // Section 6: Complaints, suggestions, positive comments
  const [feedbackType, setFeedbackType] = useState<EvaluationFeedbackType>('evaluation');
  const [complaintCategory, setComplaintCategory] = useState<string>('الخدمة الطبية');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [contactConsent, setContactConsent] = useState(true);

  // Section 9: Non-return reason
  const [nonReturnReason, setNonReturnReason] = useState('');
  const [nonReturnExplanation, setNonReturnExplanation] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    evaluationCode?: string;
    complaintReference?: string | null;
  } | null>(null);

  useEffect(() => {
    void fetchPublicEvaluationConfig().then(setConfig);
  }, []);

  useEffect(() => {
    if (!initialBookingId || !initialBookingToken) return;
    void fetchEvaluationBookingContext(initialBookingId, initialBookingToken).then((ctx) => {
      if (!ctx.valid) return;
      setBookingPrefilled(true);
      if (ctx.patientName) setPatientName(ctx.patientName);
      if (ctx.doctorName) setDoctorName(ctx.doctorName);
      if (ctx.serviceName) setServiceName(ctx.serviceName);
      if (ctx.visitDate) setVisitDate(ctx.visitDate);
      if (ctx.bookingId) setAppointmentRef(ctx.bookingId.slice(-8).toUpperCase());
    });
  }, [initialBookingId, initialBookingToken]);

  const resetForNewSubmission = () => {
    setIdempotencyKey(`pub-eval-${crypto.randomUUID()}`);
    setSubmittedResult(null);
    setFormError(null);
    setDocTreatment(0);
    setDocExplanation(0);
    setDocAttention(0);
    setDocClarity(0);
    setDocOverall(0);
    setDocComment('');
    setSrvQuality(0);
    setSrvCoop(0);
    setSrvEase(0);
    setSrvOverall(0);
    setRecTreatment(0);
    setRecRespect(0);
    setRecSpeed(0);
    setRecHelpfulness(0);
    setWaitRange('');
    setWaitMinutes('');
    setWaitSatisfied(null);
    setWaitRating(0);
    setWaitComment('');
    setOverallSatisfaction(0);
    setOverallComment('');
    setRecommendation('');
    setFeedbackType('evaluation');
    setFeedbackMessage('');
    setNonReturnReason('');
    setNonReturnExplanation('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (overallSatisfaction < 1 || overallSatisfaction > 5) {
      const msg = 'يرجى تحديد التقييم العام لتجربتك في مركز برادة للعيون (من 1 إلى 5 نجوم).';
      setFormError(msg);
      toast.error(msg);
      return;
    }

    if (!recommendation) {
      const msg = 'يرجى الإجابة على سؤال: هل ترشح مركز برادة للعيون لأهلك وأصدقائك؟';
      setFormError(msg);
      toast.error(msg);
      return;
    }

    const digitsPhone = patientPhone
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\D/g, '');

    if ((feedbackType === 'complaint' || feedbackType === 'suggestion') && config.requirePhoneForComplaint && digitsPhone.length < 8) {
      const msg = 'يرجى إدخال رقم هاتف صحيح حتى تتمكن إدارة المركز من متابعة الشكوى أو الاقتراح.';
      setFormError(msg);
      toast.error(msg);
      return;
    }

    if ((feedbackType === 'complaint' || feedbackType === 'suggestion') && !feedbackMessage.trim()) {
      const msg = feedbackType === 'complaint' ? 'يرجى كتابة تفاصيل الشكوى.' : 'يرجى كتابة تفاصيل الاقتراح.';
      setFormError(msg);
      toast.error(msg);
      return;
    }

    if (!config.allowAnonymousSubmission && (!patientName.trim() || digitsPhone.length < 8)) {
      const msg = 'يرجى إدخال الاسم ورقم الهاتف قبل إرسال التقييم.';
      setFormError(msg);
      toast.error(msg);
      return;
    }

    setSubmitting(true);
    try {
      const resolvedDoctorTreatment = docTreatment || docOverall || undefined;
      const resolvedServiceQuality = srvQuality || srvOverall || undefined;
      const channel = bookingPrefilled
        ? 'booking_link'
        : typeof window !== 'undefined' && window.location.search.includes('section=')
          ? 'direct_link'
          : 'public_nav';

      const res = await submitPatientEvaluation({
        idempotency_key: idempotencyKey,
        submission_channel: channel,
        feedback_type: feedbackType,
        patient_name: patientName.trim() || 'مريض زائر',
        patient_phone: digitsPhone || patientPhone.trim(),
        patient_file_number: patientFileNumber.trim() || undefined,
        doctor_name: doctorName || undefined,
        service_name: serviceName || undefined,
        visit_date: visitDate || undefined,
        appointment_ref: appointmentRef.trim() || undefined,
        booking_id: bookingPrefilled ? initialBookingId : undefined,
        booking_token: bookingPrefilled ? initialBookingToken : undefined,
        doctor_treatment_rating: resolvedDoctorTreatment,
        doctor_explanation_rating: docExplanation || docOverall || undefined,
        doctor_attention_rating: docAttention || docOverall || undefined,
        doctor_clarity_rating: docClarity || docOverall || undefined,
        doctor_comment: docComment.trim() || undefined,
        service_quality_rating: resolvedServiceQuality,
        staff_cooperation_rating: srvCoop || srvOverall || undefined,
        procedures_ease_rating: srvEase || srvOverall || undefined,
        reception_treatment_rating: recTreatment || undefined,
        reception_respect_rating: recRespect || undefined,
        reception_speed_rating: recSpeed || undefined,
        reception_helpfulness_rating: recHelpfulness || undefined,
        waiting_time_range: waitRange || undefined,
        actual_wait_minutes: waitMinutes.trim() ? Number(waitMinutes) : null,
        waiting_time_satisfied: waitSatisfied,
        waiting_time_rating: waitRating || undefined,
        waiting_time_comment: waitComment.trim() || undefined,
        overall_satisfaction: overallSatisfaction,
        overall_comment: overallComment.trim() || undefined,
        recommendation_choice: recommendation,
        non_return_reason: nonReturnReason || undefined,
        non_return_explanation: nonReturnExplanation.trim() || undefined,
        complaint_category: feedbackType === 'complaint' || feedbackType === 'suggestion' ? complaintCategory : undefined,
        feedback_message: feedbackMessage.trim() || undefined,
        contact_consent: contactConsent,
      });

      setSubmittedResult({
        evaluationCode: res.evaluationCode,
        complaintReference: res.complaintReference,
      });
      toast.success('تم إرسال تقييمك بنجاح. شكراً لوقتك وثقتك.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر إرسال التقييم، يرجى المحاولة مرة أخرى.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldCls =
    'w-full bg-[#F5FAFC] border border-[#DFEAF0] rounded-xl p-3.5 text-[#172B3A] focus:bg-white focus:ring-2 focus:ring-[#25B8C7]/25 focus:border-[#087F8C] outline-hidden transition-all font-bold text-sm';

  if (!config.publicFormEnabled) {
    return (
      <div className="py-16 md:py-24 min-h-screen" dir="rtl">
        <div className="max-w-xl mx-auto px-4">
          <div className="bg-white rounded-3xl shadow-[0_20px_50px_-20px_rgba(11,31,53,0.14)] p-10 border border-[#DFEAF0] text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20 flex items-center justify-center mx-auto mb-5">
              <AlertCircle size={30} />
            </div>
            <h2 className="text-2xl font-black text-[#172B3A] mb-3">التقييم العام</h2>
            <p className="text-sm text-[#718394] font-medium mb-6">
              نموذج التقييم الإلكتروني متوقف مؤقتاً حالياً. يمكنك دائماً التواصل معنا مباشرة عبر صفحة تواصل معنا.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="fv-btn-primary px-6 py-3 rounded-xl font-bold text-sm cursor-pointer"
            >
              العودة للرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (submittedResult) {
    return (
      <div className="py-16 md:py-24 min-h-screen" dir="rtl">
        <div className="max-w-xl mx-auto px-4">
          <div className="bg-white rounded-3xl shadow-[0_20px_50px_-20px_rgba(11,31,53,0.14)] p-8 md:p-10 border border-[#DFEAF0] text-center animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={34} />
            </div>
            <h2 className="text-2xl font-black text-[#172B3A] mb-3">شكراً لمشاركتك رأيك</h2>
            <p className="text-sm text-[#718394] font-medium leading-relaxed mb-6">
              {isAr ? config.thankYouMessageAr : config.thankYouMessageEn}
            </p>
            <div className="bg-[#F5FAFC] rounded-2xl p-5 border border-[#DFEAF0] text-right space-y-2 mb-6">
              {submittedResult.evaluationCode && (
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-[#718394]">رقم مرجع التقييم:</span>
                  <span className="text-[#172B3A] fv-mono" dir="ltr">
                    {submittedResult.evaluationCode}
                  </span>
                </div>
              )}
              {submittedResult.complaintReference && (
                <div className="flex items-center justify-between text-xs font-bold pt-2 border-t border-[#DFEAF0]">
                  <span className="text-[#718394]">رقم متابعة الشكوى / الاقتراح:</span>
                  <span className="text-[#087F8C] fv-mono" dir="ltr">
                    {submittedResult.complaintReference}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="fv-btn-primary px-6 py-3 rounded-xl font-bold text-sm cursor-pointer"
              >
                العودة للرئيسية
              </button>
              <button
                type="button"
                onClick={resetForNewSubmission}
                className="px-6 py-3 rounded-xl border border-[#DFEAF0] text-[#718394] font-bold text-sm hover:bg-[#F5FAFC] hover:text-[#172B3A] transition-colors cursor-pointer"
              >
                إرسال تقييم آخر
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-14 md:py-20 min-h-screen" dir="rtl">
      <div className="max-w-3xl mx-auto px-4">
        <div className="bg-white rounded-3xl shadow-[0_20px_50px_-20px_rgba(11,31,53,0.14)] p-6 sm:p-8 md:p-10 border border-[#DFEAF0]">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20 mb-4">
              <Star size={28} />
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-[#172B3A]">التقييم العام</h1>
            <p className="text-[#718394] text-sm font-medium mt-2 max-w-xl mx-auto leading-relaxed">
              {isAr ? config.welcomeMessageAr : config.welcomeMessageEn}
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#087F8C] bg-[#087F8C]/8 px-4 py-2 rounded-xl border border-[#087F8C]/20">
              <ShieldCheck size={16} />
              <span>بياناتك سرية تماماً ولا تُعرض هويتك أو تعليقاتك للجمهور</span>
            </div>
          </div>

          {bookingPrefilled && (
            <div className="mb-6 p-4 rounded-2xl bg-[#087F8C]/8 border border-[#087F8C]/20 flex items-center gap-3 text-xs font-bold text-[#172B3A]">
              <Calendar size={18} className="text-[#087F8C] shrink-0" />
              <span>تم ربط هذا التقييم بموعد زيارتك المحدد تلقائياً لتسهيل التقييم.</span>
            </div>
          )}

          {formError && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center gap-3 text-sm font-bold text-red-700">
              <AlertCircle size={18} className="shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* A. Patient & Visit Information */}
            <section className="space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-[#DFEAF0]">
                <UserCheck size={20} className="text-[#087F8C]" />
                <h2 className="text-base font-black text-[#172B3A]">أولاً: بيانات الزيارة والمريض</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#718394] mb-1.5">
                    الاسم {!config.allowAnonymousSubmission && <span className="text-red-500">*</span>}
                    {config.allowAnonymousSubmission && <span className="text-[#718394] font-normal"> (اختياري)</span>}
                  </label>
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className={fieldCls}
                    placeholder="الاسم الكريم"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#718394] mb-1.5">
                    رقم الهاتف{' '}
                    {(feedbackType === 'complaint' || feedbackType === 'suggestion') && config.requirePhoneForComplaint ? (
                      <span className="text-red-500">*</span>
                    ) : (
                      <span className="text-[#718394] font-normal">(اختياري للمتابعة)</span>
                    )}
                  </label>
                  <input
                    type="tel"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    className={`${fieldCls} text-left fv-num`}
                    dir="ltr"
                    placeholder="01xxxxxxxxx"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#718394] mb-1.5">رقم الملف الطبي (إن وجد)</label>
                  <input
                    type="text"
                    value={patientFileNumber}
                    onChange={(e) => setPatientFileNumber(e.target.value)}
                    className={`${fieldCls} fv-mono`}
                    dir="ltr"
                    placeholder="مثال: BRD-2026-0001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#718394] mb-1.5">الطبيب الذي تمت زيارته</label>
                  <select
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    className={fieldCls}
                  >
                    <option value="">اختر الطبيب (اختياري)</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#718394] mb-1.5">الخدمة المقدمة (إن وجدت)</label>
                  <select
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    className={fieldCls}
                  >
                    <option value="">اختر الخدمة (اختياري)</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.title}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#718394] mb-1.5">تاريخ الزيارة</label>
                    <input
                      type="date"
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                      className={`${fieldCls} fv-num`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#718394] mb-1.5">مرجع الحجز</label>
                    <input
                      type="text"
                      value={appointmentRef}
                      onChange={(e) => setAppointmentRef(e.target.value)}
                      className={`${fieldCls} fv-mono`}
                      dir="ltr"
                      placeholder="اختياري"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* B. Doctor Evaluation */}
            <section className="space-y-3">
              <div className="flex items-center gap-2.5 pb-2 border-b border-[#DFEAF0]">
                <Stethoscope size={20} className="text-[#087F8C]" />
                <h2 className="text-base font-black text-[#172B3A]">ثانياً: تقييم الطبيب</h2>
              </div>
              <StarRatingField label="التعامل المهني للطبيب" value={docTreatment} onChange={setDocTreatment} />
              <StarRatingField label="الشرح والتواصل مع المريض" value={docExplanation} onChange={setDocExplanation} />
              <StarRatingField label="الاهتمام بمخاوف واستفسارات المريض" value={docAttention} onChange={setDocAttention} />
              <StarRatingField label="وضوح التعليمات الطبية والعلاج" value={docClarity} onChange={setDocClarity} />
              <StarRatingField label="التجربة العامة مع الطبيب" value={docOverall} onChange={setDocOverall} />
              <div>
                <label className="block text-xs font-bold text-[#718394] mb-1.5">تعليق اختياري حول تجربة الطبيب</label>
                <textarea
                  rows={2}
                  value={docComment}
                  onChange={(e) => setDocComment(e.target.value)}
                  className={fieldCls}
                  placeholder="أضف أي ملاحظات تخص الطبيب (اختياري)..."
                />
              </div>
            </section>

            {/* C. Service Evaluation */}
            <section className="space-y-3">
              <div className="flex items-center gap-2.5 pb-2 border-b border-[#DFEAF0]">
                <Sparkles size={20} className="text-[#087F8C]" />
                <h2 className="text-base font-black text-[#172B3A]">ثالثاً: تقييم الخدمة الطبية</h2>
              </div>
              <StarRatingField label="جودة الخدمة الطبية المقدمة" value={srvQuality} onChange={setSrvQuality} />
              <StarRatingField label="تعاون فريق العمل الطبي والتمريض" value={srvCoop} onChange={setSrvCoop} />
              <StarRatingField label="سهولة الإجراءات داخل المركز" value={srvEase} onChange={setSrvEase} />
              <StarRatingField label="الجودة الإجمالية للخدمة" value={srvOverall} onChange={setSrvOverall} />
            </section>

            {/* D. Reception Evaluation */}
            <section className="space-y-3">
              <div className="flex items-center gap-2.5 pb-2 border-b border-[#DFEAF0]">
                <HeartHandshake size={20} className="text-[#087F8C]" />
                <h2 className="text-base font-black text-[#172B3A]">رابعاً: تقييم الاستقبال</h2>
              </div>
              <StarRatingField label="تعامل موظفي الاستقبال" value={recTreatment} onChange={setRecTreatment} />
              <StarRatingField label="الاحترام والمهنية" value={recRespect} onChange={setRecRespect} />
              <StarRatingField label="سرعة التسجيل وإنهاء الإجراءات" value={recSpeed} onChange={setRecSpeed} />
              <StarRatingField label="المساعدة والتواصل وتوجيه المريض" value={recHelpfulness} onChange={setRecHelpfulness} />
            </section>

            {/* E. Waiting Time Evaluation */}
            {config.showWaitingTimeSection && (
              <section className="space-y-4">
                <div className="flex items-center gap-2.5 pb-2 border-b border-[#DFEAF0]">
                  <Clock size={20} className="text-[#087F8C]" />
                  <h2 className="text-base font-black text-[#172B3A]">خامساً: تقييم وقت الانتظار</h2>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#718394] mb-2">مدة الانتظار الفعلية أو التقديرية حتى الدخول</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {WAITING_TIME_RANGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setWaitRange(opt.value)}
                        className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          waitRange === opt.value
                            ? 'bg-[#087F8C] text-white border-[#087F8C]'
                            : 'bg-[#F5FAFC] text-[#172B3A] border-[#DFEAF0] hover:border-[#087F8C]/50'
                        }`}
                      >
                        {opt.labelAr}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#718394] mb-1.5">مدة الانتظار بالدقائق (اختياري)</label>
                    <input
                      type="number"
                      min={0}
                      max={600}
                      value={waitMinutes}
                      onChange={(e) => setWaitMinutes(e.target.value)}
                      className={`${fieldCls} fv-num`}
                      placeholder="مثال: 20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#718394] mb-1.5">هل أنت راضٍ عن وقت الانتظار؟</label>
                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={() => setWaitSatisfied(true)}
                        className={`flex-1 py-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          waitSatisfied === true
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-[#F5FAFC] text-[#172B3A] border-[#DFEAF0]'
                        }`}
                      >
                        نعم، راضٍ
                      </button>
                      <button
                        type="button"
                        onClick={() => setWaitSatisfied(false)}
                        className={`flex-1 py-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          waitSatisfied === false
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-[#F5FAFC] text-[#172B3A] border-[#DFEAF0]'
                        }`}
                      >
                        لا، الانتظار طويل
                      </button>
                    </div>
                  </div>
                </div>
                <StarRatingField label="تقييم وقت الانتظار" value={waitRating} onChange={setWaitRating} />
                <div>
                  <label className="block text-xs font-bold text-[#718394] mb-1.5">ملاحظات حول أي تأخير (اختياري)</label>
                  <textarea
                    rows={2}
                    value={waitComment}
                    onChange={(e) => setWaitComment(e.target.value)}
                    className={fieldCls}
                    placeholder="أضف تفاصيل حول وقت الانتظار أو سبب التأخير إن وجد..."
                  />
                </div>
              </section>
            )}

            {/* F & G. Overall Satisfaction & Recommendation */}
            <section className="space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-[#DFEAF0]">
                <Star size={20} className="text-[#087F8C]" />
                <h2 className="text-base font-black text-[#172B3A]">سادساً: الرضا العام والترشيح</h2>
              </div>
              <StarRatingField
                label="بشكل عام، ما مدى رضاك عن تجربتك في مركز برادة للعيون؟"
                value={overallSatisfaction}
                onChange={setOverallSatisfaction}
                required
              />
              <div>
                <label className="block text-xs font-bold text-[#718394] mb-2">
                  هل ترشح مركز برادة للعيون لأهلك وأصدقائك؟ <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {RECOMMENDATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRecommendation(opt.value)}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        recommendation === opt.value
                          ? 'bg-[#1769AA] text-white border-[#1769AA]'
                          : 'bg-[#F5FAFC] text-[#172B3A] border-[#DFEAF0] hover:border-[#1769AA]/50'
                      }`}
                    >
                      {opt.labelAr}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#718394] mb-1.5">تعليق عام حول تجربتك (اختياري)</label>
                <textarea
                  rows={2}
                  value={overallComment}
                  onChange={(e) => setOverallComment(e.target.value)}
                  className={fieldCls}
                  placeholder="شاركنا انطباعك العام عن الزيارة..."
                />
              </div>
            </section>

            {/* H. Complaints, Suggestions & Positive Comments */}
            <section className="space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-[#DFEAF0]">
                <MessageSquare size={20} className="text-[#087F8C]" />
                <h2 className="text-base font-black text-[#172B3A]">سابعاً: الشكاوى والمقترحات أو التعليقات</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { id: 'evaluation', label: 'تقييم عام فقط' },
                  { id: 'positive_comment', label: 'تعليق إيجابي' },
                  { id: 'suggestion', label: 'تسجيل اقتراح' },
                  { id: 'complaint', label: 'تسجيل شكوى' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFeedbackType(item.id as EvaluationFeedbackType)}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      feedbackType === item.id
                        ? item.id === 'complaint'
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-[#087F8C] text-white border-[#087F8C]'
                        : 'bg-[#F5FAFC] text-[#172B3A] border-[#DFEAF0] hover:border-[#087F8C]/40'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {feedbackType !== 'evaluation' && (
                <div className="space-y-4 p-4 rounded-2xl bg-[#F5FAFC] border border-[#DFEAF0]">
                  {(feedbackType === 'complaint' || feedbackType === 'suggestion') && (
                    <div>
                      <label className="block text-xs font-bold text-[#718394] mb-1.5">التصنيف</label>
                      <select
                        value={complaintCategory}
                        onChange={(e) => setComplaintCategory(e.target.value)}
                        className={fieldCls}
                      >
                        {COMPLAINT_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-[#718394] mb-1.5">
                      {feedbackType === 'complaint'
                        ? 'تفاصيل الشكوى'
                        : feedbackType === 'suggestion'
                          ? 'تفاصيل الاقتراح'
                          : 'التعليق الإيجابي'}
                      {(feedbackType === 'complaint' || feedbackType === 'suggestion') && (
                        <span className="text-red-500 mr-1">*</span>
                      )}
                    </label>
                    <textarea
                      rows={3}
                      value={feedbackMessage}
                      onChange={(e) => setFeedbackMessage(e.target.value)}
                      className={fieldCls}
                      placeholder="اكتب التفاصيل هنا..."
                    />
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-[#172B3A]">
                <input
                  type="checkbox"
                  checked={contactConsent}
                  onChange={(e) => setContactConsent(e.target.checked)}
                  className="w-4 h-4 accent-[#087F8C] rounded-sm"
                />
                <span>أوافق على تواصل إدارة المركز معي للمتابعة والرد على ملاحظاتي عند الحاجة</span>
              </label>
            </section>

            {/* I. Optional Reasons for Not Returning */}
            {config.showNonReturnQuestion && (
              <section className="space-y-3">
                <div className="flex items-center gap-2.5 pb-2 border-b border-[#DFEAF0]">
                  <AlertCircle size={20} className="text-[#087F8C]" />
                  <h2 className="text-base font-black text-[#172B3A]">ثامناً: تحسين تجربتك المستقبلية (اختياري)</h2>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#718394] mb-1.5">
                    ما السبب الرئيسي الذي قد يمنعك من زيارة المركز مرة أخرى؟
                  </label>
                  <select
                    value={nonReturnReason}
                    onChange={(e) => setNonReturnReason(e.target.value)}
                    className={fieldCls}
                  >
                    <option value="">لا يوجد سبب — سأزور المركز مرة أخرى</option>
                    {NON_RETURN_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </div>
                {nonReturnReason && (
                  <div>
                    <label className="block text-xs font-bold text-[#718394] mb-1.5">توضيح إضافي (اختياري)</label>
                    <textarea
                      rows={2}
                      value={nonReturnExplanation}
                      onChange={(e) => setNonReturnExplanation(e.target.value)}
                      className={fieldCls}
                      placeholder="أخبرنا بمزيد من التفاصيل لمساعدتنا على المعالجة..."
                    />
                  </div>
                )}
              </section>
            )}

            <div className="flex gap-3 pt-4 border-t border-[#DFEAF0]">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 fv-btn-primary font-black py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                <Send size={18} />
                {submitting ? 'جاري إرسال التقييم...' : 'إرسال التقييم'}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="px-6 py-3.5 border border-[#DFEAF0] rounded-xl text-[#718394] font-bold hover:bg-[#F5FAFC] hover:text-[#172B3A] transition-colors cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
