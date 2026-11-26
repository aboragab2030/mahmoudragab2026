// Browser-side bridge that keeps the original `{ data, error }` call shape used by the
// clinic screens, while the work now runs in this app's own server functions.
import {
  addStaffUser,
  adminUpdatePassword,
  aiChat,
  ensureClinicErpSchema,
  ensureMedicalVideosSchema,
  ensureOffersSchema,
  ensurePartnersSchema,
  getMedicalVideoUrl,
  getPartnerDocumentUrl,
  lookupPatientBookings,
  paymobCreatePayment,
  paymobSettings,
  staffSetup,
  type BackendResult,
} from "@/lib/backend.functions";

export type BackendName =
  | "add-staff-user"
  | "admin-update-password"
  | "ai-chat"
  | "ensure-clinic-erp-schema"
  | "ensure-medical-videos-schema"
  | "ensure-offers-schema"
  | "ensure-partners-schema"
  | "get-medical-video-url"
  | "get-partner-document-url"
  | "lookup-patient-bookings"
  | "paymob-create-payment"
  | "paymob-settings"
  | "staff-setup";

export class BackendHttpError extends Error {
  status: number;
  context: { json: () => Promise<any> };
  constructor(status: number, body: any) {
    super(typeof body?.error === "string" ? body.error : `Request failed (${status})`);
    this.name = "BackendHttpError";
    this.status = status;
    this.context = { json: async () => body };
  }
}

export async function invokeBackend(
  name: BackendName,
  options: { body?: unknown; method?: "GET" | "POST" } = {},
): Promise<{ data: any; error: BackendHttpError | Error | null }> {
  try {
    let result: BackendResult;
    const body = (options.body ?? {}) as Record<string, any>;
    switch (name) {
      case "add-staff-user":
        result = await addStaffUser({ data: body });
        break;
      case "admin-update-password":
        result = await adminUpdatePassword({ data: body });
        break;
      case "ai-chat":
        result = await aiChat({ data: body });
        break;
      case "ensure-clinic-erp-schema":
        result = await ensureClinicErpSchema({ data: body });
        break;
      case "ensure-medical-videos-schema":
        result = await ensureMedicalVideosSchema({ data: body });
        break;
      case "ensure-offers-schema":
        result = await ensureOffersSchema({ data: body });
        break;
      case "ensure-partners-schema":
        result = await ensurePartnersSchema({ data: body });
        break;
      case "get-medical-video-url":
        result = await getMedicalVideoUrl({ data: body });
        break;
      case "get-partner-document-url":
        result = await getPartnerDocumentUrl({ data: body });
        break;
      case "lookup-patient-bookings":
        result = await lookupPatientBookings({ data: body });
        break;
      case "paymob-create-payment":
        result = await paymobCreatePayment({ data: body });
        break;
      case "paymob-settings":
        result = await paymobSettings({ data: { method: options.method ?? "POST", body } });
        break;
      case "staff-setup":
        result = await staffSetup({ data: body });
        break;
    }
    if (result.status >= 200 && result.status < 300) return { data: result.body, error: null };
    return { data: null, error: new BackendHttpError(result.status, result.body) };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}
