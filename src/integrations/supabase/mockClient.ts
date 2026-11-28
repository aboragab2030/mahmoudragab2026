// In-memory mock Supabase client used when SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not configured.
// Allows the application to boot and operate in AI Studio without an external Supabase connection.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

type Row = Record<string, unknown>;
type QueryResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
  count?: number | null;
};

const addDaysIso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const upcoming = [1, 2, 3, 4, 5, 6, 7].map(addDaysIso);

const createInitialTables = (): Record<string, Row[]> => ({
  doctors: [
    {
      id: "11111111-1111-4111-8111-111111111101",
      name: "د. أحمد برادة",
      specialty: "استشاري جراحات الشبكية والجسم الزجاجي",
      image:
        "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=600",
      max_patients: 20,
      current_bookings: 0,
      fee: 400,
      rating: 4.9,
      top_specialties: ["جراحة الشبكية", "الليزر", "علاج اعتلال الشبكية السكري"],
      available_dates: upcoming,
      patients_per_hour: 4,
      experience: 18,
      education: "دكتوراه طب وجراحة العيون - جامعة القاهرة",
      follow_up_exam_count: 2,
      follow_up_surgery_count: 3,
      created_at: new Date().toISOString(),
    },
    {
      id: "11111111-1111-4111-8111-111111111102",
      name: "د. سارة المنصور",
      specialty: "استشاري جراحات الليزك والقرنية",
      image:
        "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=600",
      max_patients: 24,
      current_bookings: 0,
      fee: 350,
      rating: 4.8,
      top_specialties: ["تصحيح الإبصار بالفيمتو ليزك", "زراعة القرنية", "القرنية المخروطية"],
      available_dates: upcoming,
      patients_per_hour: 4,
      experience: 14,
      education: "زمالة كلية الجراحين الملكية البريطانية",
      follow_up_exam_count: 2,
      follow_up_surgery_count: 3,
      created_at: new Date().toISOString(),
    },
    {
      id: "11111111-1111-4111-8111-111111111103",
      name: "د. محمود الشريف",
      specialty: "استشاري المياه البيضاء والزرقاء (الجلوكوما)",
      image:
        "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=600",
      max_patients: 20,
      current_bookings: 0,
      fee: 350,
      rating: 4.9,
      top_specialties: ["جراحة الفاكو للمياه البيضاء", "زراعة العدسات", "علاج ضغط العين"],
      available_dates: upcoming,
      patients_per_hour: 4,
      experience: 16,
      education: "أستاذ مساعد طب وجراحة العيون",
      follow_up_exam_count: 2,
      follow_up_surgery_count: 3,
      created_at: new Date().toISOString(),
    },
  ],
  services: [
    {
      id: "22222222-2222-4222-8222-222222222201",
      title: "كشف عيون شامل",
      description: "فحص دقيق لقاع العين وقياس النظر وضغط العين بأحدث الأجهزة الرقمية.",
      icon_name: "Eye",
      color: "text-blue-600",
      price: 350,
      created_at: new Date().toISOString(),
    },
    {
      id: "22222222-2222-4222-8222-222222222202",
      title: "عمليات الليزك وتصحيح الإبصار",
      description: "تصحيح قصر وطول النظر والاستجماتيزم بأحدث تقنيات الفيمتو ليزك.",
      icon_name: "Zap",
      color: "text-indigo-600",
      price: 400,
      created_at: new Date().toISOString(),
    },
    {
      id: "22222222-2222-4222-8222-222222222203",
      title: "جراحات المياه البيضاء (الفاكو)",
      description: "إزالة المياه البيضاء بالموجات فوق الصوتية وزراعة العدسات المطوية.",
      icon_name: "ScanEye",
      color: "text-teal-600",
      price: 400,
      created_at: new Date().toISOString(),
    },
    {
      id: "22222222-2222-4222-8222-222222222204",
      title: "فحص وعلاج الشبكية",
      description: "التشخيص المبكر وعلاج اعتلال الشبكية السكري وحقن الشبكية.",
      icon_name: "Activity",
      color: "text-rose-600",
      price: 400,
      created_at: new Date().toISOString(),
    },
  ],
  hero_images: [
    {
      id: "33333333-3333-4333-8333-333333333301",
      url: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&q=80&w=1920",
      created_at: new Date().toISOString(),
    },
    {
      id: "33333333-3333-4333-8333-333333333302",
      url: "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&q=80&w=1920",
      created_at: new Date().toISOString(),
    },
    {
      id: "33333333-3333-4333-8333-333333333303",
      url: "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&q=80&w=1920",
      created_at: new Date().toISOString(),
    },
  ],
  partners: [
    {
      id: "44444444-4444-4444-8444-444444444401",
      name: "شركة مصر للتأمين",
      logo: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&q=80&w=300&h=300",
      description: "تغطية شاملة للكشف والعمليات الجراحية",
      created_at: new Date().toISOString(),
    },
    {
      id: "44444444-4444-4444-8444-444444444402",
      name: "نقابة المهندسين",
      logo: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=300&h=300",
      description: "خصم خاص 25% للأعضاء وأسرهم",
      created_at: new Date().toISOString(),
    },
    {
      id: "44444444-4444-4444-8444-444444444403",
      name: "ميدنت (MedNet)",
      logo: "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&q=80&w=300&h=300",
      description: "الشبكة الطبية المعتمدة (Class A & B)",
      created_at: new Date().toISOString(),
    },
  ],
  contracting_companies: [
    {
      id: 1,
      name: "مصر للتأمين (Misr Insurance)",
      documents: ["كارنيه الشركة الساري", "صورة بطاقة الرقم القومي", "نموذج تحويل معتمد"],
      manager_name: "أ. أحمد حسن",
      manager_phone: "01012345678",
      org_type: "شركة تأمين",
      sector: "التأمين الطبي",
      governorate: "الأقصر",
      city: "الأقصر",
      relationship_status: "نشط",
      is_active: true,
    },
    {
      id: 2,
      name: "أكسا للتأمين (AXA)",
      documents: ["كارنيه أكسا", "بطاقة الرقم القومي"],
      manager_name: "د. سارة محمود",
      manager_phone: "01234567890",
      org_type: "شركة تأمين",
      sector: "التأمين الصحي الدولي",
      governorate: "القاهرة",
      city: "القاهرة الجديدة",
      relationship_status: "نشط",
      is_active: true,
    },
    {
      id: 3,
      name: "ميدنت (MedNet)",
      documents: ["بطاقة ميدنت الممغنطة", "استمارة الكشف الطبي"],
      manager_name: "أ. محمد علي",
      manager_phone: "01122334455",
      org_type: "شركة إدارة رعاية صحية (TPA)",
      sector: "الرعاية الصحية",
      governorate: "القاهرة",
      city: "المعادي",
      relationship_status: "نشط",
      is_active: true,
    },
    {
      id: 4,
      name: "نقابة المهندسين",
      documents: ["كارنيه النقابة الساري", "خطاب تحويل من النقابة"],
      manager_name: "م. خالد ابراهيم",
      manager_phone: "01555555555",
      org_type: "نقابة",
      sector: "النقابات المهنية",
      governorate: "الأقصر",
      city: "الأقصر",
      relationship_status: "نشط",
      is_active: true,
    },
  ],
  app_settings: [],
  bookings: [],
  operations: [],
  payments: [],
  payment_notifications: [],
  app_notifications: [],
  complaints: [],
  profiles: [],
  user_roles: [],
  staff_invites: [],
  instapay_submissions: [],
  instapay_audit_events: [],
  paymob_payments: [],
  payment_gateway_settings: [{ id: 1, enabled: false, mode: "test" }],
  payment_gateway_secrets: [],
  contact_logs: [],
  offers: [],
  medical_video_categories: [
    { id: "33333333-3333-4333-8333-333333333301", name_ar: "أمراض العيون", name_en: "Eye Diseases", is_active: true, display_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "33333333-3333-4333-8333-333333333302", name_ar: "المياه البيضاء", name_en: "Cataract", is_active: true, display_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "33333333-3333-4333-8333-333333333303", name_ar: "القرنية", name_en: "Cornea", is_active: true, display_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "33333333-3333-4333-8333-333333333304", name_ar: "الليزك وتصحيح الإبصار", name_en: "LASIK & Vision Correction", is_active: true, display_order: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "33333333-3333-4333-8333-333333333305", name_ar: "الشبكية والجسم الزجاجي", name_en: "Retina & Vitreous", is_active: true, display_order: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "33333333-3333-4333-8333-333333333306", name_ar: "الحول وعيون الأطفال", name_en: "Strabismus & Pediatric Ophthalmology", is_active: true, display_order: 6, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "33333333-3333-4333-8333-333333333307", name_ar: "الجلوكوما والمياه الزرقاء", name_en: "Glaucoma", is_active: true, display_order: 7, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "33333333-3333-4333-8333-333333333308", name_ar: "تجميل العيون", name_en: "Oculoplastic Surgery", is_active: true, display_order: 8, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "33333333-3333-4333-8333-333333333309", name_ar: "الفحوصات الطبية", name_en: "Medical Examinations", is_active: true, display_order: 9, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "33333333-3333-4333-8333-333333333310", name_ar: "نصائح وإرشادات طبية", name_en: "Medical Advice & Guidelines", is_active: true, display_order: 10, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "33333333-3333-4333-8333-333333333311", name_ar: "فيديوهات الأطباء", name_en: "Doctors Videos", is_active: true, display_order: 11, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "33333333-3333-4333-8333-333333333312", name_ar: "أخرى", name_en: "Other", is_active: true, display_order: 12, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ],
  medical_videos: [],
  partner_contacts: [],
  partner_activities: [],
  partner_contracts: [],
  partner_contract_renewals: [],
  partner_followups: [],
  partner_alert_settings: [{ id: 1, alert_days: [90, 60, 30, 15, 7, 0], notify_overdue: true, auto_mark_expiring_days: 30 }],
  partner_renewal_alert_logs: [],
  partner_audit_logs: [],
  patients: [],
  clinic_audit_logs: [],
  accounting_categories: [
    { id: "acct-cat-rev-1", kind: "revenue", code: "rev_consultations", name_ar: "الكشوفات", description: null, is_system: true, is_active: true, display_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-rev-2", kind: "revenue", code: "rev_surgeries", name_ar: "العمليات الجراحية", description: null, is_system: true, is_active: true, display_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-rev-3", kind: "revenue", code: "rev_procedures", name_ar: "الإجراءات الطبية والفحوصات", description: null, is_system: true, is_active: true, display_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-rev-4", kind: "revenue", code: "rev_followups", name_ar: "المتابعات", description: null, is_system: true, is_active: true, display_order: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-rev-5", kind: "revenue", code: "rev_offers", name_ar: "العروض الطبية", description: null, is_system: true, is_active: true, display_order: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-rev-6", kind: "revenue", code: "rev_contracting", name_ar: "جهات التعاقد والتأمين", description: null, is_system: true, is_active: true, display_order: 6, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-rev-7", kind: "revenue", code: "rev_other", name_ar: "إيرادات أخرى", description: null, is_system: true, is_active: true, display_order: 7, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-exp-1", kind: "expense", code: "exp_salaries", name_ar: "رواتب وأجور", description: null, is_system: true, is_active: true, display_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-exp-2", kind: "expense", code: "exp_rent", name_ar: "إيجار", description: null, is_system: true, is_active: true, display_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-exp-3", kind: "expense", code: "exp_medical_supplies", name_ar: "مستلزمات طبية", description: null, is_system: true, is_active: true, display_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-exp-4", kind: "expense", code: "exp_equipment_maintenance", name_ar: "أجهزة وصيانة", description: null, is_system: true, is_active: true, display_order: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-exp-5", kind: "expense", code: "exp_marketing", name_ar: "تسويق وإعلان", description: null, is_system: true, is_active: true, display_order: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-exp-6", kind: "expense", code: "exp_utilities", name_ar: "كهرباء ومرافق وإنترنت", description: null, is_system: true, is_active: true, display_order: 6, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-exp-7", kind: "expense", code: "exp_hospitality", name_ar: "نظافة وضيافة", description: null, is_system: true, is_active: true, display_order: 7, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-exp-8", kind: "expense", code: "exp_admin", name_ar: "مصروفات إدارية", description: null, is_system: true, is_active: true, display_order: 8, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: "acct-cat-exp-9", kind: "expense", code: "exp_other", name_ar: "مصروفات أخرى", description: null, is_system: true, is_active: true, display_order: 9, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ],
  accounting_settings: [
    {
      id: 1,
      clinic_tax_number: null,
      fiscal_year_start_month: 1,
      require_expense_approval: false,
      lock_before_date: null,
      default_currency: "EGP",
      voucher_notes_footer: null,
      updated_by: null,
      updated_by_name: null,
      updated_at: new Date().toISOString(),
    },
  ],
  accounting_accounts: [],
  accounting_revenues: [],
  accounting_expenses: [],
  accounting_expense_payments: [],
  accounting_transfers: [],
  accounting_vouchers: [],
  accounting_account_transactions: [],
  patient_billing_records: [],
  patient_billing_transactions: [],
});

function checkMockPermission(
  uid: string,
  domain: "patient" | "staff_booking" | "accounting" | "patient_billing",
  perm: string,
): boolean {
  if (!uid) return false;
  const isAdmin = tables.user_roles.some((r) => r.user_id === uid && r.role === "admin");
  if (isAdmin) return true;
  const profile = tables.profiles.find((p) => p.user_id === uid);
  if (!profile || profile.is_active === false) return false;
  if (!tables.user_roles.some((r) => r.user_id === uid)) return false;
  const perms = Array.isArray(profile.permissions) ? (profile.permissions as string[]) : [];
  if (perms.includes(perm)) return true;
  if (domain === "patient" && perms.includes("manage_bookings")) {
    return ["patients_view", "patients_search", "patients_view_history"].includes(perm);
  }
  if (domain === "staff_booking" && perms.includes("manage_bookings")) {
    return ["staff_bookings_view", "staff_bookings_edit", "staff_bookings_cancel", "staff_bookings_view_all"].includes(perm);
  }
  if (domain === "accounting" && perms.includes("accounting_manage")) {
    return !["accounting_manage_opening_balances", "accounting_manage_settings", "accounting_view_sensitive_data"].includes(perm);
  }
  return false;
}

function isUuidLike(val: unknown): val is string {
  return typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

function computeMockBookingExpectedAmount(serviceName: string, doctorId: unknown, doctorName: string): number {
  const lower = String(serviceName || "").toLowerCase();
  if (lower.includes("متابعة") || lower.includes("متابعه") || lower.includes("re-exam") || lower.includes("follow")) {
    return 0;
  }
  const svc = tables.services.find((s) => s.title === serviceName);
  const doc =
    tables.doctors.find((d) => doctorId && d.id === doctorId) ||
    tables.doctors.find((d) => d.name === doctorName);
  return Math.max(Number(svc?.price || 0) + Number(doc?.fee || 0), 0);
}

function recalculateMockBillingRecord(bookingId: string): Row | null {
  const rec = tables.patient_billing_records.find((r) => r.booking_id === bookingId);
  if (!rec) return null;

  const txns = tables.patient_billing_transactions.filter((t) => t.billing_record_id === rec.id);
  const paidTxns = txns.filter((t) => t.transaction_kind === "payment" && t.status === "confirmed");
  const refundTxns = txns.filter((t) => t.transaction_kind === "refund" && t.status === "confirmed");

  const paid = Math.round(paidTxns.reduce((s, t) => s + Number(t.amount || 0), 0) * 100) / 100;
  const refunded = Math.round(refundTxns.reduce((s, t) => s + Number(t.amount || 0), 0) * 100) / 100;
  const originalPrice = Math.max(Number(rec.original_price || 0), 0);
  const discountAmount = Math.max(Number(rec.discount_amount || 0), 0);
  const finalDue = Math.round(Math.max(originalPrice - discountAmount, 0) * 100) / 100;
  const netPaid = Math.round(Math.max(paid - refunded, 0) * 100) / 100;
  const isCancelled = rec.booking_status === "cancelled";

  let status = "غير مدفوع";
  let remaining = finalDue;

  if (refunded > 0) {
    if (refunded >= paid) {
      status = "مسترد بالكامل";
      remaining = isCancelled ? 0 : finalDue;
    } else {
      status = "مسترد جزئيًا";
      remaining = isCancelled ? 0 : Math.round(Math.max(finalDue - netPaid, 0) * 100) / 100;
    }
  } else if (isCancelled && paid === 0) {
    status = "ملغي";
    remaining = 0;
  } else if (paid <= 0) {
    status = "غير مدفوع";
    remaining = finalDue;
  } else if (paid >= finalDue) {
    status = "مدفوع بالكامل";
    remaining = 0;
  } else {
    status = "مدفوع جزئيًا";
    remaining = isCancelled ? 0 : Math.round(Math.max(finalDue - paid, 0) * 100) / 100;
  }

  const latestPay = [...paidTxns].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];

  rec.final_amount_due = finalDue;
  rec.paid_amount = paid;
  rec.refunded_amount = refunded;
  rec.remaining_balance = remaining;
  rec.financial_status = status;
  rec.last_payment_at = latestPay ? latestPay.created_at : null;
  rec.last_payment_method = latestPay ? latestPay.payment_method : rec.last_payment_method || null;
  rec.updated_at = new Date().toISOString();

  const bookingRow = tables.bookings.find((b) => b.id === bookingId);
  if (bookingRow) {
    bookingRow.payment_status = status === "مدفوع بالكامل" ? "paid" : "pending";
    bookingRow.updated_at = new Date().toISOString();
  }
  return rec;
}

function syncBookingToMockPatientBilling(b: Row): Row {
  const bookingId = String(b.id);
  const normPhone = String(b.phone || "").replace(/\D/g, "");
  let patientId = b.patient_id ? String(b.patient_id) : null;
  if (!patientId && normPhone) {
    const matched = tables.patients.find((p) => String(p.phone || "").replace(/\D/g, "") === normPhone);
    if (matched) patientId = String(matched.id);
  }
  const origPrice = computeMockBookingExpectedAmount(
    String(b.service || ""),
    b.doctor_id,
    String(b.doctor_name || ""),
  );
  const existing = tables.patient_billing_records.find((r) => r.booking_id === bookingId);
  if (existing) {
    existing.patient_id = patientId || existing.patient_id || null;
    existing.patient_name = String(b.patient_name || existing.patient_name || "");
    existing.patient_phone = String(b.phone || existing.patient_phone || "");
    existing.booking_source = String(b.booking_source || existing.booking_source || "website");
    existing.doctor_id = b.doctor_id || existing.doctor_id || null;
    existing.doctor_name = String(b.doctor_name || existing.doctor_name || "");
    existing.service_name = String(b.service || existing.service_name || "");
    existing.appointment_date = String(b.date || existing.appointment_date || "");
    existing.original_price = origPrice;
    existing.booking_status = b.status === "cancelled" ? "cancelled" : "confirmed";
    existing.assigned_staff_id = b.assigned_staff_id || existing.assigned_staff_id || null;
    existing.assigned_staff_name = b.assigned_staff_name || existing.assigned_staff_name || null;
    existing.updated_at = new Date().toISOString();
  } else {
    tables.patient_billing_records.push({
      id: crypto.randomUUID(),
      booking_id: bookingId,
      patient_id: patientId,
      patient_name: String(b.patient_name || ""),
      patient_phone: String(b.phone || ""),
      booking_source: String(b.booking_source || "website"),
      doctor_id: b.doctor_id || null,
      doctor_name: String(b.doctor_name || ""),
      service_name: String(b.service || ""),
      appointment_date: String(b.date || ""),
      booking_created_at: b.created_at || new Date().toISOString(),
      original_price: origPrice,
      discount_amount: 0,
      discount_reason: null,
      final_amount_due: origPrice,
      paid_amount: 0,
      refunded_amount: 0,
      remaining_balance: b.status === "cancelled" ? 0 : origPrice,
      financial_status: b.status === "cancelled" ? "ملغي" : "غير مدفوع",
      booking_status: b.status === "cancelled" ? "cancelled" : "confirmed",
      created_by_staff_id: b.created_by_staff_id || null,
      created_by_staff_name: b.created_by_staff_name || null,
      assigned_staff_id: b.assigned_staff_id || null,
      assigned_staff_name: b.assigned_staff_name || null,
      last_payment_at: null,
      last_payment_method: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  return recalculateMockBillingRecord(bookingId)!;
}

function resolvePaymentMethodFromPaymentRow(p: Row): string {
  const pt = String(p.payment_type || "");
  const detail = String(p.payment_type_detail || "").toLowerCase();
  if (pt === "instapay") return "instapay";
  if (pt === "wallet") return "wallet";
  if (detail.includes("paymob")) return "paymob";
  if (detail.includes("نقد")) return "cash";
  if (detail.includes("بنك")) return "bank_transfer";
  if (detail.includes("بطاقة")) return "card";
  return "other";
}

function syncPaidPaymentToMockBillingAndAccounting(p: Row) {
  if (p.status !== "paid") return;
  if (!isUuidLike(p.booking_id)) return;
  const bookingRow = tables.bookings.find((b) => b.id === p.booking_id);
  if (!bookingRow) return;

  const bill = syncBookingToMockPatientBilling(bookingRow);
  const existingTxn = tables.patient_billing_transactions.find(
    (t) => t.payment_id === p.id && t.transaction_kind === "payment" && t.status === "confirmed",
  );
  if (existingTxn) return;

  const method = resolvePaymentMethodFromPaymentRow(p);
  const revMethod = ["cash", "instapay", "wallet", "paymob", "bank_transfer", "card"].includes(method) ? method : "paymob";
  const today = String(p.matched_at || p.created_at || new Date().toISOString()).slice(0, 10);
  const actorName = String(p.confirmed_by_staff_name || "نظام الدفع الإلكتروني");

  let rev = tables.accounting_revenues.find(
    (r) => r.source_table === "payments" && r.source_id === p.id && r.status === "posted",
  );
  if (!rev) {
    const revId = crypto.randomUUID();
    const docNumber = `REV-${today.replace(/-/g, "")}-${revId.slice(0, 6).toUpperCase()}`;
    rev = {
      id: revId,
      doc_number: docNumber,
      revenue_date: today,
      category_id: "acct-cat-rev-1",
      category_name: "الكشوفات",
      revenue_source: bookingRow.contracting_company_id ? "contracting" : "booking",
      description: `تحصيل حجز ${bookingRow.patient_name} - ${bookingRow.doctor_name} (${p.transaction_id || ""})`,
      amount: Number(p.amount || 0),
      payment_method: revMethod,
      account_id: p.account_id || null,
      patient_id: bill.patient_id || null,
      patient_name: bookingRow.patient_name,
      booking_id: bookingRow.id,
      doctor_name: bookingRow.doctor_name,
      service_name: bookingRow.service,
      booking_source: bookingRow.booking_source || "website",
      contracting_company_id: bookingRow.contracting_company_id || null,
      responsible_staff_id: p.confirmed_by_staff_id || null,
      responsible_staff_name: actorName,
      notes: p.notes || null,
      attachments: [],
      status: "posted",
      source_table: "payments",
      source_id: p.id,
      created_by: p.confirmed_by_staff_id || null,
      created_by_name: actorName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    tables.accounting_revenues.push(rev);

    if (p.account_id) {
      tables.accounting_account_transactions.push({
        id: crypto.randomUUID(),
        account_id: p.account_id,
        transaction_date: today,
        direction: "in",
        entry_type: "revenue",
        amount: Number(p.amount || 0),
        reference_table: "accounting_revenues",
        reference_id: revId,
        description: `${docNumber} - تحصيل حجز ${bookingRow.patient_name}`,
        created_by: p.confirmed_by_staff_id || null,
        created_by_name: actorName,
        created_at: new Date().toISOString(),
      });
    }
  }

  tables.patient_billing_transactions.push({
    id: crypto.randomUUID(),
    billing_record_id: bill.id,
    booking_id: bookingRow.id,
    patient_id: bill.patient_id || null,
    payment_id: p.id,
    revenue_id: rev.id,
    transaction_kind: "payment",
    amount: Number(p.amount || 0),
    payment_method: method,
    account_id: p.account_id || null,
    transaction_ref: String(p.transaction_id || `PAY-${String(p.id).slice(0, 8)}`),
    idempotency_key: `payment:${p.id}`,
    confirmed_via:
      String(p.notes || "").toLowerCase().includes("paymob")
        ? "paymob_webhook"
        : p.payment_type === "instapay"
          ? "instapay_review"
          : "payment_webhook",
    confirmed_by_staff_id: p.confirmed_by_staff_id || null,
    confirmed_by_staff_name: actorName,
    notes: p.notes || null,
    status: "confirmed",
    created_at: String(p.matched_at || p.created_at || new Date().toISOString()),
  });

  recalculateMockBillingRecord(String(bookingRow.id));
}

function pushMockPatientAddedNotice(patientName: string, amount: number, detailMessage: string) {
  const cleanName = String(patientName || "").trim();
  if (!cleanName) return;
  const cutoff = Date.now() - 15000;
  const duplicate = tables.payment_notifications.some(
    (n) =>
      n.is_read === false &&
      String(n.patient_name || "").trim() === cleanName &&
      String(n.message || "").startsWith("تم إضافة ") &&
      new Date(String(n.created_at || 0)).getTime() >= cutoff,
  );
  if (duplicate) return;
  tables.payment_notifications.push({
    id: crypto.randomUUID(),
    payment_id: null,
    patient_name: cleanName,
    amount: Math.max(Number(amount || 0), 0),
    message: detailMessage,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

function pushMockBookingCancelledNotice(bookingRow: Row) {
  const bookingId = String(bookingRow.id || "");
  const detail = ` - ${String(bookingRow.service || "")} - د. ${String(bookingRow.doctor_name || "")} - ${String(bookingRow.date || "")} ${String(bookingRow.time || "")}`;
  const due = computeMockBookingExpectedAmount(
    String(bookingRow.service || ""),
    bookingRow.doctor_id,
    String(bookingRow.doctor_name || ""),
  );
  const paidPayments = tables.payments.filter(
    (p) => String(p.booking_id || "") === bookingId && p.status === "paid",
  );
  if (paidPayments.length > 0) {
    for (const p of paidPayments) {
      tables.payment_notifications.push({
        id: crypto.randomUUID(),
        payment_id: String(p.id),
        patient_name: String(bookingRow.patient_name || ""),
        amount: Number(p.amount || due || 0),
        message: `تم إلغاء إجراء مدفوع${detail}`,
        is_read: false,
        created_at: new Date().toISOString(),
      });
    }
    return;
  }
  const isPaidBooking = bookingRow.payment_status === "paid";
  tables.payment_notifications.push({
    id: crypto.randomUUID(),
    payment_id: null,
    patient_name: String(bookingRow.patient_name || ""),
    amount: due,
    message: `${isPaidBooking ? "تم إلغاء إجراء مدفوع" : "تم إلغاء خدمة"}${detail}`,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

const tables: Record<string, Row[]> = createInitialTables();

function getTable(name: string): Row[] {
  if (name === "app_settings_public") return tables.app_settings;
  if (name === "contracting_companies_public") return tables.contracting_companies;
  if (!tables[name]) tables[name] = [];
  return tables[name];
}

function compareValues(av: unknown, bv: unknown): number {
  if (av === bv) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return String(av) < String(bv) ? -1 : 1;
}

function makeQueryBuilder(tableName: string) {
  let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  let payload: Row | Row[] | null = null;
  const filters: Array<(row: Row) => boolean> = [];
  const orderBys: Array<{ col: string; ascending: boolean }> = [];
  let limitVal: number | null = null;
  let singleMode: "single" | "maybeSingle" | null = null;
  let headOnly = false;
  let wantCount = false;

  const execute = async (): Promise<QueryResult> => {
    const rows = getTable(tableName);

    if (op === "select") {
      let result = rows.filter((r) => filters.every((fn) => fn(r)));
      const total = result.length;
      if (orderBys.length > 0) {
        result = [...result].sort((a, b) => {
          for (const { col, ascending } of orderBys) {
            const cmp = compareValues(a[col], b[col]) * (ascending ? 1 : -1);
            if (cmp !== 0) return cmp;
          }
          return 0;
        });
      }
      if (limitVal !== null) result = result.slice(0, limitVal);
      if (headOnly) {
        return { data: null, error: null, count: wantCount ? total : null };
      }
      if (singleMode === "maybeSingle") {
        return { data: result[0] ?? null, error: null };
      }
      if (singleMode === "single") {
        if (!result[0])
          return { data: null, error: { code: "PGRST116", message: "No rows found" } };
        return { data: result[0], error: null };
      }
      return { data: result, error: null, ...(wantCount ? { count: total } : {}) };
    }

    if (op === "insert") {
      const list = Array.isArray(payload) ? payload : payload ? [payload] : [];
      const items = list.map((item) => {
        const row: Row = {
          id: item.id ?? crypto.randomUUID(),
          created_at: item.created_at ?? new Date().toISOString(),
          updated_at: item.updated_at ?? new Date().toISOString(),
          ...item,
        };
        if (tableName === "accounting_expenses") {
          const total = Number(row.total_amount || 0);
          const paid = Number(row.paid_amount || 0);
          row.remaining_amount = Math.max(total - paid, 0);
        }
        return row;
      });

      if (tableName === "patients") {
        for (const item of items) {
          const normPhone = String(item.phone || "").replace(/\D/g, "");
          if (rows.some((r) => String(r.phone || "").replace(/\D/g, "") === normPhone)) {
            return { data: null, error: { code: "23505", message: "يوجد ملف مريض مسجل مسبقاً بنفس رقم الهاتف" } };
          }
        }
      }

      if (tableName === "accounting_revenues") {
        for (const item of items) {
          if (item.source_table && item.source_id && item.status !== "reversed") {
            const exists = rows.some(
              (r) =>
                r.status === "posted" &&
                r.source_table === item.source_table &&
                r.source_id === item.source_id,
            );
            if (exists) {
              return { data: null, error: { code: "23505", message: "تم ترحيل هذه الدفعة مسبقاً إلى الحسابات ولا يمكن تكرارها" } };
            }
          }
        }
      }

      if (tableName === "bookings") {
        const uid = getActiveMockSession()?.user?.id || "";
        for (const item of items) {
          const source = String(item.booking_source || "website");
          if ((source === "staff" || source === "admin") && uid && !checkMockPermission(uid, "staff_booking", "staff_bookings_create")) {
            return { data: null, error: { code: "42501", message: "permission denied: staff_bookings_create required" } };
          }
          // Strictly forbid confirming payment directly on booking insert
          item.payment_status = "pending";

          const overrideReason = String(item.override_reason || "").trim();
          if (overrideReason && uid && !checkMockPermission(uid, "staff_booking", "staff_bookings_override_rules")) {
            return { data: null, error: { code: "42501", message: "permission denied: staff_bookings_override_rules required" } };
          }
          if (item.status === "confirmed" && !overrideReason) {
            const doc = tables.doctors.find((d) => d.id === item.doctor_id || d.name === item.doctor_name);
            if (doc) {
              const dayMax = Number(doc.max_patients || 0);
              if (dayMax > 0) {
                const dayCount = rows.filter((b) => b.status === "confirmed" && b.date === item.date && (b.doctor_id === doc.id || b.doctor_name === doc.name)).length;
                if (dayCount >= dayMax) return { data: null, error: { code: "P0001", message: "DOCTOR_DAY_FULL" } };
              }
              const hourMax = Number(doc.patients_per_hour || 0);
              if (hourMax > 0) {
                const hourPart = String(item.time || "").trim().split(":")[0];
                const periodPart = String(item.time || "").trim().split(" ")[1] || "";
                const hourCount = rows.filter((b) => {
                  if (b.status !== "confirmed" || b.date !== item.date) return false;
                  if (b.doctor_id !== doc.id && b.doctor_name !== doc.name) return false;
                  const bt = String(b.time || "").trim();
                  return bt.split(":")[0] === hourPart && (bt.split(" ")[1] || "") === periodPart;
                }).length;
                if (hourCount >= hourMax) return { data: null, error: { code: "P0001", message: "DOCTOR_HOUR_FULL" } };
              }
            }
          }
        }
      }

      if (tableName === "payments") {
        const uid = getActiveMockSession()?.user?.id || "";
        if (uid && !checkMockPermission(uid, "patient_billing", "payment_confirm") && !checkMockPermission(uid, "patient_billing", "payment_confirm_partial")) {
          return { data: null, error: { code: "42501", message: "permission denied: payment_confirm required" } };
        }
      }

      rows.push(...items);
      if (tableName === "profiles") syncProfilesToMockAuth(items);
      if (tableName === "patients") {
        for (const item of items) {
          pushMockPatientAddedNotice(
            String(item.full_name || ""),
            0,
            `تم إضافة مريض جديد: ${String(item.full_name || "")}${item.phone ? ` (${String(item.phone)})` : ""}`,
          );
        }
      }
      if (tableName === "bookings") {
        for (const item of items) {
          syncBookingToMockPatientBilling(item);
          const amt = computeMockBookingExpectedAmount(
            String(item.service || ""),
            item.doctor_id,
            String(item.doctor_name || ""),
          );
          pushMockPatientAddedNotice(
            String(item.patient_name || ""),
            amt,
            `تم إضافة مريض / حجز جديد: ${String(item.service || "")}${item.doctor_name ? ` - د. ${String(item.doctor_name)}` : ""}`,
          );
        }
      }
      if (tableName === "payments") {
        for (const item of items) syncPaidPaymentToMockBillingAndAccounting(item);
      }
      if (singleMode) return { data: items[0] ?? null, error: null };
      return { data: items, error: null };
    }

    if (op === "upsert") {
      const list = Array.isArray(payload) ? payload : payload ? [payload] : [];
      const items: Row[] = list.map((item) => ({
        id: item.id ?? crypto.randomUUID(),
        created_at: item.created_at ?? new Date().toISOString(),
        ...item,
      }));
      for (const item of items) {
        const idx = rows.findIndex(
          (r) => r.id === item.id || (Boolean(item.user_id) && r.user_id === item.user_id),
        );
        if (idx >= 0) rows[idx] = { ...rows[idx], ...item };
        else rows.push(item);
      }
      if (tableName === "profiles") syncProfilesToMockAuth(items);
      if (singleMode) return { data: items[0] ?? null, error: null };
      return { data: items, error: null };
    }

    if (op === "update") {
      const updated: Row[] = [];
      const newlyCancelledBookings: Row[] = [];
      for (let i = 0; i < rows.length; i++) {
        if (filters.every((fn) => fn(rows[i]))) {
          const prevStatus = rows[i].status;
          const nextRow: Row = { ...rows[i], ...(payload as Row), updated_at: new Date().toISOString() };
          if (tableName === "bookings" && nextRow.payment_status !== rows[i].payment_status) {
            const hasPaidPayment = tables.payments.some((p) => p.booking_id === rows[i].id && p.status === "paid");
            if (!(nextRow.payment_status === "paid" && hasPaidPayment)) {
              return { data: null, error: { code: "42501", message: "permission denied: booking payment_status cannot be confirmed directly" } };
            }
          }
          if (tableName === "payments") {
            const uid = getActiveMockSession()?.user?.id || "";
            if (uid && !checkMockPermission(uid, "patient_billing", "payment_confirm") && !checkMockPermission(uid, "patient_billing", "payment_confirm_partial")) {
              return { data: null, error: { code: "42501", message: "permission denied: payment_confirm required" } };
            }
          }
          if (tableName === "accounting_expenses") {
            const total = Number(nextRow.total_amount || 0);
            const paid = Number(nextRow.paid_amount || 0);
            nextRow.remaining_amount = Math.max(total - paid, 0);
          }
          if (tableName === "accounting_accounts" && nextRow.opening_balance !== rows[i].opening_balance) {
            const uid = getActiveMockSession()?.user?.id || "";
            if (uid && !checkMockPermission(uid, "accounting", "accounting_manage_opening_balances")) {
              return { data: null, error: { code: "42501", message: "permission denied: accounting_manage_opening_balances required" } };
            }
          }
          if (tableName === "patients" && nextRow.phone) {
            const normPhone = String(nextRow.phone).replace(/\D/g, "");
            if (rows.some((r, idx) => idx !== i && String(r.phone || "").replace(/\D/g, "") === normPhone)) {
              return { data: null, error: { code: "23505", message: "يوجد ملف مريض مسجل مسبقاً بنفس رقم الهاتف" } };
            }
          }
          rows[i] = nextRow;
          updated.push(rows[i]);
          if (tableName === "bookings" && nextRow.status === "cancelled" && prevStatus !== "cancelled") {
            newlyCancelledBookings.push(nextRow);
          }
        }
      }
      if (tableName === "profiles") syncProfilesToMockAuth(updated);
      if (tableName === "bookings") {
        for (const row of updated) syncBookingToMockPatientBilling(row);
        for (const row of newlyCancelledBookings) pushMockBookingCancelledNotice(row);
      }
      if (tableName === "payments") {
        for (const row of updated) syncPaidPaymentToMockBillingAndAccounting(row);
      }
      if (singleMode) return { data: updated[0] ?? null, error: null };
      return { data: updated, error: null };
    }

    if (op === "delete") {
      const kept: Row[] = [];
      const removed: Row[] = [];
      for (const r of rows) {
        if (filters.every((fn) => fn(r))) removed.push(r);
        else kept.push(r);
      }
      tables[tableName] = kept;
      if (singleMode) return { data: removed[0] ?? null, error: null };
      return { data: removed, error: null };
    }

    return { data: null, error: null };
  };

  const builder = {
    select(_cols?: string, opts?: { count?: "exact"; head?: boolean }) {
      if (op === "select") {
        if (opts?.count) wantCount = true;
        if (opts?.head) headOnly = true;
      }
      return builder;
    },
    insert(data: Row | Row[]) {
      op = "insert";
      payload = data;
      return builder;
    },
    update(data: Row) {
      op = "update";
      payload = data;
      return builder;
    },
    upsert(data: Row | Row[]) {
      op = "upsert";
      payload = data;
      return builder;
    },
    delete() {
      op = "delete";
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val);
      return builder;
    },
    neq(col: string, val: unknown) {
      filters.push((r) => r[col] !== val);
      return builder;
    },
    gt(col: string, val: unknown) {
      filters.push((r) => compareValues(r[col], val) > 0);
      return builder;
    },
    gte(col: string, val: unknown) {
      filters.push((r) => compareValues(r[col], val) >= 0);
      return builder;
    },
    lt(col: string, val: unknown) {
      filters.push((r) => compareValues(r[col], val) < 0);
      return builder;
    },
    lte(col: string, val: unknown) {
      filters.push((r) => compareValues(r[col], val) <= 0);
      return builder;
    },
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.includes(r[col]));
      return builder;
    },
    is(col: string, val: unknown) {
      filters.push((r) => r[col] === val);
      return builder;
    },
    or(expr: string) {
      const clauses = String(expr || "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      filters.push((r) =>
        clauses.some((clause) => {
          const firstDot = clause.indexOf(".");
          const secondDot = clause.indexOf(".", firstDot + 1);
          if (firstDot <= 0 || secondDot <= firstDot) return false;
          const col = clause.slice(0, firstDot);
          const operator = clause.slice(firstDot + 1, secondDot);
          const val = clause.slice(secondDot + 1);
          if (operator === "eq") return String(r[col] ?? "") === val;
          return false;
        }),
      );
      return builder;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      orderBys.push({ col, ascending: opts?.ascending !== false });
      return builder;
    },
    limit(n: number) {
      limitVal = n;
      return builder;
    },
    single() {
      singleMode = "single";
      return builder;
    },
    maybeSingle() {
      singleMode = "maybeSingle";
      return builder;
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return execute().then(onfulfilled, onrejected);
    },
  };

  return builder;
}

type MockAuthUser = {
  id: string;
  email: string;
  password: string;
  name: string;
  username: string;
  login_username: string;
  role: "admin" | "staff";
  permissions?: string[];
  is_active?: boolean;
};

const MOCK_AUTH_STORAGE_KEY = "barada_mock_auth_v1";

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createMockJwt(user: MockAuthUser): string {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      user_role: user.role,
      role: "authenticated",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    }),
  );
  return `${header}.${payload}.mock-signature`;
}

function toSupabaseUser(u: MockAuthUser) {
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { name: u.name },
  };
}

function buildMockSession(u: MockAuthUser) {
  return {
    access_token: createMockJwt(u),
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 7,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    refresh_token: `mock-refresh-${u.id}`,
    user: toSupabaseUser(u),
  };
}

const mockAuthUsers: MockAuthUser[] = [];
let mockSessionUserId: string | null = null;
let mockAuthHydrated = false;
const authListeners = new Set<(event: string, session: ReturnType<typeof buildMockSession> | null) => void>();

function syncProfilesToMockAuth(profileRows: Row[]) {
  let changed = false;
  for (const row of profileRows) {
    const uid = typeof row.user_id === "string" ? row.user_id : "";
    if (!uid) continue;
    const authUser = mockAuthUsers.find((u) => u.id === uid);
    if (!authUser) continue;
    if (Array.isArray(row.permissions)) {
      authUser.permissions = row.permissions as string[];
      changed = true;
    }
    if (typeof row.is_active === "boolean") {
      authUser.is_active = row.is_active;
      changed = true;
    }
    if (typeof row.name === "string") {
      authUser.name = row.name;
      changed = true;
    }
  }
  if (changed) persistMockAuth();
}

function syncUserToTables(u: MockAuthUser) {
  if (!tables.profiles.some((p) => p.user_id === u.id)) {
    tables.profiles.push({
      id: u.id,
      user_id: u.id,
      name: u.name,
      username: u.username,
      login_username: u.login_username,
      permissions: Array.isArray(u.permissions) ? u.permissions : [],
      is_active: u.is_active !== false,
      created_at: new Date().toISOString(),
    });
  }
  if (!tables.user_roles.some((r) => r.user_id === u.id)) {
    tables.user_roles.push({
      id: crypto.randomUUID(),
      user_id: u.id,
      role: u.role,
      created_at: new Date().toISOString(),
    });
  }
}

function hydrateMockAuth() {
  if (mockAuthHydrated) return;
  mockAuthHydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(MOCK_AUTH_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { users?: MockAuthUser[]; sessionUserId?: string | null };
    if (Array.isArray(parsed.users)) {
      for (const u of parsed.users) {
        if (u && typeof u.id === "string" && typeof u.email === "string") {
          mockAuthUsers.push(u);
          syncUserToTables(u);
        }
      }
    }
    if (typeof parsed.sessionUserId === "string") {
      mockSessionUserId = parsed.sessionUserId;
    }
  } catch {
    // ignore corrupted local storage
  }
}

function persistMockAuth() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      MOCK_AUTH_STORAGE_KEY,
      JSON.stringify({ users: mockAuthUsers, sessionUserId: mockSessionUserId }),
    );
  } catch {
    // ignore storage quota errors
  }
}

function getActiveMockSession() {
  hydrateMockAuth();
  if (!mockSessionUserId) return null;
  const user = mockAuthUsers.find((u) => u.id === mockSessionUserId);
  if (!user) return null;
  const profile = tables.profiles.find((p) => p.user_id === user.id);
  if (profile && profile.is_active === false) return null;
  return buildMockSession(user);
}

function notifyAuthListeners(event: string, session: ReturnType<typeof buildMockSession> | null) {
  for (const cb of authListeners) {
    try {
      cb(event, session);
    } catch {
      // ignore listener errors
    }
  }
}

export function createMockSupabaseClient(): SupabaseClient<Database> {
  hydrateMockAuth();

  const channelMock = () => {
    const ch = {
      on() {
        return ch;
      },
      subscribe(cb?: (status: string) => void) {
        if (cb) setTimeout(() => cb("SUBSCRIBED"), 0);
        return ch;
      },
      unsubscribe() {
        return Promise.resolve("ok");
      },
    };
    return ch;
  };

  const client = {
    from: (table: string) => makeQueryBuilder(table),
    rpc: async (fn: string, params: Record<string, unknown> = {}) => {
      hydrateMockAuth();
      switch (fn) {
        case "get_payment_methods":
          return {
            data: [
              { id: "cash", type: "cash", label: "الدفع نقداً في المركز", detail: "" },
              { id: "1", type: "instapay", label: "حساب المؤسسة", detail: "barada@instapay" },
              { id: "2", type: "wallet", label: "فودافون كاش", detail: "01000000000" },
            ],
            error: null,
          };
        case "paymob_is_enabled":
          return { data: false, error: null };
        case "get_doctor_hour_load": {
          const counts: Record<string, number> = {};
          for (const b of tables.bookings) {
            if (
              b.doctor_name === params._doctor_name &&
              b.date === params._date &&
              b.status !== "cancelled"
            ) {
              const key = String(b.time || "");
              counts[key] = (counts[key] || 0) + 1;
            }
          }
          return {
            data: Object.entries(counts).map(([time, count]) => ({ time, count })),
            error: null,
          };
        }
        case "cancel_patient_booking": {
          const target = tables.bookings.find(
            (b) => b.id === params._booking_id && b.cancellation_token === params._token,
          );
          if (!target) return { data: false, error: null };
          const wasCancelled = target.status === "cancelled";
          target.status = "cancelled";
          target.updated_at = new Date().toISOString();
          syncBookingToMockPatientBilling(target);
          if (!wasCancelled) {
            pushMockBookingCancelledNotice(target);
          }
          return { data: true, error: null };
        }
        case "instapay_amount_due": {
          return {
            data: computeMockBookingExpectedAmount(
              String(params._service || ""),
              params._doctor_id,
              String(params._doctor_name || ""),
            ),
            error: null,
          };
        }
        case "submit_instapay_payment": {
          const ref = "BR-" + Math.random().toString(36).slice(2, 10).toUpperCase();
          const bookingId = String(params._booking_id || "");
          const bookingRow = tables.bookings.find((b) => b.id === bookingId);
          const amountDue = bookingRow
            ? computeMockBookingExpectedAmount(
                String(bookingRow.service || ""),
                bookingRow.doctor_id,
                String(bookingRow.doctor_name || ""),
              )
            : 350;
          if (bookingId) {
            tables.instapay_submissions.push({
              id: crypto.randomUUID(),
              booking_id: bookingId,
              booking_ref: ref,
              transaction_ref: String(params._transaction_ref || ""),
              declared_amount: params._declared_amount ?? null,
              amount_due: amountDue,
              verified_amount: null,
              evidence_path: String(params._evidence_path || ""),
              status: "PENDING_REVIEW",
              reason: null,
              reviewed_by_name: null,
              reviewed_at: null,
              created_at: new Date().toISOString(),
            });
          }
          return { data: [{ booking_ref: ref, amount_due: amountDue }], error: null };
        }
        case "get_instapay_status":
        case "get_paymob_status":
          return { data: [], error: null };
        case "can_review_instapay": {
          const uid = String(params._uid || getActiveMockSession()?.user?.id || "");
          if (!uid) return { data: false, error: null };
          const isAdminRole = tables.user_roles.some(
            (r) => r.user_id === uid && r.role === "admin",
          );
          if (isAdminRole) return { data: true, error: null };
          const profile = tables.profiles.find((p) => p.user_id === uid);
          const perms = Array.isArray(profile?.permissions)
            ? (profile.permissions as string[])
            : [];
          const allowed =
            profile?.is_active !== false &&
            tables.user_roles.some((r) => r.user_id === uid) &&
            (perms.includes("review_instapay") || perms.includes("manage_payments"));
          return { data: allowed, error: null };
        }
        case "review_instapay_payment": {
          const session = getActiveMockSession();
          const uid = session?.user?.id || "";
          const isAdminRole = tables.user_roles.some(
            (r) => r.user_id === uid && r.role === "admin",
          );
          const profile = tables.profiles.find((p) => p.user_id === uid);
          const perms = Array.isArray(profile?.permissions)
            ? (profile.permissions as string[])
            : [];
          const canReview =
            Boolean(uid) &&
            (isAdminRole ||
              (profile?.is_active !== false &&
                tables.user_roles.some((r) => r.user_id === uid) &&
                (perms.includes("review_instapay") || perms.includes("manage_payments"))));
          if (!canReview) {
            return { data: null, error: { message: "not authorized" } };
          }
          const sub = tables.instapay_submissions.find((s) => s.id === params._submission_id);
          if (!sub) return { data: null, error: { message: "not found" } };
          if (sub.status === "PAID" || sub.status === "REJECTED") {
            return { data: null, error: { message: "already finalized" } };
          }
          const action = String(params._action || "");
          const verifiedAmount =
            params._verified_amount !== null && params._verified_amount !== undefined
              ? Number(params._verified_amount)
              : null;
          let reason = typeof params._reason === "string" ? params._reason.trim() : "";
          const actorName = String(profile?.name || session?.user?.email || "staff");
          const prevStatus = String(sub.status || "PENDING_REVIEW");
          let nextStatus = prevStatus;
          let eventType = "PAYMENT_FLAGGED";

          if (action === "approve") {
            if (verifiedAmount === null || Number.isNaN(verifiedAmount)) {
              return { data: null, error: { message: "verified amount required" } };
            }
            if (verifiedAmount !== Number(sub.amount_due)) {
              nextStatus = "MISMATCH";
              eventType = "PAYMENT_FLAGGED";
              if (!reason) {
                reason = `المبلغ المستلم ${verifiedAmount} لا يطابق المستحق ${sub.amount_due}`;
              }
            } else {
              const bookingRow = tables.bookings.find((b) => b.id === sub.booking_id);
              const paymentId = crypto.randomUUID();
              const payRow: Row = {
                id: paymentId,
                patient_name: String(bookingRow?.patient_name || "مريض"),
                patient_phone: bookingRow?.phone ? String(bookingRow.phone) : null,
                amount: verifiedAmount,
                transaction_id: String(sub.transaction_ref || "").trim(),
                payment_type: "instapay",
                payment_type_detail: "InstaPay",
                status: "paid",
                booking_id: String(sub.booking_id || ""),
                matched_at: new Date().toISOString(),
                confirmed_by_staff_id: uid || null,
                confirmed_by_staff_name: actorName,
                notes: `اعتماد يدوي ${sub.booking_ref}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              tables.payments.push(payRow);
              if (bookingRow) {
                bookingRow.payment_status = "paid";
                bookingRow.updated_at = new Date().toISOString();
              }
              syncPaidPaymentToMockBillingAndAccounting(payRow);
              sub.payment_id = paymentId;
              nextStatus = "PAID";
              eventType = "PAYMENT_APPROVED";
            }
          } else if (action === "reject") {
            if (!reason) return { data: null, error: { message: "reason required" } };
            nextStatus = "REJECTED";
            eventType = "PAYMENT_REJECTED";
          } else if (action === "investigate") {
            nextStatus = "REVIEW_REQUIRED";
            eventType = "PAYMENT_FLAGGED";
          } else {
            return { data: null, error: { message: "invalid action" } };
          }

          sub.status = nextStatus;
          if (verifiedAmount !== null) sub.verified_amount = verifiedAmount;
          sub.reason = reason || null;
          sub.reviewed_by = uid;
          sub.reviewed_by_name = actorName;
          sub.reviewed_at = new Date().toISOString();
          sub.updated_at = new Date().toISOString();

          tables.instapay_audit_events.push({
            id: crypto.randomUUID(),
            submission_id: sub.id,
            booking_ref: sub.booking_ref,
            event_type: eventType,
            actor_id: uid,
            actor_name: actorName,
            previous_status: prevStatus,
            new_status: nextStatus,
            reason: reason || null,
            created_at: new Date().toISOString(),
          });
          return { data: nextStatus, error: null };
        }
        case "delete_instapay_submission": {
          const session = getActiveMockSession();
          const uid = session?.user?.id || "";
          const isAdminRole = tables.user_roles.some(
            (r) => r.user_id === uid && r.role === "admin",
          );
          if (!isAdminRole) return { data: null, error: { message: "not allowed" } };
          const idx = tables.instapay_submissions.findIndex(
            (s) => s.id === params._submission_id,
          );
          if (idx < 0) return { data: null, error: { message: "not found" } };
          const [removed] = tables.instapay_submissions.splice(idx, 1);
          tables.instapay_audit_events = tables.instapay_audit_events.filter(
            (e) => e.submission_id !== params._submission_id,
          );
          return { data: removed?.evidence_path || null, error: null };
        }
        case "delete_payment_record": {
          const session = getActiveMockSession();
          const uid = session?.user?.id || "";
          const isAdminRole = tables.user_roles.some(
            (r) => r.user_id === uid && r.role === "admin",
          );
          if (!isAdminRole) return { data: null, error: { message: "not allowed" } };
          const pid = String(params._payment_id || "");
          const idx = tables.payments.findIndex((p) => p.id === pid);
          if (idx < 0) return { data: false, error: null };
          const removedPayment = tables.payments[idx];
          const bookingId = removedPayment?.booking_id ? String(removedPayment.booking_id) : "";

          for (const sub of tables.instapay_submissions) {
            if (sub.payment_id === pid) sub.payment_id = null;
          }
          for (const pm of tables.paymob_payments) {
            if (pm.payment_id === pid) pm.payment_id = null;
          }

          const linkedRevIds = new Set(
            tables.accounting_revenues
              .filter((r) => r.source_table === "payments" && r.source_id === pid)
              .map((r) => String(r.id)),
          );
          tables.accounting_account_transactions = tables.accounting_account_transactions.filter(
            (t) => !(t.reference_table === "accounting_revenues" && linkedRevIds.has(String(t.reference_id))),
          );
          tables.accounting_revenues = tables.accounting_revenues.filter(
            (r) => !(r.source_table === "payments" && r.source_id === pid),
          );
          tables.patient_billing_transactions = tables.patient_billing_transactions.filter(
            (t) => t.payment_id !== pid,
          );
          tables.payment_notifications = tables.payment_notifications.filter(
            (n) => n.payment_id !== pid,
          );
          tables.payments.splice(idx, 1);

          if (isUuidLike(bookingId)) {
            if (tables.patient_billing_records.some((r) => r.booking_id === bookingId)) {
              recalculateMockBillingRecord(bookingId);
            } else if (!tables.payments.some((p) => p.booking_id === bookingId && p.status === "paid")) {
              const bk = tables.bookings.find((b) => b.id === bookingId);
              if (bk && bk.payment_status === "paid") {
                bk.payment_status = "pending";
                bk.updated_at = new Date().toISOString();
              }
            }
          }
          return { data: true, error: null };
        }
        case "has_role":
          return {
            data: tables.user_roles.some(
              (r) => r.user_id === params._user_id && r.role === params._role,
            ),
            error: null,
          };
        case "is_staff_or_admin":
          return {
            data: tables.user_roles.some((r) => r.user_id === params._user_id),
            error: null,
          };
        case "has_patient_permission":
          return {
            data: checkMockPermission(String(params._uid || ""), "patient", String(params._perm || "")),
            error: null,
          };
        case "has_staff_booking_permission":
          return {
            data: checkMockPermission(String(params._uid || ""), "staff_booking", String(params._perm || "")),
            error: null,
          };
        case "has_accounting_permission":
          return {
            data: checkMockPermission(String(params._uid || ""), "accounting", String(params._perm || "")),
            error: null,
          };
        case "has_patient_billing_permission":
          return {
            data: checkMockPermission(String(params._uid || ""), "patient_billing", String(params._perm || "")),
            error: null,
          };
        case "sync_all_patient_billing_records": {
          let count = 0;
          for (const b of tables.bookings) {
            syncBookingToMockPatientBilling(b);
            count++;
          }
          for (const p of tables.payments) {
            syncPaidPaymentToMockBillingAndAccounting(p);
          }
          for (const b of tables.bookings) {
            recalculateMockBillingRecord(String(b.id));
          }
          return { data: count, error: null };
        }
        case "apply_patient_billing_discount": {
          const session = getActiveMockSession();
          const uid = session?.user?.id || "";
          if (uid && !checkMockPermission(uid, "patient_billing", "patient_accounts_edit")) {
            return { data: null, error: { code: "42501", message: "permission denied: patient_accounts_edit required" } };
          }
          const bookingId = String(params._booking_id || "");
          const bill = tables.patient_billing_records.find((r) => r.booking_id === bookingId);
          if (!bill) return { data: null, error: { code: "P0002", message: "billing record not found" } };
          const discount = Math.max(Number(params._discount || 0), 0);
          if (discount > Number(bill.original_price || 0)) {
            return { data: null, error: { code: "22023", message: "discount cannot exceed original price" } };
          }
          bill.discount_amount = Math.round(discount * 100) / 100;
          bill.discount_reason = String(params._reason || "").trim() || null;
          const updated = recalculateMockBillingRecord(bookingId);
          const profile = tables.profiles.find((pr) => pr.user_id === uid);
          tables.clinic_audit_logs.push({
            id: crypto.randomUUID(),
            actor_user_id: uid || null,
            actor_name: String(profile?.name || session?.user?.email || "موظف معتمد"),
            module: "accounting",
            action: "PATIENT_BILLING_DISCOUNT_UPDATED",
            entity_type: "patient_billing_record",
            entity_id: String(bill.id),
            summary: `تعديل خصم حجز المريض ${bill.patient_name} إلى ${bill.discount_amount} ج.م`,
            reason: bill.discount_reason,
            created_at: new Date().toISOString(),
          });
          return { data: updated, error: null };
        }
        case "confirm_patient_booking_payment": {
          const session = getActiveMockSession();
          const uid = session?.user?.id || "";
          const idem = String(params._idempotency_key || "").trim() || crypto.randomUUID();
          const existingTxn = tables.patient_billing_transactions.find((t) => t.idempotency_key === idem);
          if (existingTxn) return { data: existingTxn, error: null };

          const bookingId = String(params._booking_id || "");
          const bookingRow = tables.bookings.find((b) => b.id === bookingId);
          if (!bookingRow) return { data: null, error: { code: "P0002", message: "booking not found" } };
          const bill = syncBookingToMockPatientBilling(bookingRow);
          if (bill.booking_status === "cancelled") {
            return { data: null, error: { code: "22023", message: "cannot confirm payment for a cancelled booking" } };
          }

          const amount = Math.round(Number(params._amount || 0) * 100) / 100;
          if (!Number.isFinite(amount) || amount <= 0) {
            return { data: null, error: { code: "22023", message: "amount must be greater than zero" } };
          }
          const remaining = Number(bill.remaining_balance || 0);
          if (remaining > 0 && amount > remaining + 0.01) {
            return { data: null, error: { code: "22023", message: "payment amount exceeds remaining balance" } };
          }

          const isPartial =
            (Number(bill.final_amount_due || 0) > 0 && amount < remaining - 0.01) ||
            Number(bill.paid_amount || 0) > 0;

          if (uid) {
            const allowed = isPartial
              ? checkMockPermission(uid, "patient_billing", "payment_confirm_partial") ||
                checkMockPermission(uid, "patient_billing", "payment_confirm")
              : checkMockPermission(uid, "patient_billing", "payment_confirm");
            if (!allowed) {
              return {
                data: null,
                error: {
                  code: "42501",
                  message: `permission denied: ${isPartial ? "payment_confirm_partial" : "payment_confirm"} required`,
                },
              };
            }
          }

          const profile = tables.profiles.find((pr) => pr.user_id === uid);
          const actorName = String(profile?.name || session?.user?.email || "موظف معتمد");
          const method = String(params._payment_method || "cash");
          const accountId = params._account_id ? String(params._account_id) : null;
          const confirmedVia = String(params._confirmed_via || "payments_section");
          const notes = params._notes ? String(params._notes).trim() : null;
          const today = new Date().toISOString().slice(0, 10);
          const paymentId = crypto.randomUUID();
          const revId = crypto.randomUUID();
          const txRef =
            String(params._transaction_ref || "").trim() ||
            `PAY-${today.replace(/-/g, "")}-${paymentId.slice(0, 6).toUpperCase()}`;

          const enumType =
            method === "instapay"
              ? "instapay"
              : method === "wallet"
                ? "wallet"
                : method === "fawry"
                  ? "fawry"
                  : "other";
          const detailMap: Record<string, string> = {
            cash: "نقداً (خزينة)",
            bank_transfer: "تحويل بنكي",
            card: "بطاقة بنكية (POS)",
            paymob: "Paymob / بطاقة إلكترونية",
            instapay: "InstaPay",
            wallet: "محفظة إلكترونية",
          };

          tables.payments.push({
            id: paymentId,
            patient_name: bookingRow.patient_name,
            patient_phone: bookingRow.phone || null,
            amount,
            transaction_id: txRef,
            payment_type: enumType,
            payment_type_detail: detailMap[method] || "أخرى",
            status: "paid",
            booking_id: bookingId,
            matched_at: new Date().toISOString(),
            notes,
            account_id: accountId,
            confirmed_by_staff_id: uid || null,
            confirmed_by_staff_name: actorName,
            is_partial: isPartial,
            refunded_amount: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          const docNum = `REV-${today.replace(/-/g, "")}-${revId.slice(0, 6).toUpperCase()}`;
          const revMethod = ["cash", "instapay", "wallet", "paymob", "bank_transfer", "card"].includes(method) ? method : "cash";
          tables.accounting_revenues.push({
            id: revId,
            doc_number: docNum,
            revenue_date: today,
            category_id: "acct-cat-rev-1",
            category_name: "الكشوفات",
            revenue_source: bookingRow.contracting_company_id ? "contracting" : "booking",
            description: `تحصيل حجز ${bookingRow.patient_name} - ${bookingRow.doctor_name} (${bookingRow.service})`,
            amount,
            payment_method: revMethod,
            account_id: accountId,
            patient_id: bill.patient_id || null,
            patient_name: bookingRow.patient_name,
            booking_id: bookingId,
            doctor_name: bookingRow.doctor_name,
            service_name: bookingRow.service,
            booking_source: bookingRow.booking_source || "website",
            contracting_company_id: bookingRow.contracting_company_id || null,
            responsible_staff_id: uid || null,
            responsible_staff_name: actorName,
            notes,
            attachments: [],
            status: "posted",
            source_table: "payments",
            source_id: paymentId,
            created_by: uid || null,
            created_by_name: actorName,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          if (accountId) {
            tables.accounting_account_transactions.push({
              id: crypto.randomUUID(),
              account_id: accountId,
              transaction_date: today,
              direction: "in",
              entry_type: "revenue",
              amount,
              reference_table: "accounting_revenues",
              reference_id: revId,
              description: `${docNum} - تحصيل حجز ${bookingRow.patient_name}`,
              created_by: uid || null,
              created_by_name: actorName,
              created_at: new Date().toISOString(),
            });
          }

          if (params._issue_voucher) {
            tables.accounting_vouchers.push({
              id: crypto.randomUUID(),
              voucher_kind: "receipt",
              voucher_number: `RCV-${today.replace(/-/g, "")}-${Math.floor(10000 + Math.random() * 90000)}`,
              voucher_date: today,
              party_name: bookingRow.patient_name,
              amount,
              reason: `سداد حجز ${bookingRow.service} - ${bookingRow.doctor_name}`,
              payment_method: method,
              account_id: accountId,
              affects_account: false,
              booking_id: bookingId,
              patient_id: bill.patient_id || null,
              revenue_id: revId,
              responsible_staff_id: uid || null,
              responsible_staff_name: actorName,
              notes: `مرتبط بالمعاملة ${txRef}`,
              status: "posted",
              created_by: uid || null,
              created_by_name: actorName,
              created_at: new Date().toISOString(),
            });
          }

          const txnRow: Row = {
            id: crypto.randomUUID(),
            billing_record_id: bill.id,
            booking_id: bookingId,
            patient_id: bill.patient_id || null,
            payment_id: paymentId,
            revenue_id: revId,
            transaction_kind: "payment",
            amount,
            payment_method: method,
            account_id: accountId,
            transaction_ref: txRef,
            idempotency_key: idem,
            confirmed_via: confirmedVia,
            confirmed_by_staff_id: uid || null,
            confirmed_by_staff_name: actorName,
            notes,
            status: "confirmed",
            created_at: new Date().toISOString(),
          };
          tables.patient_billing_transactions.push(txnRow);
          recalculateMockBillingRecord(bookingId);

          tables.payment_notifications.push({
            id: crypto.randomUUID(),
            payment_id: paymentId,
            patient_name: String(bookingRow.patient_name || ""),
            amount,
            message: `تم استلام دفعة بنجاح من ${String(bookingRow.patient_name || "")} بقيمة ${amount} ج.م - رقم العملية: ${txRef}`,
            is_read: false,
            created_at: new Date().toISOString(),
          });

          tables.clinic_audit_logs.push({
            id: crypto.randomUUID(),
            actor_user_id: uid || null,
            actor_name: actorName,
            module: "accounting",
            action: "PATIENT_PAYMENT_CONFIRMED",
            entity_type: "patient_billing_transaction",
            entity_id: String(txnRow.id),
            summary: `تأكيد استلام دفعة بقيمة ${amount} ج.م للمريض ${bookingRow.patient_name} (${txRef})`,
            created_at: new Date().toISOString(),
          });

          return { data: txnRow, error: null };
        }
        case "refund_or_reverse_patient_payment": {
          const session = getActiveMockSession();
          const uid = session?.user?.id || "";
          const idem = String(params._idempotency_key || "").trim() || crypto.randomUUID();
          const existingTxn = tables.patient_billing_transactions.find((t) => t.idempotency_key === idem);
          if (existingTxn) return { data: existingTxn, error: null };

          const mode = String(params._mode || "refund");
          const reason = String(params._reason || "").trim();
          if (!reason) return { data: null, error: { code: "22023", message: "reason is required" } };
          if (mode !== "refund" && mode !== "reversal") {
            return { data: null, error: { code: "22023", message: "invalid mode" } };
          }
          if (uid) {
            const needed = mode === "refund" ? "payment_refund" : "payment_reverse";
            if (!checkMockPermission(uid, "patient_billing", needed)) {
              return { data: null, error: { code: "42501", message: `permission denied: ${needed} required` } };
            }
          }

          const bookingId = String(params._booking_id || "");
          const bill = tables.patient_billing_records.find((r) => r.booking_id === bookingId);
          if (!bill) return { data: null, error: { code: "P0002", message: "billing record not found" } };

          const profile = tables.profiles.find((pr) => pr.user_id === uid);
          const actorName = String(profile?.name || session?.user?.email || "موظف معتمد");
          const today = new Date().toISOString().slice(0, 10);

          if (mode === "reversal") {
            const targetId = params._target_transaction_id ? String(params._target_transaction_id) : "";
            const target = targetId
              ? tables.patient_billing_transactions.find(
                  (t) => t.id === targetId && t.booking_id === bookingId && t.transaction_kind === "payment" && t.status === "confirmed",
                )
              : [...tables.patient_billing_transactions]
                  .reverse()
                  .find((t) => t.booking_id === bookingId && t.transaction_kind === "payment" && t.status === "confirmed");
            if (!target) {
              return { data: null, error: { code: "P0002", message: "confirmed payment transaction not found for reversal" } };
            }

            target.status = "reversed";
            target.reversed_by_staff_id = uid || null;
            target.reversed_by_staff_name = actorName;
            target.reversed_at = new Date().toISOString();
            target.reversal_reason = reason;

            if (target.payment_id) {
              const p = tables.payments.find((x) => x.id === target.payment_id);
              if (p) {
                p.status = "failed";
                p.notes = `${p.notes ? `${p.notes} | ` : ""}عكس معاملة: ${reason}`;
                p.updated_at = new Date().toISOString();
              }
            }

            if (target.revenue_id) {
              const rev = tables.accounting_revenues.find((r) => r.id === target.revenue_id && r.status === "posted");
              if (rev) {
                rev.status = "reversed";
                rev.reversal_reason = reason;
                rev.reversed_by = uid || null;
                rev.reversed_by_name = actorName;
                rev.reversed_at = new Date().toISOString();
              }
            }

            const accId = (params._account_id ? String(params._account_id) : null) || (target.account_id ? String(target.account_id) : null);
            if (accId) {
              tables.accounting_account_transactions.push({
                id: crypto.randomUUID(),
                account_id: accId,
                transaction_date: today,
                direction: "out",
                entry_type: "revenue_reversal",
                amount: Number(target.amount || 0),
                reference_table: "patient_billing_transactions",
                reference_id: target.id,
                description: `عكس دفعة مريض ${bill.patient_name}: ${reason}`,
                created_by: uid || null,
                created_by_name: actorName,
                created_at: new Date().toISOString(),
              });
            }

            const revTxn: Row = {
              id: crypto.randomUUID(),
              billing_record_id: bill.id,
              booking_id: bookingId,
              patient_id: bill.patient_id || null,
              payment_id: target.payment_id || null,
              revenue_id: target.revenue_id || null,
              transaction_kind: "reversal",
              amount: Number(target.amount || 0),
              payment_method: target.payment_method,
              account_id: accId,
              transaction_ref: `REV-${today.replace(/-/g, "")}-${Math.floor(10000 + Math.random() * 90000)}`,
              idempotency_key: idem,
              confirmed_via: "accounting_section",
              confirmed_by_staff_id: uid || null,
              confirmed_by_staff_name: actorName,
              notes: reason,
              status: "confirmed",
              created_at: new Date().toISOString(),
            };
            tables.patient_billing_transactions.push(revTxn);
            recalculateMockBillingRecord(bookingId);
            return { data: revTxn, error: null };
          }

          // mode === "refund"
          const available = Math.max(Number(bill.paid_amount || 0) - Number(bill.refunded_amount || 0), 0);
          const amt = Math.round(Number(params._amount || 0) * 100) / 100;
          if (!Number.isFinite(amt) || amt <= 0 || amt > available + 0.01) {
            return { data: null, error: { code: "22023", message: "refund amount exceeds refundable balance" } };
          }
          const method = String(params._payment_method || "cash");
          const accId =
            (params._account_id ? String(params._account_id) : null) ||
            String(
              tables.patient_billing_transactions.find(
                (t) => t.booking_id === bookingId && t.transaction_kind === "payment" && t.status === "confirmed" && t.account_id,
              )?.account_id || "",
            ) ||
            null;

          if (accId) {
            tables.accounting_account_transactions.push({
              id: crypto.randomUUID(),
              account_id: accId,
              transaction_date: today,
              direction: "out",
              entry_type: "revenue_reversal",
              amount: amt,
              reference_table: "patient_billing_records",
              reference_id: bill.id,
              description: `استرداد مبلغ للمريض ${bill.patient_name}: ${reason}`,
              created_by: uid || null,
              created_by_name: actorName,
              created_at: new Date().toISOString(),
            });
          }

          if (amt >= available - 0.01) {
            for (const rev of tables.accounting_revenues) {
              if (rev.booking_id === bookingId && rev.status === "posted") {
                rev.status = "reversed";
                rev.reversal_reason = `استرداد كامل: ${reason}`;
                rev.reversed_by = uid || null;
                rev.reversed_by_name = actorName;
                rev.reversed_at = new Date().toISOString();
              }
            }
          }

          tables.accounting_vouchers.push({
            id: crypto.randomUUID(),
            voucher_kind: "disbursement",
            voucher_number: `PAY-${today.replace(/-/g, "")}-${Math.floor(10000 + Math.random() * 90000)}`,
            voucher_date: today,
            party_name: bill.patient_name,
            amount: amt,
            reason: `استرداد مبلغ حجز ${bill.service_name}: ${reason}`,
            payment_method: method,
            account_id: accId,
            affects_account: false,
            booking_id: bookingId,
            patient_id: bill.patient_id || null,
            responsible_staff_id: uid || null,
            responsible_staff_name: actorName,
            notes: reason,
            status: "posted",
            created_by: uid || null,
            created_by_name: actorName,
            created_at: new Date().toISOString(),
          });

          const refundTxn: Row = {
            id: crypto.randomUUID(),
            billing_record_id: bill.id,
            booking_id: bookingId,
            patient_id: bill.patient_id || null,
            payment_id: null,
            revenue_id: null,
            transaction_kind: "refund",
            amount: amt,
            payment_method: method,
            account_id: accId,
            transaction_ref: `RFD-${today.replace(/-/g, "")}-${Math.floor(10000 + Math.random() * 90000)}`,
            idempotency_key: idem,
            confirmed_via: "accounting_section",
            confirmed_by_staff_id: uid || null,
            confirmed_by_staff_name: actorName,
            notes: reason,
            status: "confirmed",
            created_at: new Date().toISOString(),
          };
          tables.patient_billing_transactions.push(refundTxn);
          recalculateMockBillingRecord(bookingId);
          return { data: refundTxn, error: null };
        }
        case "get_user_by_login_username": {
          const rawUsername = String(params.p_login_username || "").trim().toLowerCase();
          if (!rawUsername) return { data: [], error: null };
          const profile = tables.profiles.find(
            (p) =>
              p.is_active !== false &&
              (String(p.login_username || "").trim().toLowerCase() === rawUsername ||
                String(p.username || "").trim().toLowerCase() === rawUsername),
          );
          if (profile) {
            const authUser = mockAuthUsers.find((u) => u.id === profile.user_id);
            if (authUser) {
              return { data: [{ user_id: authUser.id, email: authUser.email }], error: null };
            }
          }
          if (mockAuthUsers.length === 0) {
            return {
              data: [{ user_id: crypto.randomUUID(), email: `${rawUsername}@barada.local` }],
              error: null,
            };
          }
          return { data: [], error: null };
        }
        case "backup_export":
          return {
            data: { format: "barrada-backup-v1", exported_at: new Date().toISOString(), tables },
            error: null,
          };
        case "backup_restore":
          return { data: { restored: {} }, error: null };
        default:
          return { data: null, error: null };
      }
    },
    auth: {
      getSession: async () => ({ data: { session: getActiveMockSession() }, error: null }),
      getUser: async () => {
        const session = getActiveMockSession();
        return { data: { user: session?.user ?? null }, error: null };
      },
      getClaims: async (token?: string) => {
        const active = getActiveMockSession();
        const jwt = token || active?.access_token;
        if (!jwt) return { data: null, error: { message: "No active session" } };
        try {
          const payloadPart = jwt.split(".")[1];
          const b64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
          const claims = JSON.parse(atob(b64)) as Record<string, unknown>;
          return { data: { claims }, error: null };
        } catch {
          return { data: null, error: { message: "Invalid token" } };
        }
      },
      onAuthStateChange: (
        callback: (event: string, session: ReturnType<typeof buildMockSession> | null) => void,
      ) => {
        authListeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                authListeners.delete(callback);
              },
            },
          },
        };
      },
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        hydrateMockAuth();
        const normalizedEmail = String(email || "").trim().toLowerCase();
        if (!normalizedEmail || !password) {
          return {
            data: { user: null, session: null },
            error: { message: "Invalid login credentials" },
          };
        }

        let user = mockAuthUsers.find((u) => u.email.toLowerCase() === normalizedEmail);
        if (user) {
          if (user.password !== password) {
            return {
              data: { user: null, session: null },
              error: { message: "Invalid login credentials" },
            };
          }
          const profile = tables.profiles.find((p) => p.user_id === user!.id);
          if (profile && profile.is_active === false) {
            return {
              data: { user: null, session: null },
              error: { message: "Account is disabled" },
            };
          }
        } else {
          const handle = normalizedEmail.split("@")[0] || "admin";
          user = {
            id: crypto.randomUUID(),
            email: normalizedEmail,
            password,
            name: handle,
            username: handle,
            login_username: handle,
            role: "admin",
          };
          mockAuthUsers.push(user);
          syncUserToTables(user);
        }

        mockSessionUserId = user.id;
        persistMockAuth();
        const session = buildMockSession(user);
        notifyAuthListeners("SIGNED_IN", session);
        return { data: { user: session.user, session }, error: null };
      },
      signUp: async ({ email, password }: { email: string; password: string }) => {
        hydrateMockAuth();
        const normalizedEmail = String(email || "").trim().toLowerCase();
        if (mockAuthUsers.some((u) => u.email.toLowerCase() === normalizedEmail)) {
          return {
            data: { user: null, session: null },
            error: { message: "User already registered" },
          };
        }
        const handle = normalizedEmail.split("@")[0] || "staff";
        const newUser: MockAuthUser = {
          id: crypto.randomUUID(),
          email: normalizedEmail,
          password,
          name: handle,
          username: handle,
          login_username: handle,
          role: "staff",
        };
        mockAuthUsers.push(newUser);
        syncUserToTables(newUser);
        mockSessionUserId = newUser.id;
        persistMockAuth();
        const session = buildMockSession(newUser);
        notifyAuthListeners("SIGNED_IN", session);
        return { data: { user: session.user, session }, error: null };
      },
      signOut: async () => {
        mockSessionUserId = null;
        persistMockAuth();
        notifyAuthListeners("SIGNED_OUT", null);
        return { error: null };
      },
      admin: {
        createUser: async ({
          id,
          email,
          password,
          user_metadata,
        }: {
          id?: string;
          email: string;
          password: string;
          user_metadata?: { name?: string; username?: string; login_username?: string; role?: "admin" | "staff" };
        }) => {
          hydrateMockAuth();
          const normalizedEmail = String(email || "").trim().toLowerCase();
          if (mockAuthUsers.some((u) => u.email.toLowerCase() === normalizedEmail)) {
            return {
              data: { user: null },
              error: { message: "A user with this email address has already been registered" },
            };
          }
          const handle = normalizedEmail.split("@")[0] || "staff";
          const created: MockAuthUser = {
            id: id || crypto.randomUUID(),
            email: normalizedEmail,
            password,
            name: user_metadata?.name || handle,
            username: user_metadata?.username || handle,
            login_username: user_metadata?.login_username || handle,
            role: user_metadata?.role === "admin" ? "admin" : "staff",
          };
          mockAuthUsers.push(created);
          syncUserToTables(created);
          persistMockAuth();
          return { data: { user: toSupabaseUser(created) }, error: null };
        },
        listUsers: async () => {
          hydrateMockAuth();
          return { data: { users: mockAuthUsers.map(toSupabaseUser) }, error: null };
        },
        updateUserById: async (userId: string, attrs: { password?: string }) => {
          hydrateMockAuth();
          const target = mockAuthUsers.find((u) => u.id === userId);
          if (!target) {
            return { data: { user: null }, error: { message: "User not found" } };
          }
          if (typeof attrs.password === "string") {
            target.password = attrs.password;
            persistMockAuth();
          }
          return { data: { user: toSupabaseUser(target) }, error: null };
        },
      },
    },
    channel: () => channelMock(),
    removeChannel: async () => "ok",
    removeAllChannels: async () => [],
    storage: {
      from: () => ({
        upload: async (path: string) => ({ data: { path }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: path } }),
        createSignedUrl: async (path: string) => ({ data: { signedUrl: path }, error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
  };

  return client as unknown as SupabaseClient<Database>;
}
