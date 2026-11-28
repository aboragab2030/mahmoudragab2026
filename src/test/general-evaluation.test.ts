import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  DASHBOARD_PERMISSIONS,
  GENERAL_EVALUATION_PERMISSIONS,
  canAccessSection,
  hasGeneralEvaluationPermission,
  hasPatientPermission,
} from '@/barada/permissions';
import {
  NON_RETURN_REASONS,
  RECOMMENDATION_OPTIONS,
  WAITING_TIME_RANGE_OPTIONS,
  computeComplaintIndicators,
  computeDoctorRatingsReport,
  computeEvaluationAnalytics,
  fetchEvaluationBookingContext,
  fetchPublicEvaluationConfig,
  filterComplaintsList,
  filterEvaluations,
  loadGeneralEvaluationBundle,
  maskPatientIdentity,
  recordNonReturnReasonFromCall,
  saveEvaluationSettings,
  submitPatientEvaluation,
  updateComplaintWorkflow,
  type EvaluationRecord,
} from '@/barada/generalEvaluationService';
import { submitComplaint } from '@/barada/clinicRecords';
import { savePatientRecord } from '@/barada/patientsService';

describe('Patient Experience & General Evaluation System (التقييم العام)', () => {
  beforeEach(async () => {
    await supabase.auth.signInWithPassword({
      email: 'admin@barada-clinic.local',
      password: 'admin',
    });
  });

  it('defines all 11 general evaluation permissions without auto-granting existing staff or implying billing permissions', () => {
    expect(GENERAL_EVALUATION_PERMISSIONS).toHaveLength(11);
    const expectedIds = [
      'general_evaluation_view',
      'general_evaluation_manage',
      'general_evaluation_view_reports',
      'general_evaluation_export',
      'general_evaluation_manage_settings',
      'general_evaluation_view_patient_details',
      'general_evaluation_manage_complaints',
      'general_evaluation_assign_complaints',
      'general_evaluation_resolve_complaints',
      'general_evaluation_manage_followups',
      'general_evaluation_view_doctor_ratings',
    ];
    for (const id of expectedIds) {
      expect(GENERAL_EVALUATION_PERMISSIONS.some((p) => p.id === id)).toBe(true);
      expect(DASHBOARD_PERMISSIONS.some((p) => p.id === id)).toBe(true);
    }

    const legacyStaff = { role: 'staff' as const, permissions: ['manage_bookings', 'manage_complaints'] };
    expect(canAccessSection(legacyStaff, 'general-evaluation')).toBe(false);
    expect(hasGeneralEvaluationPermission(legacyStaff, 'general_evaluation_view')).toBe(false);

    const evalOnlyStaff = { role: 'staff' as const, permissions: ['general_evaluation_view', 'general_evaluation_manage'] };
    expect(canAccessSection(evalOnlyStaff, 'general-evaluation')).toBe(true);
    expect(canAccessSection(evalOnlyStaff, 'accounting')).toBe(false);
    expect(canAccessSection(evalOnlyStaff, 'payments')).toBe(false);
    expect(hasPatientPermission(evalOnlyStaff, 'patients_view')).toBe(false);
    expect(hasGeneralEvaluationPermission(evalOnlyStaff, 'general_evaluation_view_patient_details')).toBe(false);

    const identity = { patientName: 'أحمد محمود علي', patientPhone: '01012345678', evaluationCode: 'EVL-001' };
    const masked = maskPatientIdentity(identity, false);
    expect(masked.displayName).not.toBe('أحمد محمود علي');
    expect(masked.displayPhone).not.toBe('01012345678');

    const unmasked = maskPatientIdentity(identity, true);
    expect(unmasked.displayName).toBe('أحمد محمود علي');
    expect(unmasked.displayPhone).toBe('01012345678');
  });

  it('allows anonymous/public evaluation submission, safely links existing patients/bookings without creating duplicates, enforces idempotency & rate limits', async () => {
    const patient = await savePatientRecord(
      {
        fullName: 'محمود سعيد حسن',
        phone: '01099887766',
        age: 42,
      },
      { userId: 'test-admin', name: 'المدير' },
    );
    const { data: beforePatients } = await supabase.from('patients' as any).select('*').eq('phone', '01099887766');
    const beforeCount = (beforePatients || []).length;
    expect(beforeCount).toBe(1);

    const bkId = crypto.randomUUID();
    const bkToken = crypto.randomUUID();
    await supabase.from('bookings').insert({
      id: bkId,
      cancellation_token: bkToken,
      patient_id: patient.id,
      patient_name: 'محمود سعيد حسن',
      phone: '01099887766',
      doctor_name: 'د. أحمد محمود',
      service: 'كشف عيون شامل',
      date: '2026-11-28',
      time: '10:00 ص',
      status: 'confirmed',
    } as any);

    await supabase.auth.signOut();

    const cfg = await fetchPublicEvaluationConfig();
    expect(cfg.publicFormEnabled).toBe(true);

    const ctx = await fetchEvaluationBookingContext(bkId, bkToken);
    expect(ctx.valid).toBe(true);
    expect(ctx.patientName).toBe('محمود سعيد حسن');
    expect(ctx.doctorName).toBe('د. أحمد محمود');

    const invalidCtx = await fetchEvaluationBookingContext(bkId, 'wrong-token');
    expect(invalidCtx.valid).toBe(false);

    const idemKey = `test-idem-${crypto.randomUUID()}`;
    const res1 = await submitPatientEvaluation({
      submission_channel: 'booking_link',
      feedback_type: 'evaluation',
      idempotency_key: idemKey,
      booking_id: bkId,
      booking_token: bkToken,
      patient_name: 'محمود سعيد حسن',
      patient_phone: '01099887766',
      doctor_name: 'د. أحمد محمود',
      service_name: 'كشف عيون شامل',
      visit_date: '2026-11-28',
      doctor_treatment_rating: 5,
      doctor_explanation_rating: 5,
      doctor_attention_rating: 4,
      doctor_clarity_rating: 5,
      service_quality_rating: 5,
      staff_cooperation_rating: 5,
      procedures_ease_rating: 4,
      reception_treatment_rating: 5,
      reception_respect_rating: 5,
      reception_speed_rating: 4,
      reception_helpfulness_rating: 5,
      waiting_time_range: '15-30',
      actual_wait_minutes: 20,
      waiting_time_satisfied: true,
      waiting_time_rating: 4,
      overall_satisfaction: 5,
      overall_comment: 'تجربة ممتازة وتعامل راقٍ',
      recommendation_choice: 'definitely_yes',
      contact_consent: true,
    });

    expect(res1.ok).toBe(true);
    expect(res1.deduplicated).toBe(false);
    expect(res1.evaluationId).toBeTruthy();
    expect(res1.complaintId).toBeNull();

    // Idempotent duplicate click returns exact same evaluation without creating another row
    const resDup = await submitPatientEvaluation({
      submission_channel: 'booking_link',
      feedback_type: 'evaluation',
      idempotency_key: idemKey,
      booking_id: bkId,
      booking_token: bkToken,
      patient_name: 'محمود سعيد حسن',
      patient_phone: '01099887766',
      overall_satisfaction: 5,
      recommendation_choice: 'definitely_yes',
      contact_consent: true,
    });
    expect(resDup.deduplicated).toBe(true);
    expect(resDup.evaluationId).toBe(res1.evaluationId);

    // Rate limiting blocks rapid repeat from same phone with new key
    await expect(
      submitPatientEvaluation({
        submission_channel: 'public_nav',
        feedback_type: 'evaluation',
        idempotency_key: `test-rate-${crypto.randomUUID()}`,
        patient_name: 'محمود سعيد حسن',
        patient_phone: '01099887766',
        overall_satisfaction: 4,
        recommendation_choice: 'probably_yes',
        contact_consent: true,
      }),
    ).rejects.toThrow();

    await supabase.auth.signInWithPassword({ email: 'admin@barada-clinic.local', password: 'admin' });
    const { data: afterPatients } = await supabase.from('patients' as any).select('*').eq('phone', '01099887766');
    expect((afterPatients || []).length).toBe(beforeCount);

    const bundle = await loadGeneralEvaluationBundle();
    const createdEval = bundle.evaluations.find((e) => e.id === res1.evaluationId);
    expect(createdEval).toBeTruthy();
    expect(createdEval?.patientId).toBe(patient.id);
    expect(createdEval?.bookingId).toBe(bkId);
    expect(createdEval?.doctorOverallRating).toBeCloseTo(4.75, 2);
  });

  it('synchronizes evaluation complaints and suggestions 1:1 with public.complaints and enforces resolution workflow rules', async () => {
    await supabase.auth.signOut();

    // Existing ContactUs submission continues working cleanly
    const legacyOk = await submitComplaint({
      name: 'زائر صفحة التواصل',
      phone: '01122334455',
      type: 'suggestion',
      message: 'توفير مواعيد مسائية إضافية يوم الخميس',
      date: '2026-11-28',
    });
    expect(legacyOk).toBe(true);

    // Public evaluation submission with complaint creates ONE synchronized record in public.complaints
    const cmpEval = await submitPatientEvaluation({
      submission_channel: 'public_nav',
      feedback_type: 'complaint',
      idempotency_key: `test-cmp-${crypto.randomUUID()}`,
      patient_name: 'سارة علي ابراهيم',
      patient_phone: '01234567890',
      doctor_name: 'د. أحمد محمود',
      waiting_time_range: '>60',
      actual_wait_minutes: 75,
      waiting_time_satisfied: false,
      waiting_time_rating: 1,
      overall_satisfaction: 2,
      recommendation_choice: 'probably_no',
      non_return_reason: 'طول فترة الانتظار',
      non_return_explanation: 'تأخر الدور أكثر من ساعة',
      complaint_category: 'مدة الانتظار',
      complaint_priority: 'high',
      feedback_message: 'انتظرت 75 دقيقة رغم الحجز المسبق',
      contact_consent: true,
    });

    expect(cmpEval.ok).toBe(true);
    expect(cmpEval.complaintId).toBeTruthy();
    expect(cmpEval.complaintReference).toMatch(/^CMP-/);

    await supabase.auth.signInWithPassword({ email: 'admin@barada-clinic.local', password: 'admin' });

    const bundleBefore = await loadGeneralEvaluationBundle();
    const matchedComplaints = bundleBefore.complaints.filter((c) => c.dbId === cmpEval.complaintId);
    expect(matchedComplaints).toHaveLength(1);
    expect(matchedComplaints[0].source).toBe('evaluation');
    expect(matchedComplaints[0].status).toBe('جديدة');
    expect(matchedComplaints[0].category).toBe('مدة الانتظار');

    // Resolving without a resolution note MUST fail
    await expect(
      updateComplaintWorkflow(cmpEval.complaintId!, {
        status: 'تم الحل',
        resolution_note: '',
      }),
    ).rejects.toThrow();

    // Assign & resolve via workflow RPC
    await updateComplaintWorkflow(cmpEval.complaintId!, {
      status: 'تم تعيين مسؤول',
      assigned_staff_id: 'staff-1',
      assigned_staff_name: 'أ. منى حسن',
      followup_note: 'تم تحويل الشكوى لمسؤول خدمة المرضى',
    });

    await updateComplaintWorkflow(cmpEval.complaintId!, {
      status: 'تم الحل',
      resolution_note: 'تم التواصل مع المريضة وتنظيم جدول العيادة لتقليل التكدس',
      patient_contacted: true,
      patient_resolution_satisfaction: 5,
      action_taken: 'مكالمة اعتذار ومراجعة المواعيد',
    });

    const bundleAfter = await loadGeneralEvaluationBundle();
    const updatedCmp = bundleAfter.complaints.find((c) => c.dbId === cmpEval.complaintId);
    expect(updatedCmp?.status).toBe('تم الحل');
    expect(updatedCmp?.assignedStaffName).toBe('أ. منى حسن');
    expect(updatedCmp?.patientContacted).toBe(true);
    expect(updatedCmp?.patientResolutionSatisfaction).toBe(5);
    expect(updatedCmp?.resolutionNote).toContain('تنظيم جدول العيادة');

    // Legacy contact form suggestion is also intact in the same single complaints table
    const legacyRow = bundleAfter.complaints.find((c) => c.phone === '01122334455');
    expect(legacyRow).toBeTruthy();
    expect(legacyRow?.source).toBe('contact_form');

    // Follow-up audit rows recorded cleanly
    const cmpFollowups = bundleAfter.followups.filter((f) => f.complaintId === cmpEval.complaintId);
    expect(cmpFollowups.length).toBeGreaterThanOrEqual(2);

    // Non-return reason from evaluation recorded with patient_evaluation source
    const evalNonReturn = bundleAfter.nonReturnReasons.filter((n) => n.evaluationId === cmpEval.evaluationId);
    expect(evalNonReturn).toHaveLength(1);
    expect(evalNonReturn[0].source).toBe('patient_evaluation');
    expect(evalNonReturn[0].reasonCode).toBe('طول فترة الانتظار');

    // Direct call follow-up non-return reason stored separately as followup_call
    await recordNonReturnReasonFromCall({
      reasonCode: 'عدم توافر الطبيب في الموعد المناسب',
      explanation: 'تفضيل موعد مسائي',
      doctorName: 'د. أحمد محمود',
      staffName: 'موظف المتابعة',
    });
    const bundleCalls = await loadGeneralEvaluationBundle();
    expect(bundleCalls.nonReturnReasons.some((n) => n.source === 'followup_call')).toBe(true);
  });

  it('computes authentic analytics, doctor ratings, small-sample warnings, filters, and settings persistence', async () => {
    await saveEvaluationSettings({ rateLimitMinutes: 5, autoCreateComplaintOnLowRating: true, lowRatingThreshold: 2 });
    const bundle = await loadGeneralEvaluationBundle();
    expect(bundle.settings.rateLimitMinutes).toBe(5);
    expect(bundle.settings.autoCreateComplaintOnLowRating).toBe(true);

    const sampleEvals: EvaluationRecord[] = [
      {
        id: 'e1',
        evaluationCode: 'EVL-1',
        submissionChannel: 'public_nav',
        feedbackType: 'evaluation',
        patientName: 'مريض 1',
        patientPhone: '01000000001',
        doctorName: 'د. سلمى',
        serviceName: 'كشف عيون',
        visitDate: '2026-11-28',
        doctorOverallRating: 5,
        doctorTreatmentRating: 5,
        doctorExplanationRating: 5,
        doctorAttentionRating: 5,
        doctorClarityRating: 5,
        receptionOverallRating: 4,
        waitingTimeRange: '<15',
        actualWaitMinutes: 10,
        waitingTimeSatisfied: true,
        waitingTimeRating: 5,
        overallSatisfaction: 5,
        recommendationChoice: 'definitely_yes',
        contactConsent: true,
        reviewStatus: 'جديد',
        createdAt: '2026-11-28T10:00:00Z',
        updatedAt: '2026-11-28T10:00:00Z',
      },
      {
        id: 'e2',
        evaluationCode: 'EVL-2',
        submissionChannel: 'public_nav',
        feedbackType: 'complaint',
        patientName: 'مريض 2',
        patientPhone: '01000000002',
        doctorName: 'د. سلمى',
        serviceName: 'كشف عيون',
        visitDate: '2026-11-28',
        doctorOverallRating: 3,
        receptionOverallRating: 2,
        waitingTimeRange: '>60',
        actualWaitMinutes: 70,
        waitingTimeSatisfied: false,
        waitingTimeRating: 1,
        overallSatisfaction: 2,
        recommendationChoice: 'probably_no',
        nonReturnReason: 'طول فترة الانتظار',
        contactConsent: true,
        reviewStatus: 'جديد',
        createdAt: '2026-11-28T11:00:00Z',
        updatedAt: '2026-11-28T11:00:00Z',
      },
    ];

    const analytics = computeEvaluationAnalytics(sampleEvals, bundle.complaints, bundle.nonReturnReasons);
    expect(analytics.totalEvaluations).toBe(2);
    expect(analytics.avgOverallSatisfaction).toBeCloseTo(3.5, 2);
    expect(analytics.avgWaitingTimeRating).toBeCloseTo(3, 2);
    expect(analytics.waitingSatisfactionRatePct).toBe(50);
    expect(analytics.recommendationRatePct).toBe(50);

    const indicators = computeComplaintIndicators(bundle.complaints);
    expect(indicators.totalComplaintsAndSuggestions).toBeGreaterThanOrEqual(2);

    const docReport = computeDoctorRatingsReport(sampleEvals);
    expect(docReport).toHaveLength(1);
    expect(docReport[0].doctorName).toBe('د. سلمى');
    expect(docReport[0].smallSampleWarning).toBe(true); // < 5 evaluations
    expect(docReport[0].avgOverallDoctorRating).toBeCloseTo(4, 2);

    const filteredEvals = filterEvaluations(sampleEvals, { doctorName: 'د. سلمى', minRating: 4 });
    expect(filteredEvals).toHaveLength(1);
    expect(filteredEvals[0].id).toBe('e1');

    const resolvedCmp = filterComplaintsList(bundle.complaints, { complaintStatus: 'تم الحل' });
    expect(resolvedCmp.every((c) => c.status === 'تم الحل')).toBe(true);

    expect(WAITING_TIME_RANGE_OPTIONS).toHaveLength(5);
    expect(RECOMMENDATION_OPTIONS).toHaveLength(5);
    expect(NON_RETURN_REASONS).toHaveLength(12);
  });

  it('wires التقييم العام into public navigation and admin dashboard while omitting removed complaints tab and contact navbar item', () => {
    const indexSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/barada/index.tsx'), 'utf8');
    expect(indexSrc).toContain('generalEvaluation: "التقييم العام"');
    expect(indexSrc).toContain("id: 'general-evaluation'");
    expect(indexSrc).toContain('<PublicEvaluationView');
    expect(indexSrc).toContain('<GeneralEvaluationHub');
    expect(indexSrc).toContain("activeTab === 'general-evaluation'");
    expect(indexSrc).not.toContain("activeTab === 'complaints'");
    expect(indexSrc).not.toContain("setActiveTab('complaints')");
    expect(indexSrc).not.toContain("{ name: t.contact, id: 'contact' }");
    expect(indexSrc).not.toContain('روابط سريعة');

    const staffSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/barada/StaffManagement.tsx'), 'utf8');
    expect(staffSrc).toContain('GENERAL_EVALUATION_PERMISSIONS');
    expect(staffSrc).toContain("title: 'التقييم العام'");
  });
});
