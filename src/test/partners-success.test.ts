import { describe, expect, it, vi } from 'vitest';
import {
  buildCsvContent,
  computeContractEffectiveStatus,
  computePartnerReferrals,
  computePartnerRevenue,
  computePartnersDashboardSummary,
  evaluateContractAlerts,
  findDuplicatePartner,
  hasPartnerPermission,
  normalizePartnerName,
  normalizePhoneKey,
  sanitizeCsvCell,
} from '@/barada/partnersAnalytics';
import {
  canAccessSection,
  DASHBOARD_PERMISSIONS,
  PARTNER_PERMISSIONS,
  SECTION_PERMISSIONS,
} from '@/barada/permissions';
import type {
  PartnerActivity,
  PartnerAlertSettings,
  PartnerContract,
  PartnerFollowup,
  PartnerOrganization,
} from '@/barada/partnersTypes';

const makeOrg = (overrides: Partial<PartnerOrganization> = {}): PartnerOrganization => ({
  id: 1,
  name: 'شركة النيل للتأمين الطبي',
  documents: ['صورة الكارنيه'],
  managerName: 'أحمد علي',
  managerPhone: '01012345678',
  orgType: 'شركة تأمين',
  sector: 'التأمين الطبي',
  governorate: 'الأقصر',
  city: 'الأقصر',
  address: 'شارع التلفزيون',
  phone: '01099887766',
  email: 'info@nile.test',
  website: '',
  contactTitle: 'مدير التعاقدات',
  contactEmail: 'ahmed@nile.test',
  cooperationStartDate: '2025-01-01',
  relationshipStatus: 'نشط',
  assignedStaffId: 'staff-1',
  assignedStaffName: 'سارة محمود',
  adminNotes: '',
  isActive: true,
  createdAt: '2025-01-01T10:00:00Z',
  ...overrides,
});

const makeContract = (overrides: Partial<PartnerContract> = {}): PartnerContract => ({
  id: 'c-1',
  companyId: 1,
  contractNumber: 'CON-2026-001',
  contractType: 'سنوي',
  signedDate: '2026-01-01',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  durationMonths: 12,
  status: 'نشط',
  terms: '',
  discountTerms: 'خصم 20%',
  responsibleStaffId: 'staff-1',
  responsibleStaffName: 'سارة محمود',
  lastRenewalDate: '',
  nextRenewalDate: '2026-12-01',
  notes: '',
  attachmentPath: '',
  attachmentName: '',
  parentContractId: null,
  versionNumber: 1,
  isCurrentVersion: true,
  createdAt: '2026-01-01T09:00:00Z',
  updatedAt: '2026-01-01T09:00:00Z',
  ...overrides,
});

describe('Partners of Success — Permissions & Security', () => {
  it('grants admin all partner permissions', () => {
    const admin = { role: 'admin' as const, permissions: [] };
    for (const p of PARTNER_PERMISSIONS) {
      expect(hasPartnerPermission(admin, p.id)).toBe(true);
    }
    expect(canAccessSection(admin, 'partners')).toBe(true);
  });

  it('keeps legacy manage_partners backward-compatible without escalating to financial/export/delete-contract permissions', () => {
    const legacyStaff = { role: 'staff' as const, permissions: ['manage_partners'] };
    expect(canAccessSection(legacyStaff, 'partners')).toBe(true);
    expect(hasPartnerPermission(legacyStaff, 'partners_view')).toBe(true);
    expect(hasPartnerPermission(legacyStaff, 'partners_view_dashboard')).toBe(true);
    expect(hasPartnerPermission(legacyStaff, 'partners_view_organizations')).toBe(true);
    expect(hasPartnerPermission(legacyStaff, 'partners_create_organizations')).toBe(true);
    expect(hasPartnerPermission(legacyStaff, 'partners_edit_organizations')).toBe(true);
    expect(hasPartnerPermission(legacyStaff, 'partners_delete_organizations')).toBe(true);

    // Must NOT gain sensitive financial/export/settings/contract-delete privileges automatically
    expect(hasPartnerPermission(legacyStaff, 'partners_view_revenue')).toBe(false);
    expect(hasPartnerPermission(legacyStaff, 'partners_view_financial_reports')).toBe(false);
    expect(hasPartnerPermission(legacyStaff, 'partners_export_reports')).toBe(false);
    expect(hasPartnerPermission(legacyStaff, 'partners_delete_contracts')).toBe(false);
    expect(hasPartnerPermission(legacyStaff, 'partners_manage_settings')).toBe(false);
  });

  it('enforces granular read-only vs unauthorized access', () => {
    const readOnly = { role: 'staff' as const, permissions: ['partners_view_organizations', 'partners_view_referrals'] };
    expect(canAccessSection(readOnly, 'partners')).toBe(true);
    expect(hasPartnerPermission(readOnly, 'partners_view_organizations')).toBe(true);
    expect(hasPartnerPermission(readOnly, 'partners_create_organizations')).toBe(false);
    expect(hasPartnerPermission(readOnly, 'partners_view_revenue')).toBe(false);

    const unrelated = { role: 'staff' as const, permissions: ['manage_doctors'] };
    expect(canAccessSection(unrelated, 'partners')).toBe(false);
    expect(hasPartnerPermission(unrelated, 'partners_view')).toBe(false);
  });

  it('registers all partner permissions inside DASHBOARD_PERMISSIONS & SECTION_PERMISSIONS', () => {
    const dashboardIds = new Set(DASHBOARD_PERMISSIONS.map((p) => p.id));
    const partnerSectionPerms = new Set(SECTION_PERMISSIONS.partners);
    for (const p of PARTNER_PERMISSIONS) {
      expect(dashboardIds.has(p.id)).toBe(true);
      expect(partnerSectionPerms.has(p.id)).toBe(true);
    }
  });
});

describe('Partners of Success — Normalization & Duplicate Detection', () => {
  it('normalizes Arabic hamza/taa-marbouta and Egyptian phone variants', () => {
    expect(normalizePartnerName('أكاديمية   الإيمان الطبية')).toBe(
      normalizePartnerName('اكاديميه الايمان الطبيه'),
    );
    expect(normalizePhoneKey('+20 101-234-5678')).toBe('01012345678');
    expect(normalizePhoneKey('00201012345678')).toBe('01012345678');
    expect(normalizePhoneKey('01012345678')).toBe('01012345678');
  });

  it('detects duplicate organizations by normalized name or phone while excluding self on edit', () => {
    const orgs = [makeOrg({ id: 1, name: 'شركة النيل للتأمين', phone: '01099887766', managerPhone: '01012345678' })];

    expect(findDuplicatePartner(orgs, 'شركه النيل للتامين')?.id).toBe(1);
    expect(findDuplicatePartner(orgs, 'جهة جديدة', '+201012345678')?.id).toBe(1);
    expect(findDuplicatePartner(orgs, 'شركة النيل للتأمين', '01099887766', 1)).toBeNull();
    expect(findDuplicatePartner(orgs, 'نقابة المهندسين', '01200001111')).toBeNull();
  });
});

describe('Partners of Success — Contract Effective Status & Deduplicated Renewal Alerts', () => {
  it('computes effective status automatically from endDate while honoring manual lifecycle states', () => {
    expect(computeContractEffectiveStatus({ status: 'نشط', endDate: '2026-06-15' }, 30, '2026-05-01').effectiveStatus).toBe('نشط');
    expect(computeContractEffectiveStatus({ status: 'نشط', endDate: '2026-05-20' }, 30, '2026-05-01').effectiveStatus).toBe('قريب الانتهاء');
    expect(computeContractEffectiveStatus({ status: 'نشط', endDate: '2026-04-30' }, 30, '2026-05-01').effectiveStatus).toBe('منتهي');
    expect(computeContractEffectiveStatus({ status: 'مجدد', endDate: '2026-04-30' }, 30, '2026-05-01').effectiveStatus).toBe('مجدد');
    expect(computeContractEffectiveStatus({ status: 'ملغي', endDate: '2026-05-10' }, 30, '2026-05-01').effectiveStatus).toBe('ملغي');
  });

  it('emits matching threshold alerts once and skips historical/cancelled/already-logged contracts', () => {
    const settings: PartnerAlertSettings = {
      id: 1,
      alertDays: [90, 60, 30, 15, 7, 0],
      notifyOverdue: true,
      autoMarkExpiringDays: 30,
    };
    const orgs = [makeOrg({ id: 1, name: 'نقابة الأطباء' })];
    const contracts: PartnerContract[] = [
      makeContract({ id: 'c-7d', companyId: 1, endDate: '2026-05-08', status: 'نشط', isCurrentVersion: true }),
      makeContract({ id: 'c-overdue', companyId: 1, endDate: '2026-04-28', status: 'نشط', isCurrentVersion: true }),
      makeContract({ id: 'c-old', companyId: 1, endDate: '2026-05-05', status: 'مجدد', isCurrentVersion: false }),
      makeContract({ id: 'c-cancelled', companyId: 1, endDate: '2026-05-05', status: 'ملغي', isCurrentVersion: true }),
    ];

    const firstPass = evaluateContractAlerts(contracts, orgs, settings, [], '2026-05-01');
    expect(firstPass.map((a) => `${a.contractId}:${a.thresholdDays}`)).toEqual(['c-7d:7', 'c-overdue:-1']);

    // Once logged for today & threshold, re-evaluating must produce zero duplicates
    const secondPass = evaluateContractAlerts(
      contracts,
      orgs,
      settings,
      firstPass.map((a) => ({ contractId: a.contractId, thresholdDays: a.thresholdDays, alertDate: a.alertDate })),
      '2026-05-01',
    );
    expect(secondPass).toEqual([]);
  });
});

describe('Partners of Success — Referred Patients & Financial Revenue Analytics', () => {
  const doctors = [{ id: 'doc-1', name: 'د. محمود رجب', fee: 300 }];
  const services = [
    { title: 'كشف عام', price: 100 },
    { title: 'متابعة كشف', price: 0 },
  ];

  const bookings = [
    {
      id: 'b-1',
      patientName: 'محمد حسن',
      phone: '01011112222',
      doctorId: 'doc-1',
      doctorName: 'د. محمود رجب',
      service: 'كشف عام',
      date: '2026-05-02',
      status: 'confirmed',
      contractingCompanyId: 1,
      paymentStatus: 'paid',
    },
    {
      // Same patient returning with +20 format -> deduplicated in uniquePatients
      id: 'b-2',
      patientName: 'محمد حسن',
      phone: '+201011112222',
      doctorId: 'doc-1',
      doctorName: 'د. محمود رجب',
      service: 'متابعة كشف',
      date: '2026-05-10',
      status: 'confirmed',
      contractingCompanyId: 1,
      paymentStatus: 'pending',
    },
    {
      id: 'b-3',
      patientName: 'منى سمير',
      phone: '01122223333',
      doctorId: 'doc-1',
      doctorName: 'د. محمود رجب',
      service: 'كشف عام',
      date: '2026-04-15',
      status: 'cancelled',
      contractingCompanyId: 1,
      paymentStatus: 'paid',
    },
    {
      // Private (no contractingCompanyId) -> must NOT count toward partner metrics
      id: 'b-private',
      patientName: 'خالد عادل',
      phone: '01233334444',
      doctorId: 'doc-1',
      doctorName: 'د. محمود رجب',
      service: 'كشف عام',
      date: '2026-05-03',
      status: 'confirmed',
      contractingCompanyId: null,
      paymentStatus: 'paid',
    },
  ];

  const operations = [
    {
      id: 'op-1',
      patientName: 'محمد حسن',
      patientPhone: '01011112222',
      doctorName: 'د. محمود رجب',
      surgeryType: 'مياه بيضاء',
      date: '2026-05-18',
      cost: 12000,
      status: 'confirmed',
      contractingCompanyId: 1,
    },
    {
      id: 'op-2',
      patientName: 'طارق نبيل',
      patientPhone: '01544445555',
      doctorName: 'د. محمود رجب',
      surgeryType: 'ليزك',
      date: '2026-05-20',
      cost: 8000,
      status: 'pending',
      contractingCompanyId: 1,
    },
  ];

  const payments = [
    // Linked payment for b-1 (400 EGP) -> must NOT double count booking fee + payment
    { id: 'pay-1', bookingId: 'b-1', amount: 400, status: 'paid' },
    // Refunded/cancelled booking b-3 payment (400 EGP)
    { id: 'pay-3', bookingId: 'b-3', amount: 400, status: 'paid' },
  ];

  it('deduplicates unique referred patients and calculates surgery conversion rate accurately', () => {
    const summary = computePartnerReferrals(1, bookings, operations, {}, '2026-05-25');
    // Unique partner patients: محمد حسن (b-1, b-2, op-1), منى سمير (b-3), طارق نبيل (op-2) = 3
    expect(summary.uniquePatients).toBe(3);
    expect(summary.totalBookings).toBe(3);
    expect(summary.confirmedBookings).toBe(2);
    expect(summary.cancelledBookings).toBe(1);
    expect(summary.totalSurgeries).toBe(2);
    expect(summary.uniqueSurgeryPatients).toBe(2);
    expect(summary.conversionRate).toBe(67);
    // Current month (2026-05, excluding cancelled): محمد حسن + طارق نبيل = 2
    expect(summary.currentMonthPatients).toBe(2);
    expect(summary.previousMonthPatients).toBe(0);
  });

  it('computes billed, collected, outstanding, and cancelled revenue without double counting', () => {
    const rev = computePartnerRevenue(1, bookings, operations, payments, doctors, services);
    // b-1: paid 400 (estimated 400), b-2: followup -> 0, b-3: cancelled & paid 400 -> refundedOrCancelledAmount
    // op-1: confirmed 12000, op-2: pending 8000
    expect(rev.examRevenue).toBe(400);
    expect(rev.surgeryRevenue).toBe(12000);
    expect(rev.collectedAmount).toBe(12400);
    expect(rev.outstandingAmount).toBe(8000);
    expect(rev.totalBilled).toBe(20400);
    expect(rev.refundedOrCancelledAmount).toBe(400);
    expect(rev.transactionCount).toBe(3);
  });

  it('aggregates unified dashboard KPIs and top-organization charts', () => {
    const orgs = [makeOrg({ id: 1, name: 'شركة النيل للتأمين' })];
    const contracts = [makeContract({ id: 'c-1', companyId: 1, endDate: '2026-05-15', status: 'نشط' })];
    const activities: PartnerActivity[] = [
      {
        id: 'act-1',
        companyId: 1,
        contactId: null,
        contactName: 'أحمد علي',
        activityType: 'visit',
        activityDate: '2026-05-05',
        activityTime: '12:00',
        staffUserId: 's1',
        staffName: 'سارة',
        goal: 'تجديد التعاقد',
        summary: 'تم عرض الباقة السنوية',
        outcomes: 'موافقة مبدئية',
        agreements: '',
        nextSteps: 'إرسال المسودة',
        nextFollowupDate: '2026-05-10',
        followupStatus: 'scheduled',
        attachments: [],
        createdAt: '2026-05-05',
        updatedAt: '2026-05-05',
      },
    ];
    const followups: PartnerFollowup[] = [
      {
        id: 'f-1',
        companyId: 1,
        contactId: null,
        contractId: 'c-1',
        activityId: 'act-1',
        title: 'إرسال مسودة العقد',
        assigneeUserId: 's1',
        assigneeName: 'سارة',
        createdDate: '2026-05-05',
        dueDate: '2026-05-10',
        followupType: 'إرسال عرض',
        priority: 'high',
        description: '',
        status: 'جديدة',
        outcome: '',
        closedAt: null,
        createdAt: '2026-05-05',
        updatedAt: '2026-05-05',
      },
    ];

    const summary = computePartnersDashboardSummary({
      organizations: orgs,
      contracts,
      activities,
      followups,
      bookings,
      operations,
      payments,
      doctors,
      services,
      todayIso: '2026-05-25',
    });

    expect(summary.kpis.totalOrganizations).toBe(1);
    expect(summary.kpis.activeOrganizations).toBe(1);
    expect(summary.kpis.expiredContracts).toBe(1);
    expect(summary.kpis.activitiesThisMonth).toBe(1);
    expect(summary.kpis.overdueFollowups).toBe(1);
    expect(summary.kpis.totalPartnerRevenue).toBe(12400);
    expect(summary.topByPatients[0]?.name).toBe('شركة النيل للتأمين');
  });
});

describe('Partners of Success — CSV Formula-Injection Protection', () => {
  it('neutralizes spreadsheet formula prefixes and prepends UTF-8 BOM for Arabic Excel support', () => {
    expect(sanitizeCsvCell('=CMD("calc")')).toBe('"\'=CMD(""calc"")"');
    expect(sanitizeCsvCell('+1234')).toBe('"\'+1234"');
    expect(sanitizeCsvCell('@SUM(A1:A2)')).toBe('"\'@SUM(A1:A2)"');
    const csv = buildCsvContent(['الجهة', 'ملاحظة'], [['شركة النيل', '=1+1']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=1+1"');
  });
});

describe('Partners of Success — Pre-Migration Fallback Persistence', () => {
  it('detects PGRST205/PGRST204 missing schema errors accurately', async () => {
    const { isMissingPartnersSchemaError } = await import('@/barada/partnersService');
    expect(isMissingPartnersSchemaError({ code: 'PGRST205', message: "Could not find the table 'public.partner_alert_settings' in the schema cache" })).toBe(true);
    expect(isMissingPartnersSchemaError({ code: 'PGRST204', message: "Could not find the 'org_type' column of 'contracting_companies' in the schema cache" })).toBe(true);
    expect(isMissingPartnersSchemaError({ code: '42501', message: 'permission denied' })).toBe(false);
  });

  it('persists partner_alert_settings and extended records locally when 0021 tables are missing in Supabase', async () => {
    const missingTableError = {
      code: 'PGRST205',
      message: "Could not find the table 'public.partner_alert_settings' in the schema cache",
    };

    const makeErrorChain = (err: { code: string; message: string }) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        upsert: () => chain,
        delete: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => chain,
        maybeSingle: () => chain,
        then: (resolve: (val: { data: unknown; error: unknown }) => unknown) =>
          Promise.resolve(resolve({ data: null, error: err })),
      };
      return chain;
    };

    vi.resetModules();
    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        from: (table: string) => {
          if (table === 'contracting_companies') {
            const okChain: Record<string, unknown> = {
              select: () => okChain,
              order: () => okChain,
              then: (resolve: (val: { data: unknown; error: unknown }) => unknown) =>
                Promise.resolve(resolve({ data: [{ id: 1, name: 'شركة النيل', documents: [] }], error: null })),
            };
            return okChain;
          }
          return makeErrorChain(missingTableError);
        },
        auth: {
          getUser: async () => ({ data: { user: null }, error: null }),
        },
      },
    }));

    const { clearPartnersFallback, readPartnersFallback } = await import('@/barada/partnersFallback');
    clearPartnersFallback();

    try {
      const {
        loadPartnersBundle,
        savePartnerAlertSettings,
        savePartnerContact,
        savePartnerContract,
        savePartnerFollowup,
      } = await import('@/barada/partnersService');

      const savedSettings = await savePartnerAlertSettings(
        { id: 1, alertDays: [45, 15, 3], notifyOverdue: false, autoMarkExpiringDays: 20 },
        'admin-1',
      );
      expect(savedSettings.error).toBeNull();
      expect(savedSettings.saved?.alertDays).toEqual([45, 15, 3]);
      expect(savedSettings.saved?.notifyOverdue).toBe(false);
      expect(savedSettings.saved?.autoMarkExpiringDays).toBe(20);

      const contactRes = await savePartnerContact({
        editingId: null,
        companyId: 1,
        orgName: 'شركة النيل',
        name: 'أ. كريم طارق',
        jobTitle: 'مدير تعاقدات',
        phone: '01012345678',
        email: '',
        department: '',
        importanceLevel: 'high',
        communicationStatus: 'active',
        isPrimary: true,
        notes: '',
        actorName: 'المدير',
      });
      expect(contactRes.error).toBeNull();

      const contractRes = await savePartnerContract({
        editingId: null,
        companyId: 1,
        orgName: 'شركة النيل',
        contractNumber: 'CON-99',
        contractType: 'سنوي',
        signedDate: '2026-01-01',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        durationMonths: 12,
        status: 'نشط',
        terms: '',
        discountTerms: '15%',
        responsibleStaffId: '',
        responsibleStaffName: 'المدير',
        nextRenewalDate: '2026-12-01',
        notes: '',
        attachmentPath: '',
        attachmentName: '',
        actorName: 'المدير',
      });
      expect(contractRes.error).toBeNull();

      const followupRes = await savePartnerFollowup({
        editingId: null,
        companyId: 1,
        title: 'مراجعة العقد',
        assigneeUserId: '',
        assigneeName: 'المدير',
        dueDate: '2026-06-01',
        followupType: 'متابعة عامة',
        priority: 'high',
        description: '',
        status: 'جديدة',
        outcome: '',
        actorName: 'المدير',
      });
      expect(followupRes.error).toBeNull();

      const bundle = await loadPartnersBundle();
      expect(bundle.alertSettings.alertDays).toEqual([45, 15, 3]);
      expect(bundle.alertSettings.notifyOverdue).toBe(false);
      expect(bundle.contacts).toHaveLength(1);
      expect(bundle.contacts[0]?.name).toBe('أ. كريم طارق');
      expect(bundle.contracts).toHaveLength(1);
      expect(bundle.contracts[0]?.contractNumber).toBe('CON-99');
      expect(bundle.followups).toHaveLength(1);
      expect(readPartnersFallback().alertSettings?.alertDays).toEqual([45, 15, 3]);
    } finally {
      clearPartnersFallback();
      vi.doUnmock('@/integrations/supabase/client');
      vi.resetModules();
    }
  });
});

