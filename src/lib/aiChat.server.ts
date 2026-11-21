// Smart-assistant backend: answers visitors using the clinic's own public data
// (doctors, services, contact details, hours) so replies match what the site shows.
//
// Provider: Google Gemini when GEMINI_API_KEY is set (production on Cloudflare);
// otherwise the Lovable AI Gateway (Lovable preview, uses LOVABLE_API_KEY).
// GEMINI_MODEL optionally overrides the default model; GEMINI_BASE_URL optionally routes
// through a Cloudflare AI Gateway (CF_AIG_TOKEN = the gateway's authentication token).
import { serviceClient } from "@/lib/paymob/paymob.server";

export type ChatTurn = { role: "user" | "model"; text: string };

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const CONTEXT_TTL_MS = 5 * 60 * 1000;
const MAX_HISTORY = 6;
const MAX_TURN_LENGTH = 1000;
const GEMINI_TIMEOUT_MS = 25_000;
const CONTEXT_TIMEOUT_MS = 8_000;

let cachedContext: { text: string; at: number } | null = null;

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);

/** Public clinic facts as plain text for the model. Cached briefly per server instance. */
export async function loadClinicContext(): Promise<string> {
  if (cachedContext && Date.now() - cachedContext.at < CONTEXT_TTL_MS) return cachedContext.text;

  const db = await serviceClient();
  const [doctorsRes, servicesRes, settingsRes] = await Promise.all([
    db.from("doctors").select("name, specialty, fee, experience, education, top_specialties, available_dates").order("name"),
    db.from("services").select("title, description, price").order("title"),
    db.from("app_settings_public")
      .select("app_name, phones, addresses, whatsapp_number, working_hours, map_location_url")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  const s: any = settingsRes.data ?? {};
  lines.push(`اسم المركز: ${clean(s.app_name) || "مركز براده للعيون"}`);
  if (list(s.addresses).length) lines.push(`العنوان: ${list(s.addresses).join(" / ")}`);
  if (list(s.phones).length) lines.push(`أرقام التليفون: ${list(s.phones).join(" ، ")}`);
  if (clean(s.whatsapp_number)) lines.push(`واتساب: ${clean(s.whatsapp_number)}`);
  if (clean(s.map_location_url)) lines.push(`الموقع على الخريطة: ${clean(s.map_location_url)}`);
  const hours = s.working_hours ?? {};
  if (clean(hours.weekdays) || clean(hours.friday)) {
    lines.push(`مواعيد العمل: باقي الأيام ${clean(hours.weekdays) || "غير محدد"}، الجمعة ${clean(hours.friday) || "غير محدد"}`);
  }

  const doctors = (doctorsRes.data ?? []) as any[];
  if (doctors.length) {
    lines.push("", "الأطباء:");
    for (const d of doctors) {
      const parts = [`- ${clean(d.name)}`, clean(d.specialty) && `التخصص: ${clean(d.specialty)}`];
      if (d.fee) parts.push(`سعر الكشف: ${d.fee} جنيه`);
      if (d.experience) parts.push(`الخبرة: ${d.experience} سنة`);
      if (list(d.top_specialties).length) parts.push(`أبرز الخبرات: ${list(d.top_specialties).join("، ")}`);
      if (clean(d.education)) parts.push(`المؤهل: ${clean(d.education)}`);
      const upcoming = list(d.available_dates).filter((x) => x >= today).sort().slice(0, 6);
      if (upcoming.length) parts.push(`أقرب أيام متاحة: ${upcoming.join("، ")}`);
      lines.push(parts.filter(Boolean).join(" | "));
    }
  }

  const services = (servicesRes.data ?? []) as any[];
  if (services.length) {
    lines.push("", "الخدمات:");
    for (const sv of services) {
      const parts = [`- ${clean(sv.title)}`];
      if (clean(sv.description)) parts.push(clean(sv.description));
      if (sv.price) parts.push(`السعر: ${sv.price} جنيه`);
      lines.push(parts.join(" | "));
    }
  }

  const text = lines.join("\n");
  cachedContext = { text, at: Date.now() };
  return text;
}

export function buildSystemPrompt(language: string, clinicContext: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const rules =
    language === "ar"
      ? `أنت المساعد الذكي لمركز براده للعيون بالأقصر. تاريخ اليوم ${today}.
- جاوب باختصار ولطف وبنفس لغة السائل (عربي مصري بسيط لو كتب بالعربي).
- اعتمد فقط على بيانات المركز المكتوبة تحت عند الكلام عن الأطباء أو الأسعار أو المواعيد أو أرقام التواصل. لو المعلومة مش موجودة قول إنك مش متأكد ووجّه للاتصال بالمركز.
- للحجز: وجّه المريض لزر "احجز موعد" في الموقع أو أرقام المركز.
- معلومات عامة عن صحة العيون مسموحة، لكن ماتشخّصش ولا توصف أدوية أو جرعات، وانصح بالكشف عند الطبيب. لو فيه أعراض طارئة (فقدان مفاجئ للنظر، ألم شديد، إصابة أو مادة كيميائية في العين) انصح بالتوجه للطوارئ فوراً.
- ماتجاوبش على أسئلة ملهاش علاقة بالمركز أو صحة العيون.`
      : `You are the smart assistant of Barada Eye Center in Luxor. Today is ${today}.
- Answer briefly and kindly, in the user's language.
- For doctors, prices, schedules and contact details use ONLY the clinic data below; if something is missing, say you are not sure and suggest contacting the center.
- For booking, point to the site's "Book appointment" button or the center's phone numbers.
- General eye-health information is fine, but never diagnose or prescribe medicines or doses; recommend seeing a doctor. For emergencies (sudden vision loss, severe pain, eye injury or chemical exposure) advise going to an emergency department immediately.
- Decline questions unrelated to the center or eye health.`;
  return `${rules}\n\n=== بيانات المركز / Clinic data ===\n${clinicContext || "(غير متاحة حالياً)"}`;
}

/** Keeps only well-formed recent turns from the browser. */
export function sanitizeHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t: any) => t && (t.role === "user" || t.role === "model") && typeof t.text === "string" && t.text.trim())
    .slice(-MAX_HISTORY)
    .map((t: any) => ({ role: t.role, text: t.text.trim().slice(0, MAX_TURN_LENGTH) }));
}

async function callGemini(apiKey: string, system: string, turns: ChatTurn[]): Promise<string> {
  const model = clean(process.env["GEMINI_MODEL"]) || DEFAULT_GEMINI_MODEL;
  // Optional Cloudflare AI Gateway in front of Google (…/google-ai-studio); direct calls from
  // Workers to Google can stall.
  const baseUrl = (clean(process.env["GEMINI_BASE_URL"]) || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const gatewayToken = clean(process.env["CF_AIG_TOKEN"]);
  const request = (withThinkingLevel: boolean) =>
    fetch(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        ...(gatewayToken ? { "cf-aig-authorization": `Bearer ${gatewayToken}` } : {}),
      },
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.4,
          // Short answers need little reasoning; keeps replies fast.
          ...(withThinkingLevel ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
      }),
    });

  const started = Date.now();
  let res = await request(true);
  let body = await res.text();
  if (res.status === 400 && /thinking/i.test(body)) {
    console.warn("Gemini rejected thinkingLevel, retrying without it");
    res = await request(false);
    body = await res.text();
  }
  console.log(`Gemini ${model} answered ${res.status} in ${Date.now() - started} ms`);
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  const json = JSON.parse(body);
  const parts = json?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.filter((p: any) => !p?.thought).map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("").trim().replace(/\*\*(.+?)\*\*/g, "$1").replace(/^[ \t]*[*-][ \t]+/gm, "• ")
    : "";
  if (!text) console.warn("Gemini returned no text:", body.slice(0, 300));
  return text;
}

async function callLovableGateway(system: string, turns: ChatTurn[]): Promise<string> {
  const { generateChatCompletion } = await import("@lovable.dev/ai-gateway");
  const completion = await generateChatCompletion({
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: system },
      ...turns.map((t) => ({ role: t.role === "model" ? ("assistant" as const) : ("user" as const), content: t.text })),
    ],
    max_tokens: 1000,
  });
  const content = (completion as any)?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

/** Generates the assistant's reply for the latest user message plus recent history. */
export async function generateClinicReply(message: string, language: string, history: ChatTurn[]): Promise<string> {
  let clinicContext = "";
  try {
    clinicContext = await Promise.race([
      loadClinicContext(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("clinic context timed out")), CONTEXT_TIMEOUT_MS)),
    ]);
  } catch (e) {
    console.error("ai-chat context error:", e instanceof Error ? e.message : e);
  }
  const system = buildSystemPrompt(language, clinicContext);

  // Gemini requires the conversation to start with a user turn.
  const turns: ChatTurn[] = [...history, { role: "user", text: message }];
  while (turns.length && turns[0].role !== "user") turns.shift();

  const geminiKey = clean(process.env["GEMINI_API_KEY"]);
  console.log(`ai-chat: provider=${geminiKey ? "gemini" : "lovable-gateway"} context=${clinicContext.length} chars`);
  return geminiKey ? callGemini(geminiKey, system, turns) : callLovableGateway(system, turns);
}
