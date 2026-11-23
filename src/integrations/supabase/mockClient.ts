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
    },
    {
      id: 2,
      name: "أكسا للتأمين (AXA)",
      documents: ["كارنيه أكسا", "بطاقة الرقم القومي"],
      manager_name: "د. سارة محمود",
      manager_phone: "01234567890",
    },
    {
      id: 3,
      name: "ميدنت (MedNet)",
      documents: ["بطاقة ميدنت الممغنطة", "استمارة الكشف الطبي"],
      manager_name: "أ. محمد علي",
      manager_phone: "01122334455",
    },
    {
      id: 4,
      name: "نقابة المهندسين",
      documents: ["كارنيه النقابة الساري", "خطاب تحويل من النقابة"],
      manager_name: "م. خالد ابراهيم",
      manager_phone: "01555555555",
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
});

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
  let orderBy: { col: string; ascending: boolean } | null = null;
  let limitVal: number | null = null;
  let singleMode: "single" | "maybeSingle" | null = null;
  let headOnly = false;
  let wantCount = false;

  const execute = async (): Promise<QueryResult> => {
    const rows = getTable(tableName);

    if (op === "select") {
      let result = rows.filter((r) => filters.every((fn) => fn(r)));
      const total = result.length;
      if (orderBy) {
        const { col, ascending } = orderBy;
        result = [...result].sort((a, b) => compareValues(a[col], b[col]) * (ascending ? 1 : -1));
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
      const items = list.map((item) => ({
        id: item.id ?? crypto.randomUUID(),
        created_at: item.created_at ?? new Date().toISOString(),
        ...item,
      }));
      rows.push(...items);
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
      if (singleMode) return { data: items[0] ?? null, error: null };
      return { data: items, error: null };
    }

    if (op === "update") {
      const updated: Row[] = [];
      for (let i = 0; i < rows.length; i++) {
        if (filters.every((fn) => fn(rows[i]))) {
          rows[i] = { ...rows[i], ...(payload as Row) };
          updated.push(rows[i]);
        }
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
    order(col: string, opts?: { ascending?: boolean }) {
      orderBy = { col, ascending: opts?.ascending !== false };
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

export function createMockSupabaseClient(): SupabaseClient<Database> {
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
          target.status = "cancelled";
          return { data: true, error: null };
        }
        case "instapay_amount_due": {
          const doc = tables.doctors.find(
            (d) => d.id === params._doctor_id || d.name === params._doctor_name,
          );
          return { data: doc?.fee ?? 350, error: null };
        }
        case "submit_instapay_payment": {
          const ref = "BR-" + Math.random().toString(36).slice(2, 10).toUpperCase();
          return { data: [{ booking_ref: ref, amount_due: 350 }], error: null };
        }
        case "get_instapay_status":
        case "get_paymob_status":
          return { data: [], error: null };
        case "has_role":
        case "get_user_by_login_username":
          return { data: false, error: null };
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
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      getClaims: async () => ({ data: null, error: { message: "Supabase not configured" } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: {
          message:
            "Supabase is not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to .env to enable staff authentication.",
        },
      }),
      signUp: async () => ({
        data: { user: null, session: null },
        error: { message: "Supabase not configured" },
      }),
      signOut: async () => ({ error: null }),
      admin: {
        createUser: async () => ({
          data: { user: null },
          error: { message: "Supabase not configured" },
        }),
        listUsers: async () => ({ data: { users: [] }, error: null }),
        updateUserById: async () => ({
          data: { user: null },
          error: { message: "Supabase not configured" },
        }),
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
