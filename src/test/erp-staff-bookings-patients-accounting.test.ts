import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCOUNTING_PERMISSIONS,
  canAccessSection,
  hasAccountingPermission,
  hasPatientPermission,
  hasStaffBookingPermission,
  PATIENT_PERMISSIONS,
  STAFF_BOOKING_PERMISSIONS,
} from '@/barada/permissions';
import {
  computeBookingExpectedFee,
  generateClinicTimeSlots,
  normalizePhone,
  validateBookingRules,
  type ValidationDoctor,
} from '@/barada/bookingValidation';
import {
  savePatientRecord,
  searchPatientsInMemory,
  type PatientRecord,
} from '@/barada/patientsService';
import {
  buildAccountingReportData,
  buildBookingFinancialRows,
  computeAccountBalance,
  computeAccountingDashboardMetrics,
  createAccountingAccount,
  createAccountTransfer,
  createVoucherRecord,
  loadAccountingBundle,
  payExistingExpense,
  recordAccountingExpense,
  recordAccountingRevenue,
  reverseAccountingExpense,
  reverseAccountingRevenue,
  updateAccountOpeningBalance,
} from '@/barada/accountingService';
import { ACCOUNTING_REPORT_DEFS } from '@/barada/accountingTypes';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/lib/backend', () => ({
  invokeBackend: vi.fn(async () => ({ data: { ok: true }, error: null })),
}));

const staffWith = (permissions: string[]) => ({ role: 'staff' as const, permissions });
const adminUser = { role: 'admin' as const, permissions: [] };

const sampleDoctor: ValidationDoctor = {
  id: 101,
  name: 'د. أحمد برادة',
  fee: 400,
  maxPatients: 2,
  patientsPerHour: 1,
  availableDates: ['2030-05-06'], // Monday
  followUpExamCount: 2,
  followUpSurgeryCount: 3,
};

const clinicHours = {
  weekdays: '9:00 صباحاً - 9:00 مساءً',
  friday: 'مغلق',
};

describe('1. Granular Permissions (Patients, Staff Bookings, Accounting)', () => {
  it('legacy manage_bookings gives view/edit/cancel only — never delete, override, staff_create, or accounting', () => {
    const legacy = staffWith(['manage_bookings']);
    expect(canAccessSection(legacy, 'bookings')).toBe(true);
    expect(hasStaffBookingPermission(legacy, 'staff_bookings_view')).toBe(true);
    expect(hasStaffBookingPermission(legacy, 'staff_bookings_edit')).toBe(true);
    expect(hasStaffBookingPermission(legacy, 'staff_bookings_cancel')).toBe(true);
    expect(hasStaffBookingPermission(legacy, 'staff_bookings_create')).toBe(false);
    expect(hasStaffBookingPermission(legacy, 'staff_bookings_delete')).toBe(false);
    expect(hasStaffBookingPermission(legacy, 'staff_bookings_override_rules')).toBe(false);
    expect(hasPatientPermission(legacy, 'patients_view')).toBe(true);
    expect(hasPatientPermission(legacy, 'patients_create')).toBe(false);
    expect(canAccessSection(legacy, 'accounting')).toBe(false);
  });

  it('accounting_manage grants operational accounting rights but excludes sensitive/opening balance/settings', () => {
    const mgr = staffWith(['accounting_manage']);
    expect(canAccessSection(mgr, 'accounting')).toBe(true);
    expect(hasAccountingPermission(mgr, 'accounting_revenue_create')).toBe(true);
    expect(hasAccountingPermission(mgr, 'accounting_expenses_pay')).toBe(true);
    expect(hasAccountingPermission(mgr, 'accounting_transfers_create')).toBe(true);
    expect(hasAccountingPermission(mgr, 'accounting_manage_opening_balances')).toBe(false);
    expect(hasAccountingPermission(mgr, 'accounting_manage_settings')).toBe(false);
    expect(hasAccountingPermission(mgr, 'accounting_view_sensitive_data')).toBe(false);

    expect(hasAccountingPermission(adminUser, 'accounting_manage_opening_balances')).toBe(true);
    expect(hasAccountingPermission(adminUser, 'accounting_view_sensitive_data')).toBe(true);
  });

  it('exposes complete permission lists for all three new groups', () => {
    expect(PATIENT_PERMISSIONS.length).toBe(5);
    expect(STAFF_BOOKING_PERMISSIONS.length).toBe(9);
    expect(ACCOUNTING_PERMISSIONS.length).toBe(24);
  });
});

describe('2. Shared Staff Booking Validation & Overrides', () => {
  const slots = generateClinicTimeSlots();

  it('validates booking against the exact doctor schedule, hours, and daily/hourly capacity', () => {
    const baseInput = {
      patientName: 'محمد حسن علي إبراهيم',
      phone: '01012345678',
      age: 35,
      governorate: 'الأقصر',
      center: 'الأقصر',
      doctor: sampleDoctor,
      service: 'كشف عيون شامل',
      date: '2030-05-06',
      time: '10:00 ص',
      bookingType: 'cash' as const,
      bookings: [],
      workingHours: clinicHours,
      todayStr: '2030-05-01',
    };

    expect(slots.length).toBeGreaterThan(20);
    expect(validateBookingRules(baseInput).ok).toBe(true);

    // Non-overridable validation (invalid phone & less than 4 name parts)
    const badPhone = validateBookingRules({ ...baseInput, phone: '12345' });
    expect(badPhone.ok).toBe(false);
    expect(badPhone.overridable).toBe(false);

    const shortName = validateBookingRules({ ...baseInput, patientName: 'محمد حسن علي' });
    expect(shortName.ok).toBe(false);
    expect(shortName.overridable).toBe(false);
    expect(shortName.code).toBe('QUAD_NAME_REQUIRED');

    // Overridable outside working hours rule (9:00 PM is outside 9 AM - 9 PM end exclusive)
    const outsideHours = validateBookingRules({ ...baseInput, time: '09:00 م' });
    expect(outsideHours.ok).toBe(false);
    expect(outsideHours.overridable).toBe(true);
    expect(outsideHours.code).toBe('OUTSIDE_WORKING_HOURS');

    // Overridable capacity rule (hourly full = 1 per hour)
    const hourFull = validateBookingRules({
      ...baseInput,
      bookings: [
        {
          id: 1,
          patientName: 'سابق محمد علي حسن',
          phone: '01099999999',
          doctorId: sampleDoctor.id,
          service: 'كشف عيون شامل',
          date: '2030-05-06',
          time: '10:15 ص',
          status: 'confirmed',
        },
      ],
    });
    expect(hourFull.ok).toBe(false);
    expect(hourFull.overridable).toBe(true);
    expect(hourFull.code).toBe('DOCTOR_HOUR_FULL');

    // Daily capacity full (2 per day)
    const dayFull = validateBookingRules({
      ...baseInput,
      bookings: [
        { id: 1, patientName: 'أ', phone: '01011111111', doctorId: 101, service: 'كشف', date: '2030-05-06', time: '09:00 ص', status: 'confirmed' },
        { id: 2, patientName: 'ب', phone: '01022222222', doctorId: 101, service: 'كشف', date: '2030-05-06', time: '11:00 ص', status: 'confirmed' },
      ],
    });
    expect(dayFull.ok).toBe(false);
    expect(dayFull.overridable).toBe(true);
    expect(dayFull.code).toBe('DOCTOR_DAY_FULL');
  });

  it('computes expected fee adding service price + doctor fee (with 0 doctor fee on follow-up)', () => {
    expect(computeBookingExpectedFee('كشف عيون شامل', { fee: 400 }, [{ title: 'كشف عيون شامل', price: 350 }])).toBe(750);
    expect(computeBookingExpectedFee('متابعة كشف', { fee: 400 }, [{ title: 'متابعة كشف', price: 100 }])).toBe(100);
    expect(computeBookingExpectedFee('خدمة غير مسعرة', { fee: 400 }, [])).toBe(400);
  });
});

describe('3. Patient Registration & Duplicate Prevention', () => {
  beforeEach(async () => {
    await supabase.auth.signInWithPassword({
      email: 'admin@barada-clinic.local',
      password: 'admin',
    });
  });

  it('normalizes phone numerals and detects duplicate phone registrations', async () => {
    expect(normalizePhone('٠١٠٩٨٧٦٥٤٣٢')).toBe('01098765432');

    const created = await savePatientRecord(
      {
        fullName: 'فاطمة محمود عبد الله حسن',
        phone: '01055566677',
        age: 42,
        governorate: 'الأقصر',
        address: 'شارع التلفزيون',
      },
      { userId: 'u-1', name: 'أحمد الموظف' },
    );
    expect(created.fileNumber).toMatch(/^PAT-/);

    await expect(
      savePatientRecord(
        {
          fullName: 'اسم مكرر ثالث رابع',
          phone: '٠١٠٥٥٥٦٦٦٧٧',
        },
        { userId: 'u-1', name: 'أحمد الموظف' },
      ),
    ).rejects.toThrow();

    const matches = searchPatientsInMemory([created] as PatientRecord[], '01055566677');
    expect(matches).toHaveLength(1);
    expect(matches[0].fullName).toBe('فاطمة محمود عبد الله حسن');
  });
});

describe('4. Independent Accounting Engine, Ledger Math, Anti-Duplication & 14 Reports', () => {
  const actor = { userId: 'admin-1', name: 'المدير المالي' };

  beforeEach(async () => {
    await supabase.auth.signInWithPassword({
      email: 'admin@barada-clinic.local',
      password: 'admin',
    });
  });

  it('tracks opening balances, revenues, partial expenses, transfers (excluded from P&L), vouchers, reversals, and all 14 reports accurately', async () => {
    const initial = await loadAccountingBundle();
    // Zero fake financial numbers before user creates real accounts/entries
    expect(initial.revenues.length).toBe(0);

    const cashbox = await createAccountingAccount(
      {
        accountType: 'cashbox',
        name: 'خزينة الاستقبال الرئيسية',
        openingBalance: 1000,
        openingBalanceDate: '2030-05-01',
      },
      actor,
    );
    const bank = await createAccountingAccount(
      {
        accountType: 'bank',
        name: 'حساب البنك الأهلي',
        bankName: 'البنك الأهلي المصري',
        openingBalance: 5000,
        openingBalanceDate: '2030-05-01',
      },
      actor,
    );

    await updateAccountOpeningBalance(cashbox, 1200, 'جرد بداية المدة الفعلي', actor);

    // Record revenue + auto receipt voucher (must NOT double credit cashbox)
    const rev = await recordAccountingRevenue(
      {
        revenueDate: '2030-05-02',
        categoryName: 'الكشوفات',
        revenueSource: 'booking',
        description: 'تحصيل كشف مريض',
        amount: 400,
        paymentMethod: 'cash',
        accountId: cashbox.id,
        doctorName: 'د. أحمد برادة',
        serviceName: 'كشف عيون شامل',
        bookingSource: 'staff',
        bookingId: 'booking-uuid-1',
        sourceTable: 'bookings',
        sourceId: 'booking-uuid-1',
      },
      actor,
      { issueReceiptVoucher: true },
    );

    // Anti-duplication enforcement for same external source
    await expect(
      recordAccountingRevenue(
        {
          revenueDate: '2030-05-02',
          categoryName: 'الكشوفات',
          revenueSource: 'booking',
          description: 'محاولة ترحيل مكررة',
          amount: 400,
          paymentMethod: 'cash',
          accountId: cashbox.id,
          sourceTable: 'bookings',
          sourceId: 'booking-uuid-1',
        },
        actor,
      ),
    ).rejects.toThrow();

    // Partial expense 600 total, 250 paid now => remaining 350
    const exp = await recordAccountingExpense(
      {
        expenseDate: '2030-05-02',
        categoryName: 'مستلزمات طبية',
        description: 'شراء قطرات ومستلزمات',
        totalAmount: 600,
        paidNowAmount: 250,
        paymentMethod: 'cash',
        accountId: cashbox.id,
        beneficiary: 'شركة النور الطبية',
      },
      actor,
    );
    expect(exp.remainingAmount).toBe(350);
    expect(exp.paymentStatus).toBe('partial');

    // Pay remaining 350 from bank
    await payExistingExpense(
      exp,
      {
        amount: 350,
        paymentDate: '2030-05-03',
        paymentMethod: 'bank_transfer',
        accountId: bank.id,
        issueDisbursementVoucher: true,
      },
      actor,
    );

    // Inter-account transfer 300 from cashbox to bank (must NOT enter revenues/expenses)
    await createAccountTransfer(
      {
        transferDate: '2030-05-03',
        fromAccountId: cashbox.id,
        toAccountId: bank.id,
        amount: 300,
        notes: 'توريد للبنك',
      },
      actor,
    );

    // Standalone receipt voucher affecting cashbox (+150)
    await createVoucherRecord(
      {
        voucherKind: 'receipt',
        voucherDate: '2030-05-04',
        partyName: 'تحصيل عهدة',
        amount: 150,
        reason: 'رد عهدة موظف',
        paymentMethod: 'cash',
        accountId: cashbox.id,
        affectsAccount: true,
      },
      actor,
    );

    const afterBundle = await loadAccountingBundle();
    const cashAcc = afterBundle.accounts.find((a) => a.id === cashbox.id)!;
    const bankAcc = afterBundle.accounts.find((a) => a.id === bank.id)!;

    // Cashbox = 1200 (opening) + 400 (rev) - 250 (exp part 1) - 300 (transfer out) + 150 (standalone voucher) = 1200
    expect(computeAccountBalance(cashAcc, afterBundle.transactions)).toBe(1200);
    // Bank = 5000 (opening) - 350 (exp part 2) + 300 (transfer in) = 4950
    expect(computeAccountBalance(bankAcc, afterBundle.transactions)).toBe(4950);

    // Creating an unpaid booking does NOT create collected revenue automatically
    const bookingFinancials = buildBookingFinancialRows({
      rawBookings: [
        {
          id: 'booking-uuid-1',
          patient_name: 'مريض مسدد',
          phone: '01011111111',
          doctor_name: 'د. أحمد برادة',
          service: 'كشف عيون شامل',
          date: '2030-05-02',
          time: '10:00 ص',
          status: 'confirmed',
          booking_type: 'cash',
          booking_source: 'staff',
          payment_status: 'paid',
          payment_method: 'cash',
        },
        {
          id: 'booking-uuid-2',
          patient_name: 'مريض غير مسدد',
          phone: '01022222222',
          doctor_name: 'د. أحمد برادة',
          service: 'كشف عيون شامل',
          date: '2030-05-02',
          time: '11:00 ص',
          status: 'confirmed',
          booking_type: 'cash',
          booking_source: 'website',
          payment_status: 'pending',
          payment_method: 'cash',
        },
      ],
      doctors: [{ name: 'د. أحمد برادة', fee: 400 }],
      services: [{ title: 'كشف عيون شامل', price: 0 }],
      revenues: afterBundle.revenues,
      externalPayments: [],
    });

    expect(bookingFinancials[0].recognizedRevenueAmount).toBe(400);
    expect(bookingFinancials[1].recognizedRevenueAmount).toBe(0);
    expect(bookingFinancials[1].remainingAmount).toBe(400);

    const metrics = computeAccountingDashboardMetrics({
      bundle: afterBundle,
      bookingFinancials,
      startDate: '2030-05-01',
      endDate: '2030-05-31',
      todayStr: '2030-05-02',
    });
    // Transfer of 300 must NOT inflate revenue (400) or expenses (600)
    expect(metrics.periodRevenueTotal).toBe(400);
    expect(metrics.periodExpenseTotal).toBe(600);
    expect(metrics.netOperatingProfit).toBe(-200);
    expect(metrics.uncollectedBookingReceivables).toBe(400);

    // Every single one of the 14 reports builds cleanly
    for (const def of ACCOUNTING_REPORT_DEFS) {
      const report = buildAccountingReportData({
        reportId: def.id,
        bundle: afterBundle,
        bookingFinancials,
        contractingList: [{ id: 1, name: 'ميدنت' }],
        filters: { startDate: '2030-05-01', endDate: '2030-05-31' },
        canViewSensitive: true,
      });
      expect(report.title).toBeTruthy();
      expect(report.headers.length).toBeGreaterThan(0);
    }

    // Sensitive report blocked without sensitive permission
    const restrictedNetProfit = buildAccountingReportData({
      reportId: 'net_profit',
      bundle: afterBundle,
      bookingFinancials,
      contractingList: [],
      filters: { startDate: '2030-05-01', endDate: '2030-05-31' },
      canViewSensitive: false,
    });
    expect(restrictedNetProfit.restricted).toBe(true);

    // Controlled reversal restores balances without silent deletion
    await reverseAccountingRevenue(rev, 'إلغاء حجز المريض', actor);
    await reverseAccountingExpense(
      afterBundle.expenses.find((e) => e.id === exp.id)!,
      afterBundle.expensePayments,
      'مرتجع للمورد',
      actor,
    );

    const reversedBundle = await loadAccountingBundle();
    const cashAfterRev = reversedBundle.accounts.find((a) => a.id === cashbox.id)!;
    const bankAfterRev = reversedBundle.accounts.find((a) => a.id === bank.id)!;
    // Cashbox reverts rev (-400) & exp part 1 (+250) => 1200 - 400 + 250 = 1050
    expect(computeAccountBalance(cashAfterRev, reversedBundle.transactions)).toBe(1050);
    // Bank reverts exp part 2 (+350) => 4950 + 350 = 5300
    expect(computeAccountBalance(bankAfterRev, reversedBundle.transactions)).toBe(5300);
    expect(reversedBundle.auditLogs.length).toBeGreaterThan(0);
  });

  it('enforces opening balance and staff booking creation/override permissions at runtime', async () => {
    const createdStaff = await supabase.auth.admin.createUser({
      email: 'acct-mgr@barada-clinic.local',
      password: 'Password123!',
      user_metadata: { name: 'محاسب تشغيلي', username: 'acct_mgr', login_username: 'acct_mgr', role: 'staff' },
    });
    const staffUid = createdStaff.data.user!.id;
    await supabase
      .from('profiles')
      .update({ permissions: ['accounting_manage', 'staff_bookings_view'] })
      .eq('user_id', staffUid);

    await supabase.auth.signInWithPassword({
      email: 'acct-mgr@barada-clinic.local',
      password: 'Password123!',
    });

    // Cannot update opening balance without accounting_manage_opening_balances
    const accRes = await (supabase as unknown as { from: (t: string) => any })
      .from('accounting_accounts')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (accRes.data) {
      const targetId = String((accRes.data as { id: string }).id);
      const updRes = await (supabase as unknown as { from: (t: string) => any })
        .from('accounting_accounts')
        .update({ opening_balance: 9999 })
        .eq('id', targetId);
      expect(updRes.error).not.toBeNull();
    }

    // Cannot insert staff booking without staff_bookings_create
    const insBookingRes = await (supabase as unknown as { from: (t: string) => any }).from('bookings').insert({
      patient_name: 'اختبار صلاحية موظف غير مخول',
      phone: '01077778888',
      age: 30,
      governorate: 'الأقصر',
      center: 'الأقصر',
      doctor_id: '101',
      doctor_name: 'د. أحمد برادة',
      service: 'كشف عيون شامل',
      date: '2030-05-06',
      time: '09:00 ص',
      status: 'confirmed',
      booking_type: 'cash',
      booking_source: 'staff',
    });
    expect(insBookingRes.error).not.toBeNull();
  });
});
