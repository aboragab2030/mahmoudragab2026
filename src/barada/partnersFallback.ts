import type {
  PartnerActivity,
  PartnerAlertSettings,
  PartnerAuditLog,
  PartnerContact,
  PartnerContract,
  PartnerContractRenewal,
  PartnerFollowup,
  PartnerOrganization,
  PartnerRenewalAlertLog,
} from './partnersTypes';

export const PARTNERS_FALLBACK_STORAGE_KEY = 'barada_partners_fallback_v1';

export type PartnerOrgExtras = Omit<
  PartnerOrganization,
  'id' | 'name' | 'documents' | 'managerName' | 'managerPhone' | 'createdAt' | 'updatedAt'
>;

export interface PartnersFallbackStore {
  orgExtras: Record<string, PartnerOrgExtras>;
  contacts: PartnerContact[];
  activities: PartnerActivity[];
  contracts: PartnerContract[];
  renewals: PartnerContractRenewal[];
  followups: PartnerFollowup[];
  alertSettings: PartnerAlertSettings | null;
  alertLogs: PartnerRenewalAlertLog[];
  auditLogs: PartnerAuditLog[];
}

const createEmptyStore = (): PartnersFallbackStore => ({
  orgExtras: {},
  contacts: [],
  activities: [],
  contracts: [],
  renewals: [],
  followups: [],
  alertSettings: null,
  alertLogs: [],
  auditLogs: [],
});

export function readPartnersFallback(): PartnersFallbackStore {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createEmptyStore();
  }
  try {
    const raw = window.localStorage.getItem(PARTNERS_FALLBACK_STORAGE_KEY);
    if (!raw) return createEmptyStore();
    const parsed = JSON.parse(raw) as Partial<PartnersFallbackStore> | null;
    if (!parsed || typeof parsed !== 'object') return createEmptyStore();
    return {
      orgExtras: parsed.orgExtras && typeof parsed.orgExtras === 'object' ? parsed.orgExtras : {},
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      contracts: Array.isArray(parsed.contracts) ? parsed.contracts : [],
      renewals: Array.isArray(parsed.renewals) ? parsed.renewals : [],
      followups: Array.isArray(parsed.followups) ? parsed.followups : [],
      alertSettings: parsed.alertSettings && typeof parsed.alertSettings === 'object' ? parsed.alertSettings : null,
      alertLogs: Array.isArray(parsed.alertLogs) ? parsed.alertLogs : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    };
  } catch {
    return createEmptyStore();
  }
}

export function writePartnersFallback(store: PartnersFallbackStore): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PARTNERS_FALLBACK_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore storage quota errors */
  }
}

export function updatePartnersFallback(
  updater: (current: PartnersFallbackStore) => PartnersFallbackStore,
): PartnersFallbackStore {
  const next = updater(readPartnersFallback());
  writePartnersFallback(next);
  return next;
}

export function clearPartnersFallback(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(PARTNERS_FALLBACK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasPendingPartnersFallbackData(store: PartnersFallbackStore = readPartnersFallback()): boolean {
  return (
    Object.keys(store.orgExtras).length > 0 ||
    store.contacts.length > 0 ||
    store.activities.length > 0 ||
    store.contracts.length > 0 ||
    store.renewals.length > 0 ||
    store.followups.length > 0 ||
    store.alertSettings !== null ||
    store.alertLogs.length > 0 ||
    store.auditLogs.length > 0
  );
}
