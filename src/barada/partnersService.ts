import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { invokeBackend } from '@/lib/backend';
import { contractingToRow } from './publicData';
import {
  DEFAULT_ALERT_SETTINGS,
  type ActivityFollowupStatus,
  type ContactCommunicationStatus,
  type ContactImportance,
  type ContractStatus,
  type FollowupPriority,
  type FollowupTaskStatus,
  type PartnerActivity,
  type PartnerActivityType,
  type PartnerAlertSettings,
  type PartnerAttachment,
  type PartnerAuditLog,
  type PartnerContact,
  type PartnerContract,
  type PartnerContractRenewal,
  type PartnerFollowup,
  type PartnerOrganization,
  type PartnerRenewalAlertLog,
  type RelationshipStatus,
} from './partnersTypes';
import { evaluateContractAlerts, findDuplicatePartner, type PendingRenewalAlert } from './partnersAnalytics';
import {
  clearPartnersFallback,
  hasPendingPartnersFallbackData,
  readPartnersFallback,
  updatePartnersFallback,
  type PartnerOrgExtras,
} from './partnersFallback';

type RowRecord = Record<string, unknown>;

export const mapOrganizationRow = (r: RowRecord): PartnerOrganization => ({
  id: Number(r.id),
  name: String(r.name || ''),
  documents: Array.isArray(r.documents) ? r.documents.map(String) : [],
  managerName: r.manager_name ? String(r.manager_name) : undefined,
  managerPhone: r.manager_phone ? String(r.manager_phone) : undefined,
  orgType: String(r.org_type || 'شركة تأمين'),
  sector: String(r.sector || ''),
  governorate: String(r.governorate || ''),
  city: String(r.city || ''),
  address: String(r.address || ''),
  phone: String(r.phone || ''),
  email: String(r.email || ''),
  website: String(r.website || ''),
  contactTitle: String(r.contact_title || ''),
  contactEmail: String(r.contact_email || ''),
  cooperationStartDate: String(r.cooperation_start_date || ''),
  relationshipStatus: (r.relationship_status as RelationshipStatus) || 'نشط',
  assignedStaffId: String(r.assigned_staff_id || ''),
  assignedStaffName: String(r.assigned_staff_name || ''),
  adminNotes: String(r.admin_notes || ''),
  isActive: r.is_active !== false,
  createdAt: r.created_at ? String(r.created_at) : undefined,
  updatedAt: r.updated_at ? String(r.updated_at) : undefined,
});

export function isMissingPartnersSchemaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const obj = err as { code?: unknown; message?: unknown };
  const code = String(obj.code || '');
  const msg = String(obj.message || '');
  return (
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    code === '42P01' ||
    code === '42703' ||
    /schema cache|does not exist|could not find the table|could not find the .* column|partner_contracts|partner_contacts|partner_activities|partner_followups|partner_alert_settings|partner_contract_renewals|partner_renewal_alert_logs|partner_audit_logs/i.test(
      msg,
    )
  );
}

export const mapContactRow = (r: RowRecord): PartnerContact => ({
  id: String(r.id || ''),
  companyId: Number(r.company_id),
  name: String(r.name || ''),
  jobTitle: String(r.job_title || ''),
  phone: String(r.phone || ''),
  email: String(r.email || ''),
  department: String(r.department || ''),
  importanceLevel: (r.importance_level as ContactImportance) || 'normal',
  communicationStatus: (r.communication_status as ContactCommunicationStatus) || 'active',
  isPrimary: Boolean(r.is_primary),
  lastContactAt: r.last_contact_at ? String(r.last_contact_at) : null,
  notes: String(r.notes || ''),
  isArchived: Boolean(r.is_archived),
  createdAt: String(r.created_at || ''),
  updatedAt: String(r.updated_at || ''),
});

export const mapActivityRow = (r: RowRecord): PartnerActivity => ({
  id: String(r.id || ''),
  companyId: Number(r.company_id),
  contactId: r.contact_id ? String(r.contact_id) : null,
  contactName: String(r.contact_name || ''),
  activityType: (r.activity_type as PartnerActivityType) || 'visit',
  activityDate: String(r.activity_date || ''),
  activityTime: String(r.activity_time || ''),
  staffUserId: String(r.staff_user_id || ''),
  staffName: String(r.staff_name || ''),
  goal: String(r.goal || ''),
  summary: String(r.summary || ''),
  outcomes: String(r.outcomes || ''),
  agreements: String(r.agreements || ''),
  nextSteps: String(r.next_steps || ''),
  nextFollowupDate: String(r.next_followup_date || ''),
  followupStatus: (r.followup_status as ActivityFollowupStatus) || 'pending',
  attachments: Array.isArray(r.attachments) ? (r.attachments as unknown as PartnerAttachment[]) : [],
  createdAt: String(r.created_at || ''),
  updatedAt: String(r.updated_at || ''),
});

export const mapContractRow = (r: RowRecord): PartnerContract => ({
  id: String(r.id || ''),
  companyId: Number(r.company_id),
  contractNumber: String(r.contract_number || ''),
  contractType: String(r.contract_type || 'سنوي'),
  signedDate: String(r.signed_date || ''),
  startDate: String(r.start_date || ''),
  endDate: String(r.end_date || ''),
  durationMonths: r.duration_months != null ? Number(r.duration_months) : null,
  status: (r.status as ContractStatus) || 'نشط',
  terms: String(r.terms || ''),
  discountTerms: String(r.discount_terms || ''),
  responsibleStaffId: String(r.responsible_staff_id || ''),
  responsibleStaffName: String(r.responsible_staff_name || ''),
  lastRenewalDate: String(r.last_renewal_date || ''),
  nextRenewalDate: String(r.next_renewal_date || ''),
  notes: String(r.notes || ''),
  attachmentPath: String(r.attachment_path || ''),
  attachmentName: String(r.attachment_name || ''),
  parentContractId: r.parent_contract_id ? String(r.parent_contract_id) : null,
  versionNumber: Number(r.version_number || 1),
  isCurrentVersion: r.is_current_version !== false,
  createdAt: String(r.created_at || ''),
  updatedAt: String(r.updated_at || ''),
});

export const mapRenewalRow = (r: RowRecord): PartnerContractRenewal => ({
  id: String(r.id || ''),
  companyId: Number(r.company_id),
  previousContractId: String(r.previous_contract_id || ''),
  renewedContractId: String(r.renewed_contract_id || ''),
  renewalDate: String(r.renewal_date || ''),
  newStartDate: String(r.new_start_date || ''),
  newEndDate: String(r.new_end_date || ''),
  nextRenewalDate: String(r.next_renewal_date || ''),
  renewalNotes: String(r.renewal_notes || ''),
  renewedBy: String(r.renewed_by || ''),
  renewedByName: String(r.renewed_by_name || ''),
  createdAt: String(r.created_at || ''),
});

export const mapFollowupRow = (r: RowRecord): PartnerFollowup => ({
  id: String(r.id || ''),
  companyId: Number(r.company_id),
  contactId: r.contact_id ? String(r.contact_id) : null,
  contractId: r.contract_id ? String(r.contract_id) : null,
  activityId: r.activity_id ? String(r.activity_id) : null,
  title: String(r.title || ''),
  assigneeUserId: String(r.assignee_user_id || ''),
  assigneeName: String(r.assignee_name || ''),
  createdDate: String(r.created_date || ''),
  dueDate: String(r.due_date || ''),
  followupType: String(r.followup_type || 'متابعة عامة'),
  priority: (r.priority as FollowupPriority) || 'medium',
  description: String(r.description || ''),
  status: (r.status as FollowupTaskStatus) || 'جديدة',
  outcome: String(r.outcome || ''),
  closedAt: r.closed_at ? String(r.closed_at) : null,
  createdAt: String(r.created_at || ''),
  updatedAt: String(r.updated_at || ''),
});

export const mapAlertSettingsRow = (r: RowRecord): PartnerAlertSettings => ({
  id: Number(r?.id || 1),
  alertDays: Array.isArray(r?.alert_days) ? r.alert_days.map(Number) : DEFAULT_ALERT_SETTINGS.alertDays,
  notifyOverdue: r?.notify_overdue !== false,
  autoMarkExpiringDays: Number(r?.auto_mark_expiring_days ?? 30),
  updatedAt: r?.updated_at ? String(r.updated_at) : undefined,
});

export const mapAlertLogRow = (r: RowRecord): PartnerRenewalAlertLog => ({
  id: String(r.id || ''),
  contractId: String(r.contract_id || ''),
  companyId: Number(r.company_id),
  thresholdDays: Number(r.threshold_days),
  alertDate: String(r.alert_date || ''),
  notificationId: r.notification_id ? String(r.notification_id) : null,
  title: String(r.title || ''),
  message: String(r.message || ''),
  createdAt: String(r.created_at || ''),
});

export const mapAuditLogRow = (r: RowRecord): PartnerAuditLog => ({
  id: String(r.id || ''),
  actorUserId: String(r.actor_user_id || ''),
  actorName: String(r.actor_name || ''),
  actionType: String(r.action_type || ''),
  entityType: String(r.entity_type || ''),
  entityId: String(r.entity_id || ''),
  companyId: r.company_id != null ? Number(r.company_id) : null,
  summary: String(r.summary || ''),
  metadata: (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>,
  createdAt: String(r.created_at || ''),
});

let schemaAttempted = false;
export async function ensurePartnersSchemaOnce(force = false): Promise<boolean> {
  if (schemaAttempted && !force) return false;
  schemaAttempted = true;
  try {
    const res = await invokeBackend('ensure-partners-schema', { body: {} });
    return Boolean((res.data as { migrated?: boolean } | null)?.migrated);
  } catch {
    return false;
  }
}

export interface PartnersBundle {
  schemaReady: boolean;
  organizations: PartnerOrganization[];
  contacts: PartnerContact[];
  activities: PartnerActivity[];
  contracts: PartnerContract[];
  renewals: PartnerContractRenewal[];
  followups: PartnerFollowup[];
  alertSettings: PartnerAlertSettings;
  alertLogs: PartnerRenewalAlertLog[];
  auditLogs: PartnerAuditLog[];
}

async function queryPartnersTables() {
  return Promise.all([
    supabase.from('contracting_companies').select('*').order('id', { ascending: true }),
    supabase.from('partner_contacts').select('*').order('is_primary', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('partner_activities').select('*').order('activity_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('partner_contracts').select('*').order('created_at', { ascending: false }),
    supabase.from('partner_contract_renewals').select('*').order('renewal_date', { ascending: false }),
    supabase.from('partner_followups').select('*').order('due_date', { ascending: true }),
    supabase.from('partner_alert_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('partner_renewal_alert_logs').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('partner_audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
}

function extractOrgExtras(payload: Omit<PartnerOrganization, 'id'>): PartnerOrgExtras {
  return {
    orgType: payload.orgType || 'شركة تأمين',
    sector: payload.sector || '',
    governorate: payload.governorate || '',
    city: payload.city || '',
    address: payload.address || '',
    phone: payload.phone || '',
    email: payload.email || '',
    website: payload.website || '',
    contactTitle: payload.contactTitle || '',
    contactEmail: payload.contactEmail || '',
    cooperationStartDate: payload.cooperationStartDate || '',
    relationshipStatus: payload.relationshipStatus || 'نشط',
    assignedStaffId: payload.assignedStaffId || '',
    assignedStaffName: payload.assignedStaffName || '',
    adminNotes: payload.adminNotes || '',
    isActive: payload.isActive !== false,
  };
}

function mergeOrgWithExtras(org: PartnerOrganization, extrasMap: Record<string, PartnerOrgExtras>): PartnerOrganization {
  const extra = extrasMap[String(org.id)];
  if (!extra) return org;
  return {
    ...org,
    ...extra,
  };
}

async function flushPendingFallbackToSupabase(): Promise<void> {
  const pending = readPartnersFallback();
  if (!hasPendingPartnersFallbackData(pending)) return;

  try {
    for (const [idStr, extra] of Object.entries(pending.orgExtras)) {
      const idNum = Number(idStr);
      if (!Number.isFinite(idNum)) continue;
      await supabase
        .from('contracting_companies')
        .update({
          org_type: extra.orgType || 'شركة تأمين',
          sector: extra.sector || null,
          governorate: extra.governorate || null,
          city: extra.city || null,
          address: extra.address || null,
          phone: extra.phone || null,
          email: extra.email || null,
          website: extra.website || null,
          contact_title: extra.contactTitle || null,
          contact_email: extra.contactEmail || null,
          cooperation_start_date: extra.cooperationStartDate || null,
          relationship_status: extra.relationshipStatus || 'نشط',
          assigned_staff_id: extra.assignedStaffId || null,
          assigned_staff_name: extra.assignedStaffName || null,
          admin_notes: extra.adminNotes || null,
          is_active: extra.isActive !== false,
        })
        .eq('id', idNum);
    }

    if (pending.alertSettings) {
      await supabase.from('partner_alert_settings').upsert(
        {
          id: 1,
          alert_days: pending.alertSettings.alertDays,
          notify_overdue: pending.alertSettings.notifyOverdue,
          auto_mark_expiring_days: pending.alertSettings.autoMarkExpiringDays,
          updated_at: pending.alertSettings.updatedAt || new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
    }

    if (pending.contacts.length > 0) {
      await supabase.from('partner_contacts').upsert(
        pending.contacts.map((c) => ({
          id: c.id,
          company_id: c.companyId,
          name: c.name,
          job_title: c.jobTitle || null,
          phone: c.phone || null,
          email: c.email || null,
          department: c.department || null,
          importance_level: c.importanceLevel,
          communication_status: c.communicationStatus,
          is_primary: c.isPrimary,
          last_contact_at: c.lastContactAt || null,
          notes: c.notes || null,
          is_archived: c.isArchived,
        })),
        { onConflict: 'id' },
      );
    }

    if (pending.activities.length > 0) {
      await supabase.from('partner_activities').upsert(
        pending.activities.map((a) => ({
          id: a.id,
          company_id: a.companyId,
          contact_id: a.contactId || null,
          contact_name: a.contactName || null,
          activity_type: a.activityType,
          activity_date: a.activityDate,
          activity_time: a.activityTime || null,
          staff_user_id: a.staffUserId || null,
          staff_name: a.staffName,
          goal: a.goal,
          summary: a.summary || null,
          outcomes: a.outcomes || null,
          agreements: a.agreements || null,
          next_steps: a.nextSteps || null,
          next_followup_date: a.nextFollowupDate || null,
          followup_status: a.followupStatus,
          attachments: a.attachments as unknown as Json,
        })),
        { onConflict: 'id' },
      );
    }

    if (pending.contracts.length > 0) {
      await supabase.from('partner_contracts').upsert(
        pending.contracts.map((c) => ({
          id: c.id,
          company_id: c.companyId,
          contract_number: c.contractNumber,
          contract_type: c.contractType,
          signed_date: c.signedDate || null,
          start_date: c.startDate,
          end_date: c.endDate,
          duration_months: c.durationMonths,
          status: c.status,
          terms: c.terms || null,
          discount_terms: c.discountTerms || null,
          responsible_staff_id: c.responsibleStaffId || null,
          responsible_staff_name: c.responsibleStaffName || null,
          last_renewal_date: c.lastRenewalDate || null,
          next_renewal_date: c.nextRenewalDate || null,
          notes: c.notes || null,
          attachment_path: c.attachmentPath || null,
          attachment_name: c.attachmentName || null,
          parent_contract_id: c.parentContractId || null,
          version_number: c.versionNumber,
          is_current_version: c.isCurrentVersion,
        })),
        { onConflict: 'id' },
      );
    }

    if (pending.renewals.length > 0) {
      await supabase.from('partner_contract_renewals').upsert(
        pending.renewals.map((r) => ({
          id: r.id,
          company_id: r.companyId,
          previous_contract_id: r.previousContractId,
          renewed_contract_id: r.renewedContractId,
          renewal_date: r.renewalDate,
          new_start_date: r.newStartDate,
          new_end_date: r.newEndDate,
          next_renewal_date: r.nextRenewalDate || null,
          renewal_notes: r.renewalNotes || null,
          renewed_by: r.renewedBy || null,
          renewed_by_name: r.renewedByName || null,
        })),
        { onConflict: 'id' },
      );
    }

    if (pending.followups.length > 0) {
      await supabase.from('partner_followups').upsert(
        pending.followups.map((f) => ({
          id: f.id,
          company_id: f.companyId,
          contact_id: f.contactId || null,
          contract_id: f.contractId || null,
          activity_id: f.activityId || null,
          title: f.title,
          assignee_user_id: f.assigneeUserId || null,
          assignee_name: f.assigneeName || null,
          due_date: f.dueDate,
          followup_type: f.followupType,
          priority: f.priority,
          description: f.description || null,
          status: f.status,
          outcome: f.outcome || null,
          closed_at: f.closedAt || null,
        })),
        { onConflict: 'id' },
      );
    }

    if (pending.alertLogs.length > 0) {
      await supabase.from('partner_renewal_alert_logs').upsert(
        pending.alertLogs.map((l) => ({
          id: l.id,
          contract_id: l.contractId,
          company_id: l.companyId,
          threshold_days: l.thresholdDays,
          alert_date: l.alertDate,
          notification_id: l.notificationId || null,
          title: l.title,
          message: l.message,
        })),
        { onConflict: 'id' },
      );
    }

    if (pending.auditLogs.length > 0) {
      await supabase.from('partner_audit_logs').upsert(
        pending.auditLogs.map((a) => ({
          id: a.id,
          actor_user_id: a.actorUserId || null,
          actor_name: a.actorName,
          action_type: a.actionType,
          entity_type: a.entityType,
          entity_id: a.entityId || null,
          company_id: a.companyId,
          summary: a.summary,
          metadata: (a.metadata || {}) as Json,
        })),
        { onConflict: 'id' },
      );
    }

    clearPartnersFallback();
  } catch {
    /* keep fallback data intact for next retry */
  }
}

export async function loadPartnersBundle(): Promise<PartnersBundle> {
  let results = await queryPartnersTables();
  let [
    orgsRes,
    contactsRes,
    activitiesRes,
    contractsRes,
    renewalsRes,
    followupsRes,
    settingsRes,
    alertLogsRes,
    auditLogsRes,
  ] = results;

  let missingExtended = [
    contactsRes.error,
    activitiesRes.error,
    contractsRes.error,
    renewalsRes.error,
    followupsRes.error,
    settingsRes.error,
    alertLogsRes.error,
    auditLogsRes.error,
  ].some((e) => e && isMissingPartnersSchemaError(e));

  if (missingExtended) {
    const migrated = await ensurePartnersSchemaOnce(false);
    if (migrated) {
      results = await queryPartnersTables();
      [
        orgsRes,
        contactsRes,
        activitiesRes,
        contractsRes,
        renewalsRes,
        followupsRes,
        settingsRes,
        alertLogsRes,
        auditLogsRes,
      ] = results;
      missingExtended = [
        contactsRes.error,
        activitiesRes.error,
        contractsRes.error,
        renewalsRes.error,
        followupsRes.error,
        settingsRes.error,
        alertLogsRes.error,
        auditLogsRes.error,
      ].some((e) => e && isMissingPartnersSchemaError(e));
    }
  }

  if (!missingExtended && hasPendingPartnersFallbackData()) {
    await flushPendingFallbackToSupabase();
    results = await queryPartnersTables();
    [
      orgsRes,
      contactsRes,
      activitiesRes,
      contractsRes,
      renewalsRes,
      followupsRes,
      settingsRes,
      alertLogsRes,
      auditLogsRes,
    ] = results;
  }

  const fallback = readPartnersFallback();
  const baseOrgs = (orgsRes.data || []).map((r) => mapOrganizationRow(r as RowRecord));
  const mergedOrgs = baseOrgs.map((org) => mergeOrgWithExtras(org, fallback.orgExtras));

  return {
    schemaReady: !missingExtended,
    organizations: mergedOrgs,
    contacts:
      contactsRes.error && isMissingPartnersSchemaError(contactsRes.error)
        ? fallback.contacts
        : (contactsRes.data || []).map(mapContactRow),
    activities:
      activitiesRes.error && isMissingPartnersSchemaError(activitiesRes.error)
        ? fallback.activities
        : (activitiesRes.data || []).map(mapActivityRow),
    contracts:
      contractsRes.error && isMissingPartnersSchemaError(contractsRes.error)
        ? fallback.contracts
        : (contractsRes.data || []).map(mapContractRow),
    renewals:
      renewalsRes.error && isMissingPartnersSchemaError(renewalsRes.error)
        ? fallback.renewals
        : (renewalsRes.data || []).map(mapRenewalRow),
    followups:
      followupsRes.error && isMissingPartnersSchemaError(followupsRes.error)
        ? fallback.followups
        : (followupsRes.data || []).map(mapFollowupRow),
    alertSettings:
      settingsRes.error && isMissingPartnersSchemaError(settingsRes.error)
        ? fallback.alertSettings || DEFAULT_ALERT_SETTINGS
        : settingsRes.data
          ? mapAlertSettingsRow(settingsRes.data)
          : fallback.alertSettings || DEFAULT_ALERT_SETTINGS,
    alertLogs:
      alertLogsRes.error && isMissingPartnersSchemaError(alertLogsRes.error)
        ? fallback.alertLogs
        : (alertLogsRes.data || []).map(mapAlertLogRow),
    auditLogs:
      auditLogsRes.error && isMissingPartnersSchemaError(auditLogsRes.error)
        ? fallback.auditLogs
        : (auditLogsRes.data || []).map(mapAuditLogRow),
  };
}

export async function savePartnerAlertSettings(
  settings: PartnerAlertSettings,
  actorUserId?: string,
): Promise<{ saved: PartnerAlertSettings | null; error: string | null }> {
  const cleanDays = [...new Set((settings.alertDays || []).map(Number).filter((d) => Number.isFinite(d) && d >= 0))].sort(
    (a, b) => b - a,
  );
  const normalizedSettings: PartnerAlertSettings = {
    id: 1,
    alertDays: cleanDays,
    notifyOverdue: Boolean(settings.notifyOverdue),
    autoMarkExpiringDays: Math.max(1, Number(settings.autoMarkExpiringDays || 30)),
    updatedAt: new Date().toISOString(),
  };

  const row = {
    id: 1,
    alert_days: normalizedSettings.alertDays,
    notify_overdue: normalizedSettings.notifyOverdue,
    auto_mark_expiring_days: normalizedSettings.autoMarkExpiringDays,
    updated_by: actorUserId || null,
    updated_at: normalizedSettings.updatedAt,
  };

  const upsertRes = await supabase
    .from('partner_alert_settings')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .maybeSingle();

  if (!upsertRes.error && upsertRes.data) {
    return { saved: mapAlertSettingsRow(upsertRes.data as RowRecord), error: null };
  }

  const updateRes = await supabase
    .from('partner_alert_settings')
    .update({
      alert_days: row.alert_days,
      notify_overdue: row.notify_overdue,
      auto_mark_expiring_days: row.auto_mark_expiring_days,
      updated_by: row.updated_by,
      updated_at: row.updated_at,
    })
    .eq('id', 1)
    .select('*')
    .maybeSingle();

  if (!updateRes.error && updateRes.data) {
    return { saved: mapAlertSettingsRow(updateRes.data as RowRecord), error: null };
  }

  const errObj = updateRes.error || upsertRes.error;
  if (isMissingPartnersSchemaError(errObj)) {
    const migrated = await ensurePartnersSchemaOnce(true);
    if (migrated) {
      const retry = await supabase
        .from('partner_alert_settings')
        .upsert(row, { onConflict: 'id' })
        .select('*')
        .maybeSingle();
      if (!retry.error && retry.data) {
        return { saved: mapAlertSettingsRow(retry.data as RowRecord), error: null };
      }
    }
    updatePartnersFallback((curr) => ({ ...curr, alertSettings: normalizedSettings }));
    return { saved: normalizedSettings, error: null };
  }

  return {
    saved: null,
    error: errObj?.message || 'تعذر حفظ إعدادات التنبيهات في قاعدة البيانات',
  };
}

export async function recordPartnerAudit(params: {
  actorUserId?: string;
  actorName: string;
  actionType: string;
  entityType: string;
  entityId?: string | number | null;
  companyId?: number | null;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const uid = params.actorUserId || (await supabase.auth.getUser()).data?.user?.id || null;
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from('partner_audit_logs').insert({
      actor_user_id: uid,
      actor_name: params.actorName || 'موظف',
      action_type: params.actionType,
      entity_type: params.entityType,
      entity_id: params.entityId != null ? String(params.entityId) : null,
      company_id: params.companyId ?? null,
      summary: params.summary,
      metadata: (params.metadata || {}) as Json,
    });
    if (error && isMissingPartnersSchemaError(error)) {
      const entry: PartnerAuditLog = {
        id: crypto.randomUUID(),
        actorUserId: uid || '',
        actorName: params.actorName || 'موظف',
        actionType: params.actionType,
        entityType: params.entityType,
        entityId: params.entityId != null ? String(params.entityId) : '',
        companyId: params.companyId ?? null,
        summary: params.summary,
        metadata: params.metadata || {},
        createdAt: nowIso,
      };
      updatePartnersFallback((curr) => ({
        ...curr,
        auditLogs: [entry, ...curr.auditLogs].slice(0, 200),
      }));
    }
  } catch {
    /* audit failure never breaks main flow */
  }
}

export async function savePartnerOrganization(
  payload: Omit<PartnerOrganization, 'id'>,
  existingOrgs: PartnerOrganization[],
  editingId: number | null,
  actorName: string,
  actorUserId?: string,
): Promise<{ error: string | null; companyId?: number }> {
  if (!payload.name.trim()) {
    return { error: 'اسم الجهة المتعاقدة مطلوب' };
  }

  const duplicate = findDuplicatePartner(
    existingOrgs,
    payload.name,
    payload.phone || payload.managerPhone,
    editingId,
  );
  if (duplicate) {
    return {
      error: `توجد جهة مسجلة بنفس الاسم أو رقم الهاتف بالفعل: "${duplicate.name}"`,
    };
  }

  const row = contractingToRow(payload);
  const baseRow = {
    name: row.name,
    documents: row.documents,
    manager_name: row.manager_name,
    manager_phone: row.manager_phone,
  };

  if (editingId) {
    let { error } = await supabase
      .from('contracting_companies')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', editingId);

    if (error && isMissingPartnersSchemaError(error)) {
      const retry = await supabase
        .from('contracting_companies')
        .update({ ...baseRow, updated_at: new Date().toISOString() })
        .eq('id', editingId);
      error = retry.error;
      if (!error) {
        updatePartnersFallback((curr) => ({
          ...curr,
          orgExtras: { ...curr.orgExtras, [String(editingId)]: extractOrgExtras(payload) },
        }));
      }
    }

    if (error) {
      return { error: error.message || 'تعذر تحديث بيانات الجهة المتعاقدة' };
    }
    await recordPartnerAudit({
      actorUserId,
      actorName,
      actionType: 'org_updated',
      entityType: 'contracting_companies',
      entityId: editingId,
      companyId: editingId,
      summary: `تعديل بيانات جهة: ${payload.name}`,
    });
    return { error: null, companyId: editingId };
  }

  let { data, error } = await supabase
    .from('contracting_companies')
    .insert(row)
    .select('id')
    .single();

  let usedFallbackExtras = false;
  if (error && isMissingPartnersSchemaError(error)) {
    const retry = await supabase
      .from('contracting_companies')
      .insert(baseRow)
      .select('id')
      .single();
    data = retry.data;
    error = retry.error;
    usedFallbackExtras = !error;
  }

  if (error) {
    return { error: error.message || 'تعذر إضافة الجهة المتعاقدة' };
  }
  const insertedId = (data as { id?: number } | null)?.id;
  if (usedFallbackExtras && insertedId != null) {
    updatePartnersFallback((curr) => ({
      ...curr,
      orgExtras: { ...curr.orgExtras, [String(insertedId)]: extractOrgExtras(payload) },
    }));
  }
  await recordPartnerAudit({
    actorUserId,
    actorName,
    actionType: 'org_created',
    entityType: 'contracting_companies',
    entityId: insertedId,
    companyId: insertedId ?? null,
    summary: `إضافة جهة متعاقدة جديدة: ${payload.name}`,
  });
  return { error: null, companyId: insertedId };
}

export async function deletePartnerOrganizationRecord(
  orgId: number,
  orgName: string,
  actorName: string,
  actorUserId?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('contracting_companies').delete().eq('id', orgId);
  if (error) {
    return { error: error.message || 'تعذر حذف الجهة المتعاقدة' };
  }
  updatePartnersFallback((curr) => {
    const nextExtras = { ...curr.orgExtras };
    delete nextExtras[String(orgId)];
    return {
      ...curr,
      orgExtras: nextExtras,
      contacts: curr.contacts.filter((c) => c.companyId !== orgId),
      activities: curr.activities.filter((a) => a.companyId !== orgId),
      contracts: curr.contracts.filter((c) => c.companyId !== orgId),
      renewals: curr.renewals.filter((r) => r.companyId !== orgId),
      followups: curr.followups.filter((f) => f.companyId !== orgId),
      alertLogs: curr.alertLogs.filter((l) => l.companyId !== orgId),
    };
  });
  await recordPartnerAudit({
    actorUserId,
    actorName,
    actionType: 'org_deleted',
    entityType: 'contracting_companies',
    entityId: orgId,
    companyId: orgId,
    summary: `حذف جهة متعاقدة: ${orgName || orgId}`,
  });
  return { error: null };
}

export async function savePartnerContact(params: {
  editingId: string | null;
  companyId: number;
  orgName: string;
  name: string;
  jobTitle: string;
  phone: string;
  email: string;
  department: string;
  importanceLevel: ContactImportance;
  communicationStatus: ContactCommunicationStatus;
  isPrimary: boolean;
  notes: string;
  actorName: string;
  actorUserId?: string;
}): Promise<{ error: string | null }> {
  if (params.isPrimary) {
    await supabase
      .from('partner_contacts')
      .update({ is_primary: false })
      .eq('company_id', params.companyId);
  }

  const payload = {
    company_id: params.companyId,
    name: params.name.trim(),
    job_title: params.jobTitle.trim() || null,
    phone: params.phone.trim() || null,
    email: params.email.trim() || null,
    department: params.department.trim() || null,
    importance_level: params.importanceLevel,
    communication_status: params.communicationStatus,
    is_primary: params.isPrimary,
    notes: params.notes.trim() || null,
  };

  const { error } = params.editingId
    ? await supabase.from('partner_contacts').update(payload).eq('id', params.editingId)
    : await supabase.from('partner_contacts').insert(payload);

  if (error) {
    if (!isMissingPartnersSchemaError(error)) {
      return { error: error.message || 'تعذر حفظ بيانات مسؤول التواصل' };
    }
    const nowIso = new Date().toISOString();
    updatePartnersFallback((curr) => {
      const baseList = params.isPrimary
        ? curr.contacts.map((c) => (c.companyId === params.companyId ? { ...c, isPrimary: false } : c))
        : curr.contacts;
      if (params.editingId) {
        return {
          ...curr,
          contacts: baseList.map((c) =>
            c.id === params.editingId
              ? {
                  ...c,
                  companyId: params.companyId,
                  name: params.name.trim(),
                  jobTitle: params.jobTitle.trim(),
                  phone: params.phone.trim(),
                  email: params.email.trim(),
                  department: params.department.trim(),
                  importanceLevel: params.importanceLevel,
                  communicationStatus: params.communicationStatus,
                  isPrimary: params.isPrimary,
                  notes: params.notes.trim(),
                  updatedAt: nowIso,
                }
              : c,
          ),
        };
      }
      const created: PartnerContact = {
        id: crypto.randomUUID(),
        companyId: params.companyId,
        name: params.name.trim(),
        jobTitle: params.jobTitle.trim(),
        phone: params.phone.trim(),
        email: params.email.trim(),
        department: params.department.trim(),
        importanceLevel: params.importanceLevel,
        communicationStatus: params.communicationStatus,
        isPrimary: params.isPrimary,
        lastContactAt: null,
        notes: params.notes.trim(),
        isArchived: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      return { ...curr, contacts: [created, ...baseList] };
    });
  }

  await recordPartnerAudit({
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    actionType: 'contact_saved',
    entityType: 'partner_contacts',
    entityId: params.editingId || undefined,
    companyId: params.companyId,
    summary: `${params.editingId ? 'تعديل' : 'إضافة'} مسؤول تواصل: ${params.name} (${params.orgName})`,
  });
  return { error: null };
}

export async function toggleArchivePartnerContact(contact: PartnerContact): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('partner_contacts')
    .update({ is_archived: !contact.isArchived })
    .eq('id', contact.id);

  if (error) {
    if (!isMissingPartnersSchemaError(error)) {
      return { error: error.message || 'تعذر تحديث حالة مسؤول التواصل' };
    }
    updatePartnersFallback((curr) => ({
      ...curr,
      contacts: curr.contacts.map((c) =>
        c.id === contact.id ? { ...c, isArchived: !c.isArchived, updatedAt: new Date().toISOString() } : c,
      ),
    }));
  }
  return { error: null };
}

export async function savePartnerActivity(params: {
  editingId: string | null;
  companyId: number;
  orgName: string;
  contactId: string | null;
  contactName: string;
  activityType: PartnerActivityType;
  activityTypeLabel: string;
  activityDate: string;
  activityTime: string;
  staffUserId: string;
  staffName: string;
  goal: string;
  summary: string;
  outcomes: string;
  agreements: string;
  nextSteps: string;
  nextFollowupDate: string;
  followupStatus: ActivityFollowupStatus;
  attachments: PartnerAttachment[];
  createAutoFollowup: boolean;
  canCreateFollowup: boolean;
  actorName: string;
  actorUserId?: string;
}): Promise<{ error: string | null }> {
  const payload = {
    company_id: params.companyId,
    contact_id: params.contactId || null,
    contact_name: params.contactName.trim() || null,
    activity_type: params.activityType,
    activity_date: params.activityDate,
    activity_time: params.activityTime || null,
    staff_user_id: params.staffUserId || params.actorUserId || null,
    staff_name: params.staffName || params.actorName,
    goal: params.goal.trim(),
    summary: params.summary.trim() || null,
    outcomes: params.outcomes.trim() || null,
    agreements: params.agreements.trim() || null,
    next_steps: params.nextSteps.trim() || null,
    next_followup_date: params.nextFollowupDate || null,
    followup_status: params.followupStatus,
    attachments: params.attachments as unknown as Json,
  };

  const res = params.editingId
    ? await supabase.from('partner_activities').update(payload).eq('id', params.editingId).select('id').single()
    : await supabase.from('partner_activities').insert(payload).select('id').single();

  let savedActId = (res.data as { id?: string } | null)?.id || params.editingId;
  let usedFallback = false;

  if (res.error) {
    if (!isMissingPartnersSchemaError(res.error)) {
      return { error: res.error.message || 'تعذر حفظ سجل الزيارة/الاجتماع' };
    }
    usedFallback = true;
    const nowIso = new Date().toISOString();
    savedActId = params.editingId || crypto.randomUUID();
    updatePartnersFallback((curr) => {
      const updatedContacts = params.contactId
        ? curr.contacts.map((c) =>
            c.id === params.contactId ? { ...c, lastContactAt: nowIso, updatedAt: nowIso } : c,
          )
        : curr.contacts;

      if (params.editingId) {
        return {
          ...curr,
          contacts: updatedContacts,
          activities: curr.activities.map((a) =>
            a.id === params.editingId
              ? {
                  ...a,
                  companyId: params.companyId,
                  contactId: params.contactId,
                  contactName: params.contactName,
                  activityType: params.activityType,
                  activityDate: params.activityDate,
                  activityTime: params.activityTime,
                  staffUserId: params.staffUserId || params.actorUserId || '',
                  staffName: params.staffName || params.actorName,
                  goal: params.goal.trim(),
                  summary: params.summary.trim(),
                  outcomes: params.outcomes.trim(),
                  agreements: params.agreements.trim(),
                  nextSteps: params.nextSteps.trim(),
                  nextFollowupDate: params.nextFollowupDate,
                  followupStatus: params.followupStatus,
                  attachments: params.attachments,
                  updatedAt: nowIso,
                }
              : a,
          ),
        };
      }
      const created: PartnerActivity = {
        id: savedActId!,
        companyId: params.companyId,
        contactId: params.contactId,
        contactName: params.contactName,
        activityType: params.activityType,
        activityDate: params.activityDate,
        activityTime: params.activityTime,
        staffUserId: params.staffUserId || params.actorUserId || '',
        staffName: params.staffName || params.actorName,
        goal: params.goal.trim(),
        summary: params.summary.trim(),
        outcomes: params.outcomes.trim(),
        agreements: params.agreements.trim(),
        nextSteps: params.nextSteps.trim(),
        nextFollowupDate: params.nextFollowupDate,
        followupStatus: params.followupStatus,
        attachments: params.attachments,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      return {
        ...curr,
        contacts: updatedContacts,
        activities: [created, ...curr.activities],
      };
    });
  }

  if (!params.editingId && params.createAutoFollowup && params.nextFollowupDate && params.canCreateFollowup) {
    await savePartnerFollowup({
      editingId: null,
      companyId: params.companyId,
      contactId: params.contactId,
      activityId: savedActId || null,
      title: `متابعة: ${params.goal.trim()}`,
      assigneeUserId: params.staffUserId || params.actorUserId || '',
      assigneeName: params.staffName || params.actorName,
      dueDate: params.nextFollowupDate,
      followupType: params.activityTypeLabel,
      priority: 'medium',
      description: params.nextSteps.trim() || params.summary.trim(),
      status: 'جديدة',
      outcome: '',
      actorName: params.actorName,
      actorUserId: params.actorUserId,
      skipAudit: true,
    });
  }

  await recordPartnerAudit({
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    actionType: params.editingId ? 'activity_updated' : 'activity_created',
    entityType: 'partner_activities',
    entityId: savedActId,
    companyId: params.companyId,
    summary: `${params.activityTypeLabel} مع ${params.orgName}: ${params.goal.trim()}`,
    metadata: usedFallback ? { fallback: true } : undefined,
  });

  return { error: null };
}

export async function deletePartnerActivityRecord(
  activity: PartnerActivity,
  actorName: string,
  actorUserId?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('partner_activities').delete().eq('id', activity.id);
  if (error) {
    if (!isMissingPartnersSchemaError(error)) {
      return { error: error.message || 'تعذر حذف النشاط' };
    }
    updatePartnersFallback((curr) => ({
      ...curr,
      activities: curr.activities.filter((a) => a.id !== activity.id),
    }));
  }
  await recordPartnerAudit({
    actorUserId,
    actorName,
    actionType: 'activity_deleted',
    entityType: 'partner_activities',
    entityId: activity.id,
    companyId: activity.companyId,
    summary: `حذف نشاط: ${activity.goal}`,
  });
  return { error: null };
}

export async function savePartnerContract(params: {
  editingId: string | null;
  companyId: number;
  orgName: string;
  contractNumber: string;
  contractType: string;
  signedDate: string;
  startDate: string;
  endDate: string;
  durationMonths: number | null;
  status: ContractStatus;
  terms: string;
  discountTerms: string;
  responsibleStaffId: string;
  responsibleStaffName: string;
  nextRenewalDate: string;
  notes: string;
  attachmentPath: string;
  attachmentName: string;
  actorName: string;
  actorUserId?: string;
}): Promise<{ error: string | null }> {
  const payload = {
    company_id: params.companyId,
    contract_number: params.contractNumber.trim(),
    contract_type: params.contractType,
    signed_date: params.signedDate || null,
    start_date: params.startDate,
    end_date: params.endDate,
    duration_months: params.durationMonths,
    status: params.status,
    terms: params.terms.trim() || null,
    discount_terms: params.discountTerms.trim() || null,
    responsible_staff_id: params.responsibleStaffId || null,
    responsible_staff_name: params.responsibleStaffName || params.actorName,
    next_renewal_date: params.nextRenewalDate || params.endDate,
    notes: params.notes.trim() || null,
    attachment_path: params.attachmentPath || null,
    attachment_name: params.attachmentName || null,
  };

  const { error } = params.editingId
    ? await supabase.from('partner_contracts').update(payload).eq('id', params.editingId)
    : await supabase.from('partner_contracts').insert(payload);

  if (error) {
    if (!isMissingPartnersSchemaError(error)) {
      return { error: error.message || 'تعذر حفظ العقد' };
    }
    const nowIso = new Date().toISOString();
    updatePartnersFallback((curr) => {
      if (params.editingId) {
        return {
          ...curr,
          contracts: curr.contracts.map((c) =>
            c.id === params.editingId
              ? {
                  ...c,
                  companyId: params.companyId,
                  contractNumber: params.contractNumber.trim(),
                  contractType: params.contractType,
                  signedDate: params.signedDate,
                  startDate: params.startDate,
                  endDate: params.endDate,
                  durationMonths: params.durationMonths,
                  status: params.status,
                  terms: params.terms.trim(),
                  discountTerms: params.discountTerms.trim(),
                  responsibleStaffId: params.responsibleStaffId,
                  responsibleStaffName: params.responsibleStaffName || params.actorName,
                  nextRenewalDate: params.nextRenewalDate || params.endDate,
                  notes: params.notes.trim(),
                  attachmentPath: params.attachmentPath,
                  attachmentName: params.attachmentName,
                  updatedAt: nowIso,
                }
              : c,
          ),
        };
      }
      const created: PartnerContract = {
        id: crypto.randomUUID(),
        companyId: params.companyId,
        contractNumber: params.contractNumber.trim(),
        contractType: params.contractType,
        signedDate: params.signedDate,
        startDate: params.startDate,
        endDate: params.endDate,
        durationMonths: params.durationMonths,
        status: params.status,
        terms: params.terms.trim(),
        discountTerms: params.discountTerms.trim(),
        responsibleStaffId: params.responsibleStaffId,
        responsibleStaffName: params.responsibleStaffName || params.actorName,
        lastRenewalDate: '',
        nextRenewalDate: params.nextRenewalDate || params.endDate,
        notes: params.notes.trim(),
        attachmentPath: params.attachmentPath,
        attachmentName: params.attachmentName,
        parentContractId: null,
        versionNumber: 1,
        isCurrentVersion: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      return { ...curr, contracts: [created, ...curr.contracts] };
    });
  }

  await recordPartnerAudit({
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    actionType: params.editingId ? 'contract_updated' : 'contract_created',
    entityType: 'partner_contracts',
    entityId: params.editingId || undefined,
    companyId: params.companyId,
    summary: `${params.editingId ? 'تعديل' : 'إنشاء'} عقد (${params.contractNumber}) لجهة ${params.orgName}`,
  });
  return { error: null };
}

export async function deletePartnerContractRecord(
  contract: PartnerContract,
  actorName: string,
  actorUserId?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('partner_contracts').delete().eq('id', contract.id);
  if (error) {
    if (!isMissingPartnersSchemaError(error)) {
      return { error: error.message || 'تعذر حذف العقد' };
    }
    updatePartnersFallback((curr) => ({
      ...curr,
      contracts: curr.contracts.filter((c) => c.id !== contract.id),
    }));
  }
  await recordPartnerAudit({
    actorUserId,
    actorName,
    actionType: 'contract_deleted',
    entityType: 'partner_contracts',
    entityId: contract.id,
    companyId: contract.companyId,
    summary: `حذف العقد ${contract.contractNumber}`,
  });
  return { error: null };
}

export async function savePartnerFollowup(params: {
  editingId: string | null;
  companyId: number;
  contactId?: string | null;
  contractId?: string | null;
  activityId?: string | null;
  title: string;
  assigneeUserId: string;
  assigneeName: string;
  dueDate: string;
  followupType: string;
  priority: FollowupPriority;
  description: string;
  status: FollowupTaskStatus;
  outcome: string;
  actorName: string;
  actorUserId?: string;
  skipAudit?: boolean;
}): Promise<{ error: string | null }> {
  const isClosing = params.status === 'مكتملة' || params.status === 'ملغاة';
  const nowIso = new Date().toISOString();
  const payload = {
    company_id: params.companyId,
    contact_id: params.contactId || null,
    contract_id: params.contractId || null,
    activity_id: params.activityId || null,
    title: params.title.trim(),
    assignee_user_id: params.assigneeUserId || null,
    assignee_name: params.assigneeName || null,
    due_date: params.dueDate,
    followup_type: params.followupType,
    priority: params.priority,
    description: params.description.trim() || null,
    status: params.status,
    outcome: params.outcome.trim() || null,
    closed_at: isClosing ? nowIso : null,
  };

  const { error } = params.editingId
    ? await supabase.from('partner_followups').update(payload).eq('id', params.editingId)
    : await supabase.from('partner_followups').insert(payload);

  if (error) {
    if (!isMissingPartnersSchemaError(error)) {
      return { error: error.message || 'تعذر حفظ مهمة المتابعة' };
    }
    updatePartnersFallback((curr) => {
      if (params.editingId) {
        return {
          ...curr,
          followups: curr.followups.map((f) =>
            f.id === params.editingId
              ? {
                  ...f,
                  companyId: params.companyId,
                  title: params.title.trim(),
                  assigneeUserId: params.assigneeUserId,
                  assigneeName: params.assigneeName,
                  dueDate: params.dueDate,
                  followupType: params.followupType,
                  priority: params.priority,
                  description: params.description.trim(),
                  status: params.status,
                  outcome: params.outcome.trim(),
                  closedAt: isClosing ? nowIso : null,
                  updatedAt: nowIso,
                }
              : f,
          ),
        };
      }
      const created: PartnerFollowup = {
        id: crypto.randomUUID(),
        companyId: params.companyId,
        contactId: params.contactId || null,
        contractId: params.contractId || null,
        activityId: params.activityId || null,
        title: params.title.trim(),
        assigneeUserId: params.assigneeUserId,
        assigneeName: params.assigneeName,
        createdDate: nowIso.slice(0, 10),
        dueDate: params.dueDate,
        followupType: params.followupType,
        priority: params.priority,
        description: params.description.trim(),
        status: params.status,
        outcome: params.outcome.trim(),
        closedAt: isClosing ? nowIso : null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      return { ...curr, followups: [created, ...curr.followups] };
    });
  }

  if (!params.skipAudit) {
    await recordPartnerAudit({
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      actionType: isClosing ? 'followup_closed' : params.editingId ? 'followup_updated' : 'followup_created',
      entityType: 'partner_followups',
      entityId: params.editingId || undefined,
      companyId: params.companyId,
      summary: `${params.editingId ? 'تحديث' : 'إنشاء'} مهمة متابعة (${params.status}): ${params.title}`,
    });
  }
  return { error: null };
}

export async function completePartnerFollowupRecord(
  followup: PartnerFollowup,
  actorName: string,
  actorUserId?: string,
): Promise<{ error: string | null }> {
  const closedAt = new Date().toISOString();
  const { error } = await supabase
    .from('partner_followups')
    .update({ status: 'مكتملة', closed_at: closedAt })
    .eq('id', followup.id);

  if (error) {
    if (!isMissingPartnersSchemaError(error)) {
      return { error: error.message || 'تعذر إكمال المهمة' };
    }
    updatePartnersFallback((curr) => ({
      ...curr,
      followups: curr.followups.map((f) =>
        f.id === followup.id ? { ...f, status: 'مكتملة', closedAt, updatedAt: closedAt } : f,
      ),
    }));
  }

  await recordPartnerAudit({
    actorUserId,
    actorName,
    actionType: 'followup_closed',
    entityType: 'partner_followups',
    entityId: followup.id,
    companyId: followup.companyId,
    summary: `إغلاق مهمة المتابعة: ${followup.title}`,
  });
  return { error: null };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

export async function uploadPartnerDocument(
  file: File,
  folder: string,
): Promise<{ path: string; name: string; mimeType: string; size: number } | { error: string }> {
  const maxBytes = 15 * 1024 * 1024;
  if (file.size > maxBytes) {
    return { error: 'الحد الأقصى لحجم المرفق هو 15 ميجابايت' };
  }
  const safeExt = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
  const allowed = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx']);
  if (!allowed.has(safeExt)) {
    return { error: 'صيغة الملف غير مدعومة. الصيغ المسموح بها: PDF, JPG, PNG, WEBP, DOC, DOCX' };
  }
  const objectPath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  const { error } = await supabase.storage
    .from('partner-contract-documents')
    .upload(objectPath, file, { contentType: file.type || undefined, upsert: false });
  if (error) {
    const errMsg = `${error.message || ''} ${(error as { statusCode?: unknown }).statusCode || ''}`;
    if (/bucket not found|does not exist|404/i.test(errMsg) && file.size <= 1.5 * 1024 * 1024) {
      try {
        const dataUrl = await fileToDataUrl(file);
        return {
          path: dataUrl,
          name: file.name,
          mimeType: file.type,
          size: file.size,
        };
      } catch {
        /* fall through */
      }
    }
    return { error: error.message || 'تعذر رفع الملف' };
  }
  return {
    path: objectPath,
    name: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

export async function openPartnerDocument(storagePath: string): Promise<string | null> {
  if (!storagePath) return null;
  if (storagePath.startsWith('data:')) return storagePath;
  const { data, error } = await invokeBackend('get-partner-document-url', {
    body: { path: storagePath },
  });
  if (!error && data?.url) return data.url as string;

  const { data: signed } = await supabase.storage
    .from('partner-contract-documents')
    .createSignedUrl(storagePath, 300);
  return signed?.signedUrl || null;
}

export async function renewPartnerContract(params: {
  previousContract: PartnerContract;
  newContractNumber: string;
  newStartDate: string;
  newEndDate: string;
  nextRenewalDate?: string;
  terms?: string;
  discountTerms?: string;
  renewalNotes?: string;
  attachmentPath?: string;
  attachmentName?: string;
  actorUserId?: string;
  actorName: string;
}): Promise<{ error: string | null }> {
  const { previousContract } = params;
  if (!params.newStartDate || !params.newEndDate) {
    return { error: 'تاريخ بداية ونهاية العقد المجدد مطلوبان' };
  }
  if (params.newEndDate < params.newStartDate) {
    return { error: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية' };
  }

  const today = new Date().toISOString().slice(0, 10);
  const newVersion = (previousContract.versionNumber || 1) + 1;

  // 1. Insert the new version without deleting or overwriting previous contract
  const { data: inserted, error: insertErr } = await supabase
    .from('partner_contracts')
    .insert({
      company_id: previousContract.companyId,
      contract_number: params.newContractNumber.trim() || previousContract.contractNumber,
      contract_type: previousContract.contractType,
      signed_date: today,
      start_date: params.newStartDate,
      end_date: params.newEndDate,
      duration_months: previousContract.durationMonths,
      status: 'نشط',
      terms: params.terms ?? previousContract.terms ?? null,
      discount_terms: params.discountTerms ?? previousContract.discountTerms ?? null,
      responsible_staff_id: previousContract.responsibleStaffId || null,
      responsible_staff_name: previousContract.responsibleStaffName || params.actorName,
      last_renewal_date: today,
      next_renewal_date: params.nextRenewalDate || params.newEndDate,
      notes: params.renewalNotes || previousContract.notes || null,
      attachment_path: params.attachmentPath ?? (previousContract.attachmentPath || null),
      attachment_name: params.attachmentName ?? (previousContract.attachmentName || null),
      parent_contract_id: previousContract.id,
      version_number: newVersion,
      is_current_version: true,
    })
    .select('id')
    .single();

  let renewedContractId = (inserted as { id?: string } | null)?.id;

  if (insertErr || !renewedContractId) {
    if (!isMissingPartnersSchemaError(insertErr)) {
      return { error: insertErr?.message || 'تعذر إنشاء نسخة التجديد الجديدة' };
    }
    const nowIso = new Date().toISOString();
    renewedContractId = crypto.randomUUID();
    const newContract: PartnerContract = {
      id: renewedContractId,
      companyId: previousContract.companyId,
      contractNumber: params.newContractNumber.trim() || previousContract.contractNumber,
      contractType: previousContract.contractType,
      signedDate: today,
      startDate: params.newStartDate,
      endDate: params.newEndDate,
      durationMonths: previousContract.durationMonths,
      status: 'نشط',
      terms: params.terms ?? previousContract.terms ?? '',
      discountTerms: params.discountTerms ?? previousContract.discountTerms ?? '',
      responsibleStaffId: previousContract.responsibleStaffId || '',
      responsibleStaffName: previousContract.responsibleStaffName || params.actorName,
      lastRenewalDate: today,
      nextRenewalDate: params.nextRenewalDate || params.newEndDate,
      notes: params.renewalNotes || previousContract.notes || '',
      attachmentPath: params.attachmentPath ?? (previousContract.attachmentPath || ''),
      attachmentName: params.attachmentName ?? (previousContract.attachmentName || ''),
      parentContractId: previousContract.id,
      versionNumber: newVersion,
      isCurrentVersion: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const renewalRecord: PartnerContractRenewal = {
      id: crypto.randomUUID(),
      companyId: previousContract.companyId,
      previousContractId: previousContract.id,
      renewedContractId,
      renewalDate: today,
      newStartDate: params.newStartDate,
      newEndDate: params.newEndDate,
      nextRenewalDate: params.nextRenewalDate || params.newEndDate,
      renewalNotes: params.renewalNotes || '',
      renewedBy: params.actorUserId || '',
      renewedByName: params.actorName,
      createdAt: nowIso,
    };
    updatePartnersFallback((curr) => ({
      ...curr,
      contracts: [
        newContract,
        ...curr.contracts.map((c) =>
          c.id === previousContract.id
            ? { ...c, status: 'مجدد' as ContractStatus, isCurrentVersion: false, lastRenewalDate: today, updatedAt: nowIso }
            : c,
        ),
      ],
      renewals: [renewalRecord, ...curr.renewals],
    }));
  } else {
    // 2. Mark previous version as historical 'مجدد' without overwriting its dates or terms
    await supabase
      .from('partner_contracts')
      .update({
        status: 'مجدد',
        is_current_version: false,
        last_renewal_date: today,
      })
      .eq('id', previousContract.id);

    // 3. Append immutable renewal history record
    await supabase.from('partner_contract_renewals').insert({
      company_id: previousContract.companyId,
      previous_contract_id: previousContract.id,
      renewed_contract_id: renewedContractId,
      renewal_date: today,
      new_start_date: params.newStartDate,
      new_end_date: params.newEndDate,
      next_renewal_date: params.nextRenewalDate || params.newEndDate,
      renewal_notes: params.renewalNotes || null,
      renewed_by: params.actorUserId || null,
      renewed_by_name: params.actorName,
    });
  }

  await recordPartnerAudit({
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    actionType: 'contract_renewed',
    entityType: 'partner_contracts',
    entityId: renewedContractId,
    companyId: previousContract.companyId,
    summary: `تجديد العقد ${previousContract.contractNumber} إلى النسخة v${newVersion}`,
    metadata: {
      previousContractId: previousContract.id,
      newStartDate: params.newStartDate,
      newEndDate: params.newEndDate,
    },
  });

  return { error: null };
}

export async function syncContractRenewalAlerts(params: {
  contracts: PartnerContract[];
  organizations: PartnerOrganization[];
  alertSettings: PartnerAlertSettings;
  existingLogs: PartnerRenewalAlertLog[];
  onLocalNotify?: (title: string, message: string, type: 'warning' | 'info') => void;
}): Promise<PendingRenewalAlert[]> {
  const pending = evaluateContractAlerts(
    params.contracts,
    params.organizations,
    params.alertSettings,
    params.existingLogs,
  );
  if (pending.length === 0) return [];

  const created: PendingRenewalAlert[] = [];
  for (const alert of pending) {
    try {
      const { data: notifRow } = await supabase
        .from('app_notifications')
        .insert({
          title: alert.title,
          message: alert.message,
          type: alert.severity,
          read: false,
        })
        .select('id')
        .maybeSingle();

      const notificationId = (notifRow as { id?: string } | null)?.id || null;
      const { error: logErr } = await supabase.from('partner_renewal_alert_logs').insert({
        contract_id: alert.contractId,
        company_id: alert.companyId,
        threshold_days: alert.thresholdDays,
        alert_date: alert.alertDate,
        notification_id: notificationId,
        title: alert.title,
        message: alert.message,
      });

      if (!logErr) {
        created.push(alert);
        params.onLocalNotify?.(alert.title, alert.message, alert.severity);
      } else if (isMissingPartnersSchemaError(logErr)) {
        const logEntry: PartnerRenewalAlertLog = {
          id: crypto.randomUUID(),
          contractId: alert.contractId,
          companyId: alert.companyId,
          thresholdDays: alert.thresholdDays,
          alertDate: alert.alertDate,
          notificationId,
          title: alert.title,
          message: alert.message,
          createdAt: new Date().toISOString(),
        };
        updatePartnersFallback((curr) => ({
          ...curr,
          alertLogs: [logEntry, ...curr.alertLogs],
        }));
        created.push(alert);
        params.onLocalNotify?.(alert.title, alert.message, alert.severity);
      }
    } catch {
      /* ignore deduplication conflict */
    }
  }
  return created;
}
