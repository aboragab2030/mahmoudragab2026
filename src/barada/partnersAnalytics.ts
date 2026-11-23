import type {
  ContractStatus,
  PartnerActivity,
  PartnerAlertSettings,
  PartnerContract,
  PartnerFollowup,
  PartnerOrganization,
  PartnerRenewalAlertLog,
} from './partnersTypes';

export interface PartnerPermissionUser {
  role: 'admin' | 'staff';
  permissions: string[];
}

const LEGACY_MANAGE_PARTNERS_GRANTS = new Set([
  'partners_view',
  'partners_view_dashboard',
  'partners_view_organizations',
  'partners_create_organizations',
  'partners_edit_organizations',
  'partners_delete_organizations',
]);

export function hasPartnerPermission(
  user: PartnerPermissionUser | null | undefined,
  permission: string,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = user.permissions || [];
  if (perms.includes(permission)) return true;
  if (perms.includes('manage_partners') && LEGACY_MANAGE_PARTNERS_GRANTS.has(permission)) {
    return true;
  }
  return false;
}

export function cairoTodayIso(now: Date = new Date()): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function diffCalendarDays(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return Number.NaN;
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.round((b - a) / 86400000);
}

export function normalizePartnerName(value: string | null | undefined): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

export function normalizePhoneKey(value: string | null | undefined): string {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0020') && digits.length >= 13) {
    return `0${digits.slice(4)}`;
  }
  if (digits.startsWith('20') && digits.length === 12) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

export function findDuplicatePartner(
  organizations: Pick<PartnerOrganization, 'id' | 'name' | 'phone' | 'managerPhone'>[],
  candidateName: string,
  candidatePhone?: string,
  excludeId?: number | null,
): PartnerOrganization | null {
  const targetName = normalizePartnerName(candidateName);
  const targetPhone = normalizePhoneKey(candidatePhone);

  for (const org of organizations) {
    if (excludeId != null && org.id === excludeId) continue;
    if (targetName && normalizePartnerName(org.name) === targetName) {
      return org as PartnerOrganization;
    }
    if (targetPhone && targetPhone.length >= 8) {
      const orgPhone = normalizePhoneKey(org.phone);
      const mgrPhone = normalizePhoneKey(org.managerPhone);
      if ((orgPhone && orgPhone === targetPhone) || (mgrPhone && mgrPhone === targetPhone)) {
        return org as PartnerOrganization;
      }
    }
  }
  return null;
}

export function computeContractEffectiveStatus(
  contract: Pick<PartnerContract, 'status' | 'endDate'>,
  autoExpiringDays = 30,
  todayIso = cairoTodayIso(),
): { effectiveStatus: ContractStatus; daysRemaining: number } {
  const daysRemaining = diffCalendarDays(todayIso, contract.endDate);
  const manual = contract.status;

  if (
    manual === 'مسودة' ||
    manual === 'تحت المراجعة' ||
    manual === 'بانتظار التوقيع' ||
    manual === 'مجدد' ||
    manual === 'ملغي'
  ) {
    return { effectiveStatus: manual, daysRemaining };
  }

  if (Number.isFinite(daysRemaining)) {
    if (daysRemaining < 0) {
      return { effectiveStatus: 'منتهي', daysRemaining };
    }
    if (daysRemaining <= autoExpiringDays) {
      return { effectiveStatus: 'قريب الانتهاء', daysRemaining };
    }
  }

  return { effectiveStatus: manual, daysRemaining };
}

export interface PendingRenewalAlert {
  contractId: string;
  companyId: number;
  companyName: string;
  contractNumber: string;
  endDate: string;
  daysRemaining: number;
  thresholdDays: number;
  alertDate: string;
  title: string;
  message: string;
  severity: 'warning' | 'info';
}

export function evaluateContractAlerts(
  contracts: PartnerContract[],
  companies: Pick<PartnerOrganization, 'id' | 'name'>[],
  settings: PartnerAlertSettings,
  existingLogs: Pick<PartnerRenewalAlertLog, 'contractId' | 'thresholdDays' | 'alertDate'>[],
  todayIso = cairoTodayIso(),
): PendingRenewalAlert[] {
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));
  const sentKeys = new Set(
    existingLogs.map((l) => `${l.contractId}|${l.thresholdDays}|${l.alertDate}`),
  );
  const thresholds = [...(settings.alertDays || [90, 60, 30, 15, 7, 0])].sort((a, b) => a - b);
  const pending: PendingRenewalAlert[] = [];

  for (const contract of contracts) {
    if (!contract.isCurrentVersion) continue;
    if (
      contract.status === 'ملغي' ||
      contract.status === 'مجدد' ||
      contract.status === 'مسودة'
    ) {
      continue;
    }

    const daysRemaining = diffCalendarDays(todayIso, contract.endDate);
    if (!Number.isFinite(daysRemaining)) continue;

    let matchedThreshold: number | null = null;
    if (daysRemaining < 0 && settings.notifyOverdue) {
      matchedThreshold = -1;
    } else {
      for (const th of thresholds) {
        if (daysRemaining <= th && daysRemaining >= 0) {
          matchedThreshold = th;
          break;
        }
      }
    }

    if (matchedThreshold === null) continue;
    const dedupeKey = `${contract.id}|${matchedThreshold}|${todayIso}`;
    if (sentKeys.has(dedupeKey)) continue;

    const companyName = companyMap.get(contract.companyId) || `جهة #${contract.companyId}`;
    const isOverdue = matchedThreshold < 0;
    const isToday = daysRemaining === 0;
    const title = isOverdue
      ? `انتهاء عقد شريك نجاح: ${companyName}`
      : isToday
        ? `ينتهي اليوم عقد: ${companyName}`
        : `تنبيه تجديد عقد (${daysRemaining} يوم): ${companyName}`;
    const message = isOverdue
      ? `العقد رقم (${contract.contractNumber}) الخاص بجهة "${companyName}" منتهي منذ ${Math.abs(daysRemaining)} يوم (تاريخ الانتهاء: ${contract.endDate}).`
      : isToday
        ? `العقد رقم (${contract.contractNumber}) الخاص بجهة "${companyName}" ينتهي اليوم (${contract.endDate}).`
        : `العقد رقم (${contract.contractNumber}) الخاص بجهة "${companyName}" سينتهي خلال ${daysRemaining} يوم (${contract.endDate}).`;

    pending.push({
      contractId: contract.id,
      companyId: contract.companyId,
      companyName,
      contractNumber: contract.contractNumber,
      endDate: contract.endDate,
      daysRemaining,
      thresholdDays: matchedThreshold,
      alertDate: todayIso,
      title,
      message,
      severity: daysRemaining <= 15 ? 'warning' : 'info',
    });
  }

  return pending;
}

export interface AnalyticsBookingRecord {
  id: string;
  patientName: string;
  phone: string;
  phone2?: string | null;
  doctorId?: string | null;
  doctorName: string;
  service: string;
  date: string;
  time?: string;
  status: string;
  bookingType?: string | null;
  contractingCompanyId?: number | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  notes?: string | null;
  createdAt?: string;
}

export interface AnalyticsOperationRecord {
  id: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  surgeryType: string;
  date: string;
  cost: number;
  status: string;
  contractingCompanyId?: number | null;
}

export interface AnalyticsPaymentRecord {
  id: string;
  bookingId?: string | null;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | string;
  paymentType?: string;
  createdAt?: string;
}

export interface AnalyticsFilter {
  companyId?: number | null;
  dateFrom?: string;
  dateTo?: string;
  month?: string; // YYYY-MM
  year?: string; // YYYY
  status?: string;
  doctorName?: string;
}

function matchesDateFilter(dateStr: string, filter?: AnalyticsFilter): boolean {
  if (!filter) return true;
  const d = (dateStr || '').slice(0, 10);
  if (filter.dateFrom && d < filter.dateFrom) return false;
  if (filter.dateTo && d > filter.dateTo) return false;
  if (filter.month && !d.startsWith(filter.month)) return false;
  if (filter.year && !d.startsWith(filter.year)) return false;
  return true;
}

export function patientKeyForRecord(phone?: string | null, name?: string | null): string {
  const p = normalizePhoneKey(phone);
  if (p) return `p:${p}`;
  const n = normalizePartnerName(name);
  return n ? `n:${n}` : '';
}

export interface PartnerReferralSummary {
  uniquePatients: number;
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  totalSurgeries: number;
  uniqueSurgeryPatients: number;
  conversionRate: number;
  currentMonthPatients: number;
  previousMonthPatients: number;
  currentYearPatients: number;
  previousYearPatients: number;
}

export function computePartnerReferrals(
  companyId: number | null,
  bookings: AnalyticsBookingRecord[],
  operations: AnalyticsOperationRecord[],
  filter: AnalyticsFilter = {},
  todayIso = cairoTodayIso(),
): PartnerReferralSummary {
  const effectiveCompanyId = companyId ?? filter.companyId ?? null;

  const matchedBookings = bookings.filter((b) => {
    if (!b.contractingCompanyId) return false;
    if (effectiveCompanyId !== null && b.contractingCompanyId !== effectiveCompanyId) return false;
    if (filter.doctorName && b.doctorName !== filter.doctorName) return false;
    if (filter.status && b.status !== filter.status) return false;
    return matchesDateFilter(b.date, filter);
  });

  const matchedOps = operations.filter((o) => {
    if (!o.contractingCompanyId) return false;
    if (effectiveCompanyId !== null && o.contractingCompanyId !== effectiveCompanyId) return false;
    if (filter.doctorName && o.doctorName !== filter.doctorName) return false;
    if (filter.status === 'cancelled' && o.status !== 'cancelled') return false;
    if (filter.status === 'confirmed' && o.status === 'cancelled') return false;
    return matchesDateFilter(o.date, filter);
  });

  const uniqueKeys = new Set<string>();
  const surgeryPatientKeys = new Set<string>();
  let confirmedBookings = 0;
  let cancelledBookings = 0;

  for (const b of matchedBookings) {
    const key = patientKeyForRecord(b.phone, b.patientName);
    if (key) uniqueKeys.add(key);
    if (b.status === 'cancelled') cancelledBookings += 1;
    else confirmedBookings += 1;
  }

  let totalSurgeries = 0;
  for (const op of matchedOps) {
    if (op.status === 'cancelled') continue;
    totalSurgeries += 1;
    const key = patientKeyForRecord(op.patientPhone, op.patientName);
    if (key) {
      uniqueKeys.add(key);
      surgeryPatientKeys.add(key);
    }
  }

  const currentMonth = todayIso.slice(0, 7);
  const currentYear = todayIso.slice(0, 4);
  const prevMonthDate = new Date(`${currentMonth}-01T00:00:00Z`);
  prevMonthDate.setUTCMonth(prevMonthDate.getUTCMonth() - 1);
  const previousMonth = prevMonthDate.toISOString().slice(0, 7);
  const previousYear = String(Number(currentYear) - 1);

  const countPatientsInPrefix = (prefix: string) => {
    const keys = new Set<string>();
    for (const b of bookings) {
      if (!b.contractingCompanyId) continue;
      if (effectiveCompanyId !== null && b.contractingCompanyId !== effectiveCompanyId) continue;
      if (b.status === 'cancelled') continue;
      if ((b.date || '').startsWith(prefix)) {
        const k = patientKeyForRecord(b.phone, b.patientName);
        if (k) keys.add(k);
      }
    }
    for (const op of operations) {
      if (!op.contractingCompanyId || op.status === 'cancelled') continue;
      if (effectiveCompanyId !== null && op.contractingCompanyId !== effectiveCompanyId) continue;
      if ((op.date || '').startsWith(prefix)) {
        const k = patientKeyForRecord(op.patientPhone, op.patientName);
        if (k) keys.add(k);
      }
    }
    return keys.size;
  };

  const uniquePatients = uniqueKeys.size;
  const conversionRate =
    uniquePatients > 0 ? Math.round((surgeryPatientKeys.size / uniquePatients) * 100) : 0;

  return {
    uniquePatients,
    totalBookings: matchedBookings.length,
    confirmedBookings,
    cancelledBookings,
    totalSurgeries,
    uniqueSurgeryPatients: surgeryPatientKeys.size,
    conversionRate,
    currentMonthPatients: countPatientsInPrefix(currentMonth),
    previousMonthPatients: countPatientsInPrefix(previousMonth),
    currentYearPatients: countPatientsInPrefix(currentYear),
    previousYearPatients: countPatientsInPrefix(previousYear),
  };
}

export interface PartnerRevenueSummary {
  totalBilled: number;
  collectedAmount: number;
  outstandingAmount: number;
  refundedOrCancelledAmount: number;
  examRevenue: number;
  surgeryRevenue: number;
  transactionCount: number;
  avgRevenuePerPatient: number;
  monthlySeries: { month: string; collected: number; billed: number; surgeries: number }[];
}

const FOLLOWUP_RE = /متابعة كشف|متابعة الكشف|متابعة عملية|متابعة العملية/;

export function estimateBookingAmount(
  booking: AnalyticsBookingRecord,
  doctors: { id?: string | number; name: string; fee?: number }[],
  services: { title: string; price?: number }[],
): number {
  const serviceRow = services.find((s) => s.title === booking.service);
  const servicePrice = Number(serviceRow?.price || 0);
  const isFollowUp = FOLLOWUP_RE.test(booking.service || '');
  const doctorRow = doctors.find(
    (d) =>
      (booking.doctorId != null && String(d.id) === String(booking.doctorId)) ||
      d.name === booking.doctorName,
  );
  const doctorFee = isFollowUp ? 0 : Number(doctorRow?.fee || 0);
  const offerMatch = (booking.notes || '').match(/السعر:\s*(\d+(?:\.\d+)?)/);
  if (offerMatch) {
    const parsed = Number(offerMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return Math.max(0, servicePrice + doctorFee);
}

export function computePartnerRevenue(
  companyId: number | null,
  bookings: AnalyticsBookingRecord[],
  operations: AnalyticsOperationRecord[],
  payments: AnalyticsPaymentRecord[],
  doctors: { id?: string | number; name: string; fee?: number }[],
  services: { title: string; price?: number }[],
  filter: AnalyticsFilter = {},
): PartnerRevenueSummary {
  const effectiveCompanyId = companyId ?? filter.companyId ?? null;
  const paymentsByBooking = new Map<string, AnalyticsPaymentRecord[]>();
  for (const p of payments) {
    if (!p.bookingId) continue;
    const arr = paymentsByBooking.get(p.bookingId) || [];
    arr.push(p);
    paymentsByBooking.set(p.bookingId, arr);
  }

  let totalBilled = 0;
  let collectedAmount = 0;
  let outstandingAmount = 0;
  let refundedOrCancelledAmount = 0;
  let examRevenue = 0;
  let surgeryRevenue = 0;
  let transactionCount = 0;
  const uniquePatients = new Set<string>();
  const monthlyMap = new Map<string, { collected: number; billed: number; surgeries: number }>();

  const bumpMonth = (dateStr: string, collected: number, billed: number, surgery = 0) => {
    const m = (dateStr || '').slice(0, 7);
    if (!m) return;
    const cur = monthlyMap.get(m) || { collected: 0, billed: 0, surgeries: 0 };
    cur.collected += collected;
    cur.billed += billed;
    cur.surgeries += surgery;
    monthlyMap.set(m, cur);
  };

  for (const b of bookings) {
    if (!b.contractingCompanyId) continue;
    if (effectiveCompanyId !== null && b.contractingCompanyId !== effectiveCompanyId) continue;
    if (filter.doctorName && b.doctorName !== filter.doctorName) continue;
    if (!matchesDateFilter(b.date, filter)) continue;

    const pKey = patientKeyForRecord(b.phone, b.patientName);
    if (pKey && b.status !== 'cancelled') uniquePatients.add(pKey);

    const linkedPayments = paymentsByBooking.get(b.id) || [];
    const paidPayments = linkedPayments.filter((p) => p.status === 'paid');
    const paidSum = paidPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const estimated = estimateBookingAmount(b, doctors, services);

    if (b.status === 'cancelled') {
      if (paidSum > 0) {
        refundedOrCancelledAmount += paidSum;
        transactionCount += paidPayments.length;
      } else if (b.paymentStatus === 'paid' && estimated > 0) {
        refundedOrCancelledAmount += estimated;
        transactionCount += 1;
      }
      continue;
    }

    if (paidSum > 0) {
      const billed = Math.max(paidSum, estimated);
      totalBilled += billed;
      collectedAmount += paidSum;
      examRevenue += paidSum;
      if (billed > paidSum) outstandingAmount += billed - paidSum;
      transactionCount += paidPayments.length;
      bumpMonth(b.date, paidSum, billed, 0);
    } else if (b.paymentStatus === 'paid') {
      totalBilled += estimated;
      collectedAmount += estimated;
      examRevenue += estimated;
      if (estimated > 0) transactionCount += 1;
      bumpMonth(b.date, estimated, estimated, 0);
    } else {
      totalBilled += estimated;
      outstandingAmount += estimated;
      bumpMonth(b.date, 0, estimated, 0);
    }
  }

  for (const op of operations) {
    if (!op.contractingCompanyId) continue;
    if (effectiveCompanyId !== null && op.contractingCompanyId !== effectiveCompanyId) continue;
    if (filter.doctorName && op.doctorName !== filter.doctorName) continue;
    if (!matchesDateFilter(op.date, filter)) continue;

    const cost = Math.max(0, Number(op.cost || 0));
    if (op.status === 'cancelled') {
      continue;
    }

    const pKey = patientKeyForRecord(op.patientPhone, op.patientName);
    if (pKey) uniquePatients.add(pKey);

    totalBilled += cost;
    if (op.status === 'confirmed') {
      collectedAmount += cost;
      surgeryRevenue += cost;
      if (cost > 0) transactionCount += 1;
      bumpMonth(op.date, cost, cost, cost);
    } else {
      outstandingAmount += cost;
      bumpMonth(op.date, 0, cost, cost);
    }
  }

  const avgRevenuePerPatient =
    uniquePatients.size > 0 ? Math.round(collectedAmount / uniquePatients.size) : 0;

  const monthlySeries = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({ month, ...vals }));

  return {
    totalBilled,
    collectedAmount,
    outstandingAmount,
    refundedOrCancelledAmount,
    examRevenue,
    surgeryRevenue,
    transactionCount,
    avgRevenuePerPatient,
    monthlySeries,
  };
}

export interface PartnersDashboardKpis {
  totalOrganizations: number;
  activeOrganizations: number;
  expiringSoonContracts: number;
  expiredContracts: number;
  newOrganizationsThisMonth: number;
  activitiesThisMonth: number;
  totalReferredPatients: number;
  totalPartnerBookings: number;
  totalPartnerSurgeries: number;
  totalPartnerRevenue: number;
  overdueFollowups: number;
  openFollowups: number;
}

export function computePartnersDashboardSummary(params: {
  organizations: PartnerOrganization[];
  contracts: PartnerContract[];
  activities: PartnerActivity[];
  followups: PartnerFollowup[];
  bookings: AnalyticsBookingRecord[];
  operations: AnalyticsOperationRecord[];
  payments: AnalyticsPaymentRecord[];
  doctors: { id?: string | number; name: string; fee?: number }[];
  services: { title: string; price?: number }[];
  autoExpiringDays?: number;
  todayIso?: string;
}) {
  const todayIso = params.todayIso || cairoTodayIso();
  const currentMonth = todayIso.slice(0, 7);
  const autoExpiringDays = params.autoExpiringDays ?? 30;

  const activeOrganizations = params.organizations.filter(
    (o) => o.isActive && o.relationshipStatus === 'نشط',
  ).length;

  const newOrganizationsThisMonth = params.organizations.filter(
    (o) =>
      (o.cooperationStartDate || '').startsWith(currentMonth) ||
      (o.createdAt || '').startsWith(currentMonth),
  ).length;

  let expiringSoonContracts = 0;
  let expiredContracts = 0;
  const contractStatusDistribution: Record<string, number> = {};

  for (const c of params.contracts) {
    if (!c.isCurrentVersion) continue;
    const { effectiveStatus } = computeContractEffectiveStatus(c, autoExpiringDays, todayIso);
    contractStatusDistribution[effectiveStatus] =
      (contractStatusDistribution[effectiveStatus] || 0) + 1;
    if (effectiveStatus === 'قريب الانتهاء') expiringSoonContracts += 1;
    if (effectiveStatus === 'منتهي') expiredContracts += 1;
  }

  const activitiesThisMonth = params.activities.filter((a) =>
    (a.activityDate || '').startsWith(currentMonth),
  ).length;

  let overdueFollowups = 0;
  let openFollowups = 0;
  for (const f of params.followups) {
    if (f.status === 'مكتملة' || f.status === 'ملغاة') continue;
    openFollowups += 1;
    if (f.status === 'متأخرة' || (f.dueDate && f.dueDate < todayIso)) {
      overdueFollowups += 1;
    }
  }

  const allReferrals = computePartnerReferrals(
    null,
    params.bookings,
    params.operations,
    {},
    todayIso,
  );
  const allRevenue = computePartnerRevenue(
    null,
    params.bookings,
    params.operations,
    params.payments,
    params.doctors,
    params.services,
    {},
  );

  const orgReferralStats = params.organizations.map((org) => {
    const ref = computePartnerReferrals(org.id, params.bookings, params.operations, {}, todayIso);
    const rev = computePartnerRevenue(
      org.id,
      params.bookings,
      params.operations,
      params.payments,
      params.doctors,
      params.services,
      {},
    );
    return {
      companyId: org.id,
      name: org.name,
      governorate: org.governorate || 'غير محدد',
      orgType: org.orgType || 'أخرى',
      uniquePatients: ref.uniquePatients,
      totalBookings: ref.totalBookings,
      totalSurgeries: ref.totalSurgeries,
      collectedRevenue: rev.collectedAmount,
      billedRevenue: rev.totalBilled,
    };
  });

  const monthlyActivitiesMap = new Map<string, number>();
  for (const a of params.activities) {
    const m = (a.activityDate || '').slice(0, 7);
    if (!m) continue;
    monthlyActivitiesMap.set(m, (monthlyActivitiesMap.get(m) || 0) + 1);
  }
  const monthlyActivities = [...monthlyActivitiesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, count]) => ({ month, count }));

  const monthlyReferralsMap = new Map<string, Set<string>>();
  for (const b of params.bookings) {
    if (!b.contractingCompanyId || b.status === 'cancelled') continue;
    const m = (b.date || '').slice(0, 7);
    if (!m) continue;
    const set = monthlyReferralsMap.get(m) || new Set<string>();
    const k = patientKeyForRecord(b.phone, b.patientName);
    if (k) set.add(k);
    monthlyReferralsMap.set(m, set);
  }
  const monthlyReferrals = [...monthlyReferralsMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, set]) => ({ month, patients: set.size }));

  const governorateDistribution: Record<string, number> = {};
  const orgTypeDistribution: Record<string, number> = {};
  for (const o of params.organizations) {
    const gov = o.governorate?.trim() || 'غير محدد';
    governorateDistribution[gov] = (governorateDistribution[gov] || 0) + 1;
    const type = o.orgType?.trim() || 'أخرى';
    orgTypeDistribution[type] = (orgTypeDistribution[type] || 0) + 1;
  }

  const kpis: PartnersDashboardKpis = {
    totalOrganizations: params.organizations.length,
    activeOrganizations,
    expiringSoonContracts,
    expiredContracts,
    newOrganizationsThisMonth,
    activitiesThisMonth,
    totalReferredPatients: allReferrals.uniquePatients,
    totalPartnerBookings: allReferrals.totalBookings,
    totalPartnerSurgeries: allReferrals.totalSurgeries,
    totalPartnerRevenue: allRevenue.collectedAmount,
    overdueFollowups,
    openFollowups,
  };

  return {
    kpis,
    topByPatients: [...orgReferralStats]
      .sort((a, b) => b.uniquePatients - a.uniquePatients)
      .slice(0, 8),
    topByRevenue: [...orgReferralStats]
      .sort((a, b) => b.collectedRevenue - a.collectedRevenue)
      .slice(0, 8),
    monthlyActivities,
    monthlyReferrals,
    contractStatusDistribution,
    governorateDistribution,
    orgTypeDistribution,
  };
}

export function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function buildCsvContent(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(sanitizeCsvCell).join(',');
  const bodyLines = rows.map((row) => row.map(sanitizeCsvCell).join(','));
  return `\uFEFF${[headerLine, ...bodyLines].join('\r\n')}`;
}
