// Smart-assistant backend: answers visitors using the clinic's own public data
// (doctors, services, contact details, hours) so replies match what the site shows.
//
// Provider: Google Gemini when GEMINI_API_KEY is set (production on Cloudflare);
// otherwise the Lovable AI Gateway (Lovable preview, uses LOVABLE_API_KEY).
// GEMINI_MODEL optionally overrides the default model; GEMINI_BASE_URL optionally routes
// through a Cloudflare AI Gateway (CF_AIG_TOKEN = the gateway's authentication token).
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { serviceClient } from "@/lib/paymob/paymob.server";

export type ChatTurn = { role: "user" | "model"; text: string };

export const DEFAULT_GEMINI_MODEL = "gemini-4-hydrogen";
const DEPRECATED_OR_INVALID_MODELS = new Set([
  "gemini-3.5-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-2.0-flash",
  "gemini-2.0-pro",
  "gemini-2.0-flash-thinking",
]);
const CONTEXT_TTL_MS = 5 * 60 * 1000;
const MAX_HISTORY = 6;
const MAX_TURN_LENGTH = 1000;
const GEMINI_TIMEOUT_MS = 25_000;
const CONTEXT_TIMEOUT_MS = 8_000;
const MAX_TRANSIENT_RETRIES = 2;

let cachedContext: { text: string; at: number } | null = null;

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);

export class GeminiApiError extends Error {
  status: number;
  reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.reason = reason;
  }
}

export function resolveGeminiModel(rawModel?: string): string {
  const candidate = clean(rawModel);
  if (!candidate || DEPRECATED_OR_INVALID_MODELS.has(candidate)) {
    return DEFAULT_GEMINI_MODEL;
  }
  return candidate;
}

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
  const s = (settingsRes.data ?? {}) as Record<string, unknown>;
  lines.push(`اسم المركز: ${clean(s.app_name) || "مركز براده للعيون"}`);
  if (list(s.addresses).length) lines.push(`العنوان: ${list(s.addresses).join(" / ")}`);
  if (list(s.phones).length) lines.push(`أرقام التليفون: ${list(s.phones).join(" ، ")}`);
  if (clean(s.whatsapp_number)) lines.push(`واتساب: ${clean(s.whatsapp_number)}`);
  if (clean(s.map_location_url)) lines.push(`الموقع على الخريطة: ${clean(s.map_location_url)}`);
  const hours = (s.working_hours ?? {}) as Record<string, unknown>;
  if (clean(hours.weekdays) || clean(hours.friday)) {
    lines.push(`مواعيد العمل: باقي الأيام ${clean(hours.weekdays) || "غير محدد"}، الجمعة ${clean(hours.friday) || "غير محدد"}`);
  }

  const doctors = (doctorsRes.data ?? []) as Array<Record<string, unknown>>;
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

  const services = (servicesRes.data ?? []) as Array<Record<string, unknown>>;
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
    .filter((t): t is { role: "user" | "model"; text: string } => {
      if (!t || typeof t !== "object") return false;
      const rec = t as Record<string, unknown>;
      return (rec.role === "user" || rec.role === "model") && typeof rec.text === "string" && rec.text.trim().length > 0;
    })
    .slice(-MAX_HISTORY)
    .map((t) => ({ role: t.role, text: t.text.trim().slice(0, MAX_TURN_LENGTH) }));
}

function normalizeGeminiError(err: unknown): GeminiApiError {
  if (err instanceof GeminiApiError) return err;
  const rawMessage = err instanceof Error ? err.message : String(err ?? "Unknown Gemini error");
  const errObj = err && typeof err === "object" ? (err as Record<string, unknown>) : null;
  const statusFromErr = typeof errObj?.status === "number" ? errObj.status : undefined;

  let parsed: Record<string, unknown> | null = null;
  try {
    const jsonStart = rawMessage.indexOf("{");
    if (jsonStart !== -1) {
      const candidate = JSON.parse(rawMessage.slice(jsonStart)) as unknown;
      if (candidate && typeof candidate === "object") parsed = candidate as Record<string, unknown>;
    }
  } catch {
    parsed = null;
  }

  const apiErr = (parsed?.error && typeof parsed.error === "object" ? parsed.error : parsed) as Record<string, unknown> | null;
  const code = typeof apiErr?.code === "number" ? apiErr.code : statusFromErr ?? 500;
  const apiStatus = clean(apiErr?.status);
  const details = Array.isArray(apiErr?.details) ? apiErr.details : [];
  const reasonDetail = details.find(
    (d): d is Record<string, unknown> => Boolean(d && typeof d === "object" && typeof (d as Record<string, unknown>).reason === "string"),
  );
  const reason = clean(reasonDetail?.reason) || apiStatus || undefined;
  const msg = clean(apiErr?.message) || rawMessage.replace(/\s+/g, " ").slice(0, 240);

  if (reason === "API_KEY_INVALID" || /API key not valid/i.test(msg)) {
    return new GeminiApiError(
      400,
      "Gemini API key is invalid. Please check GEMINI_API_KEY in Settings > Secrets.",
      "API_KEY_INVALID",
    );
  }
  if (code === 403 || reason === "PERMISSION_DENIED") {
    return new GeminiApiError(
      403,
      "Gemini API permission denied. Please verify your API key in Settings > Secrets.",
      "PERMISSION_DENIED",
    );
  }
  if (code === 429 || reason === "RESOURCE_EXHAUSTED") {
    return new GeminiApiError(
      429,
      "Gemini API quota exceeded. Please try again shortly or upgrade your key in Settings > Secrets.",
      "RESOURCE_EXHAUSTED",
    );
  }
  if (code === 404 || reason === "NOT_FOUND") {
    return new GeminiApiError(404, `Gemini model error: ${msg}`, "NOT_FOUND");
  }
  return new GeminiApiError(code >= 400 && code < 600 ? code : 500, `Gemini ${code}: ${msg}`, reason);
}

function formatReplyText(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^[ \t]*[*-][ \t]+/gm, "• ");
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(apiKey: string, system: string, turns: ChatTurn[]): Promise<string> {
  const model = resolveGeminiModel(process.env["GEMINI_MODEL"]);
  // Optional Cloudflare AI Gateway in front of Google (…/google-ai-studio); direct calls from
  // Workers to Google can stall.
  const baseUrl = clean(process.env["GEMINI_BASE_URL"]).replace(/\/+$/, "");
  const gatewayToken = clean(process.env["CF_AIG_TOKEN"]);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: GEMINI_TIMEOUT_MS,
      ...(baseUrl ? { baseUrl } : {}),
      headers: {
        "User-Agent": "aistudio-build",
        ...(gatewayToken ? { "cf-aig-authorization": `Bearer ${gatewayToken}` } : {}),
      },
    },
  });

  const invoke = (withThinkingLevel: boolean) =>
    ai.models.generateContent({
      model,
      contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      config: {
        systemInstruction: system,
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        ...(withThinkingLevel ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      },
    });

  const started = Date.now();
  let useThinkingLevel = true;
  let lastError: GeminiApiError | null = null;

  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    try {
      const response = await invoke(useThinkingLevel);
      const text = formatReplyText(response.text);
      console.log(`Gemini ${model} answered in ${Date.now() - started} ms`);
      if (!text) console.warn(`Gemini ${model} returned empty text`);
      return text;
    } catch (err) {
      const normalized = normalizeGeminiError(err);
      lastError = normalized;

      if (useThinkingLevel && normalized.status === 400 && /thinking/i.test(normalized.message)) {
        console.warn(`Gemini ${model} rejected thinkingConfig, retrying without it`);
        useThinkingLevel = false;
        continue;
      }

      const transient = normalized.status === 429 || normalized.status >= 500 || /timeout|aborted|fetch/i.test(normalized.message);
      if (transient && attempt < MAX_TRANSIENT_RETRIES) {
        await wait(400 * 2 ** attempt);
        continue;
      }

      throw normalized;
    }
  }

  throw lastError ?? new GeminiApiError(500, "Gemini request failed");
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
  const choices = (completion as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices;
  const content = choices?.[0]?.message?.content;
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
