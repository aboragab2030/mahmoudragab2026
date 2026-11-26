import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  PATIENT_BILLING_PAYMENT_PERMISSIONS,
  canAccessSection,
  hasPatientBillingPermission,
} from '@/barada/permissions';
import { savePatientRecord } from '@/barada/patientsService';
import { createAccountingAccount, loadAccountingBundle } from '@/barada/accountingService';
import {
  applyPatientBillingDiscount,
  computePatientBillingDashboardMetrics,
  computePatientProfileSummary,
  confirmUnifiedBookingPayment,
  loadPatientBillingRecords,
  loadPatientBillingTransactions,
  refundOrReverseBookingPayment,
  syncBookingsToPatientBilling,
} from '@/barada/patientBillingService';

vi.mock('@/lib/backend', () => ({
  invokeBackend: vi.fn(async () => ({ data: { ok: true }, error: null })),
}));

const staffWith = (permissions: string[]) => ({ role: 'staff' as const, permissions });

describe('Unified Patient Billing & Single Payment Source Workflow', () => {
  const actor = { userId: 'admin-unified', name: 'المدير المالي' };
  let cashboxId = '';

  beforeEach(async () => {
    await supabase.auth.signInWithPassword({
      email: 'admin@barada-clinic.local',
      password: 'admin',
    });

    const bundle = await loadAccountingBundle();
    const existingCashbox = bundle.accounts.find((a) => a.accountType === 'cashbox');
    if (existingCashbox) {
      cashboxId = existingCashbox.id;
    } else {
      const created = await createAccountingAccount(
        {
          accountType: 'cashbox',
          name: 'خزينة التحصيل الرئيسية',
          openingBalance: 0,
          openingBalanceDate: '2030-05-01',
        },
        actor,
      );
      cashboxId = created.id;
    }
  });

  it('0. Removes "تسجيل مريض جديد" button from PatientManagementModal & Staff/Bookings UI banner', () => {
    const modalSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/barada/PatientManagementModal.tsx'),
      'utf-8',
    );
    const indexSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/barada/index.tsx'),
      'utf-8',
    );
    expect(modalSource).not.toContain('تسجيل مريض جديد');
    expect(modalSource).not.toContain("mode === 'create'");
    expect(indexSource).not.toContain("setPatientModalMode('create')");
    expect(indexSource).not.toContain('onConfirmPayment={handleConfirmPayment}');
  });

  it('1. Website online booking automatically creates an unpaid record in patient_billing_records with source "website"', async () => {
    const bookingId = crypto.randomUUID();
    const phone = '01090001001';
    const { error } = await supabase.from('bookings').insert([
      {
        id: bookingId,
        cancellation_token: crypto.randomUUID(),
        patient_name: 'أحمد محمود إبراهيم علي',
        phone,
        doctor_name: 'د. أحمد برادة',
        service: 'كشف عيون شامل', // 350 + 400 = 750 in mockClient doctors/services
        date: '2030-05-06',
        time: '10:00 ص',
        booking_type: 'cash',
        booking_source: 'website',
        payment_method: 'cash',
        payment_status: 'paid', // Attempted bypass must be stripped by guard!
        status: 'confirmed',
      } as any,
    ]);
    expect(error).toBeNull();

    const records = await loadPatientBillingRecords();
    const rec = records.find((r) => r.bookingId === bookingId);
    expect(rec).toBeDefined();
    expect(rec?.bookingSource).toBe('website');
    expect(rec?.financialStatus).toBe('غير مدفوع');
    expect(rec?.originalPrice).toBe(750);
    expect(rec?.paidAmount).toBe(0);
    expect(rec?.remainingBalance).toBe(750);

    // Booking payment_status must remain 'pending'
    const { data: bk } = await supabase
      .from('bookings')
      .select('payment_status')
      .eq('id', bookingId)
      .single();
    expect((bk as any)?.payment_status).toBe('pending');
  });

  it('2. Staff-created booking creates unpaid record with source "staff" and cannot mark booking paid directly', async () => {
    const bookingId = crypto.randomUUID();
    const { error } = await supabase.from('bookings').insert([
      {
        id: bookingId,
        cancellation_token: crypto.randomUUID(),
        patient_name: 'منى سعيد عبد الله حسين',
        phone: '01090001002',
        doctor_name: 'د. سارة المنصور',
        service: 'عمليات الليزك وتصحيح الإبصار', // 400 + 350 = 750
        date: '2030-05-07',
        time: '11:00 ص',
        booking_type: 'cash',
        booking_source: 'staff',
        created_by_staff_name: 'موظف الاستقبال',
        payment_method: 'cash',
        payment_status: 'paid',
        status: 'confirmed',
      } as any,
    ]);
    expect(error).toBeNull();

    // Direct attempt to update booking.payment_status = 'paid' without verified payment must fail
    const { error: directPayErr } = await supabase
      .from('bookings')
      .update({ payment_status: 'paid' })
      .eq('id', bookingId);
    expect(directPayErr).not.toBeNull();

    const records = await loadPatientBillingRecords();
    const rec = records.find((r) => r.bookingId === bookingId);
    expect(rec).toBeDefined();
    expect(rec?.bookingSource).toBe('staff');
    expect(rec?.financialStatus).toBe('غير مدفوع');
    expect(rec?.createdByStaffName).toBe('موظف الاستقبال');
  });

  it('3. Patient registration alone creates ZERO financial billing obligations', async () => {
    const before = await loadPatientBillingRecords();
    const patient = await savePatientRecord(
      {
        fullName: 'سلمى حسام الدين فاروق',
        phone: '01090001003',
        age: 29,
      },
      actor,
    );
    expect(patient.id).toBeTruthy();

    const after = await loadPatientBillingRecords();
    expect(after.length).toBe(before.length);
    expect(after.some((r) => r.patientPhone === '01090001003')).toBe(false);
  });

  it('4. Confirming payment from Payments section updates billing, booking, and accounting ONCE without duplication', async () => {
    const bookingId = crypto.randomUUID();
    await supabase.from('bookings').insert([
      {
        id: bookingId,
        cancellation_token: crypto.randomUUID(),
        patient_name: 'خالد محمد يوسف حسن',
        phone: '01090001004',
        doctor_name: 'د. سارة المنصور',
        service: 'كشف عيون شامل', // 350 + 350 = 700
        date: '2030-05-08',
        time: '12:00 م',
        booking_type: 'cash',
        booking_source: 'website',
        payment_method: 'cash',
        status: 'confirmed',
      } as any,
    ]);

    const tx = await confirmUnifiedBookingPayment({
      bookingId,
      amount: 700,
      paymentMethod: 'cash',
      accountId: cashboxId,
      confirmedVia: 'payments_section',
      notes: 'تحصيل من قسم المدفوعات',
    });
    expect(tx.amount).toBe(700);
    expect(tx.confirmedVia).toBe('payments_section');

    const records = await loadPatientBillingRecords();
    const rec = records.find((r) => r.bookingId === bookingId);
    expect(rec?.financialStatus).toBe('مدفوع بالكامل');
    expect(rec?.paidAmount).toBe(700);
    expect(rec?.remainingBalance).toBe(0);

    const bundle = await loadAccountingBundle();
    const matchingRevenues = bundle.revenues.filter((r) => r.bookingId === bookingId && r.status === 'posted');
    expect(matchingRevenues).toHaveLength(1);
    expect(matchingRevenues[0].amount).toBe(700);

    const { data: payRows } = await supabase
      .from('payments')
      .select('*')
      .eq('booking_id', bookingId);
    expect(payRows).toHaveLength(1);
    expect((payRows as any[])[0].status).toBe('paid');
  });

  it('5. Confirming payment from Accounting section syncs cleanly back to Payments table & patient status', async () => {
    const bookingId = crypto.randomUUID();
    await supabase.from('bookings').insert([
      {
        id: bookingId,
        cancellation_token: crypto.randomUUID(),
        patient_name: 'ياسمين عادل عبد الرحمن',
        phone: '01090001005',
        doctor_name: 'د. أحمد برادة',
        service: 'كشف عيون شامل', // 750
        date: '2030-05-09',
        time: '01:00 م',
        booking_type: 'cash',
        booking_source: 'staff',
        payment_method: 'instapay',
        status: 'confirmed',
      } as any,
    ]);

    const tx = await confirmUnifiedBookingPayment({
      bookingId,
      amount: 750,
      paymentMethod: 'instapay',
      accountId: cashboxId,
      confirmedVia: 'accounting_section',
    });
    expect(tx.paymentId).toBeTruthy();
    expect(tx.revenueId).toBeTruthy();

    const { data: payRows } = await supabase
      .from('payments')
      .select('*')
      .eq('booking_id', bookingId);
    expect(payRows).toHaveLength(1);
    expect((payRows as any[])[0].amount).toBe(750);
    expect((payRows as any[])[0].payment_type).toBe('instapay');

    const { data: bk } = await supabase
      .from('bookings')
      .select('payment_status')
      .eq('id', bookingId)
      .single();
    expect((bk as any)?.payment_status).toBe('paid');
  });

  it('6. Partial payment + subsequent remaining balance collection + Patient Profile summary & discount accuracy', async () => {
    const patient = await savePatientRecord(
      { fullName: 'عمر طارق مصطفى كامل', phone: '01090001006', age: 40 },
      actor,
    );
    const bookingId = crypto.randomUUID();
    await supabase.from('bookings').insert([
      {
        id: bookingId,
        patient_id: patient.id,
        cancellation_token: crypto.randomUUID(),
        patient_name: patient.fullName,
        phone: patient.phone,
        doctor_name: 'د. أحمد برادة',
        service: 'كشف عيون شامل', // 750
        date: '2030-05-10',
        time: '02:00 م',
        booking_type: 'cash',
        booking_source: 'staff',
        payment_method: 'cash',
        status: 'confirmed',
      } as any,
    ]);

    // Apply approved 50 EGP discount => finalAmountDue = 700
    const discounted = await applyPatientBillingDiscount({
      bookingId,
      discount: 50,
      reason: 'خصم متابعة إدارية',
    });
    expect(discounted.finalAmountDue).toBe(700);
    expect(discounted.remainingBalance).toBe(700);

    // First partial installment: 250
    await confirmUnifiedBookingPayment({
      bookingId,
      amount: 250,
      paymentMethod: 'cash',
      accountId: cashboxId,
      confirmedVia: 'payments_section',
    });

    let records = await loadPatientBillingRecords();
    let rec = records.find((r) => r.bookingId === bookingId)!;
    expect(rec.financialStatus).toBe('مدفوع جزئيًا');
    expect(rec.paidAmount).toBe(250);
    expect(rec.remainingBalance).toBe(450);

    // Second remaining installment: 450
    await confirmUnifiedBookingPayment({
      bookingId,
      amount: 450,
      paymentMethod: 'card',
      accountId: cashboxId,
      confirmedVia: 'accounting_section',
    });

    records = await loadPatientBillingRecords();
    rec = records.find((r) => r.bookingId === bookingId)!;
    const txns = await loadPatientBillingTransactions({ bookingId });
    expect(rec.financialStatus).toBe('مدفوع بالكامل');
    expect(rec.paidAmount).toBe(700);
    expect(rec.remainingBalance).toBe(0);
    expect(txns.filter((t) => t.transactionKind === 'payment' && t.status === 'confirmed')).toHaveLength(2);

    const profileSummary = computePatientProfileSummary(records, txns, patient.id, patient.phone);
    expect(profileSummary.totalDue).toBe(700);
    expect(profileSummary.totalPaid).toBe(700);
    expect(profileSummary.totalRemaining).toBe(0);
    expect(profileSummary.fullyPaidCount).toBe(1);
    expect(profileSummary.historyRows).toHaveLength(2);
  });

  it('7. Cancellations & Refunds preserve financial history and set "ملغي", "مسترد جزئيًا", or "مسترد بالكامل"', async () => {
    const unpaidCancelId = crypto.randomUUID();
    await supabase.from('bookings').insert([
      {
        id: unpaidCancelId,
        cancellation_token: crypto.randomUUID(),
        patient_name: 'هند فتحي صابر',
        phone: '01090001007',
        doctor_name: 'د. سارة المنصور',
        service: 'كشف عيون شامل', // 700
        date: '2030-05-11',
        time: '03:00 م',
        booking_type: 'cash',
        booking_source: 'website',
        status: 'confirmed',
      } as any,
    ]);
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', unpaidCancelId);

    const paidRefundId = crypto.randomUUID();
    await supabase.from('bookings').insert([
      {
        id: paidRefundId,
        cancellation_token: crypto.randomUUID(),
        patient_name: 'كريم شريف نبيل',
        phone: '01090001008',
        doctor_name: 'د. سارة المنصور',
        service: 'كشف عيون شامل', // 700
        date: '2030-05-12',
        time: '04:00 م',
        booking_type: 'cash',
        booking_source: 'staff',
        status: 'confirmed',
      } as any,
    ]);

    await confirmUnifiedBookingPayment({
      bookingId: paidRefundId,
      amount: 700,
      paymentMethod: 'cash',
      accountId: cashboxId,
      confirmedVia: 'payments_section',
    });

    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', paidRefundId);

    // Partial refund 300
    await refundOrReverseBookingPayment({
      bookingId: paidRefundId,
      mode: 'refund',
      amount: 300,
      paymentMethod: 'cash',
      accountId: cashboxId,
      reason: 'استرداد جزئي بعد خصم رسوم الحجز',
    });

    let records = await loadPatientBillingRecords();
    expect(records.find((r) => r.bookingId === unpaidCancelId)?.financialStatus).toBe('ملغي');
    expect(records.find((r) => r.bookingId === paidRefundId)?.financialStatus).toBe('مسترد جزئيًا');
    expect(records.find((r) => r.bookingId === paidRefundId)?.refundedAmount).toBe(300);

    // Full remaining refund 400
    await refundOrReverseBookingPayment({
      bookingId: paidRefundId,
      mode: 'refund',
      amount: 400,
      paymentMethod: 'cash',
      accountId: cashboxId,
      reason: 'استكمال الاسترداد الكامل',
    });

    records = await loadPatientBillingRecords();
    const refundedRec = records.find((r) => r.bookingId === paidRefundId)!;
    expect(refundedRec.financialStatus).toBe('مسترد بالكامل');
    expect(refundedRec.refundedAmount).toBe(700);
  });

  it('8. Strict permissions isolate booking/patient viewers from payment confirmation, balances, refunds & reversals', async () => {
    expect(PATIENT_BILLING_PAYMENT_PERMISSIONS).toHaveLength(11);

    const bookingViewerOnly = staffWith(['manage_bookings', 'patients_view']);
    expect(canAccessSection(bookingViewerOnly, 'bookings')).toBe(true);
    expect(canAccessSection(bookingViewerOnly, 'accounting')).toBe(false);
    expect(canAccessSection(bookingViewerOnly, 'payments')).toBe(false);
    expect(hasPatientBillingPermission(bookingViewerOnly, 'payment_confirm')).toBe(false);
    expect(hasPatientBillingPermission(bookingViewerOnly, 'patient_accounts_view')).toBe(false);
    expect(hasPatientBillingPermission(bookingViewerOnly, 'accounting_view_patient_balances')).toBe(false);

    // Create a real staff user in mock auth with booking + patient view permissions ONLY (no payment_confirm)
    const { data: createdStaff } = await (supabase.auth as any).admin.createUser({
      email: 'booking_only@barada-clinic.local',
      password: 'Password@123',
      user_metadata: { name: 'موظف حجوزات فقط', role: 'staff' },
    });
    const staffUid = createdStaff.user.id;
    await supabase
      .from('profiles')
      .update({ permissions: ['staff_bookings_view', 'staff_bookings_create', 'patients_view', 'patient_accounts_view_own'] } as any)
      .eq('user_id', staffUid);

    const ownBookingId = crypto.randomUUID();
    const otherBookingId = crypto.randomUUID();
    await supabase.from('bookings').insert([
      {
        id: ownBookingId,
        cancellation_token: crypto.randomUUID(),
        patient_name: 'حجز الموظف الخاص',
        phone: '01090001009',
        doctor_name: 'د. أحمد برادة',
        service: 'كشف عيون شامل',
        date: '2030-05-15',
        time: '05:00 م',
        booking_source: 'staff',
        created_by_staff_id: staffUid,
        status: 'confirmed',
      } as any,
      {
        id: otherBookingId,
        cancellation_token: crypto.randomUUID(),
        patient_name: 'حجز موظف آخر',
        phone: '01090001010',
        doctor_name: 'د. أحمد برادة',
        service: 'كشف عيون شامل',
        date: '2030-05-15',
        time: '05:15 م',
        booking_source: 'website',
        status: 'confirmed',
      } as any,
    ]);

    // Switch session to booking-only staff user
    await supabase.auth.signInWithPassword({
      email: 'booking_only@barada-clinic.local',
      password: 'Password@123',
    });

    // Cannot confirm payment even via unified RPC
    await expect(
      confirmUnifiedBookingPayment({
        bookingId: ownBookingId,
        amount: 750,
        paymentMethod: 'cash',
        confirmedVia: 'payments_section',
      }),
    ).rejects.toThrow();

    // patient_accounts_view_own can only see their own booking record
    const scopedRecords = await loadPatientBillingRecords({ onlyOwnForStaffId: staffUid });
    expect(scopedRecords.some((r) => r.bookingId === ownBookingId)).toBe(true);
    expect(scopedRecords.some((r) => r.bookingId === otherBookingId)).toBe(false);
  });

  it('9. Idempotency & repeated backfill syncs never duplicate billing records, transactions, or revenues', async () => {
    const bookingId = crypto.randomUUID();
    await supabase.from('bookings').insert([
      {
        id: bookingId,
        cancellation_token: crypto.randomUUID(),
        patient_name: 'رامي نبيل فؤاد',
        phone: '01090001011',
        doctor_name: 'د. محمود الشريف',
        service: 'كشف عيون شامل', // 350 + 350 = 700
        date: '2030-05-16',
        time: '06:00 م',
        booking_type: 'cash',
        booking_source: 'website',
        status: 'confirmed',
      } as any,
    ]);

    await syncBookingsToPatientBilling();
    await syncBookingsToPatientBilling();

    const records = await loadPatientBillingRecords();
    expect(records.filter((r) => r.bookingId === bookingId)).toHaveLength(1);

    const idemKey = `idem-test-${bookingId}`;
    const tx1 = await confirmUnifiedBookingPayment({
      bookingId,
      amount: 700,
      paymentMethod: 'cash',
      accountId: cashboxId,
      confirmedVia: 'payments_section',
      idempotencyKey: idemKey,
    });
    const tx2 = await confirmUnifiedBookingPayment({
      bookingId,
      amount: 700,
      paymentMethod: 'cash',
      accountId: cashboxId,
      confirmedVia: 'payments_section',
      idempotencyKey: idemKey,
    });
    expect(tx1.id).toBe(tx2.id);

    const txns = await loadPatientBillingTransactions({ bookingId });
    expect(txns).toHaveLength(1);

    const bundle = await loadAccountingBundle();
    expect(bundle.revenues.filter((r) => r.bookingId === bookingId)).toHaveLength(1);

    const apptMetrics = computePatientBillingDashboardMetrics(
      bundle.billingRecords,
      bundle.billingTransactions,
      '2030-05-16',
      '2030-05-16',
    );
    expect(apptMetrics.totalReceivablesDue).toBeGreaterThanOrEqual(700);
    expect(apptMetrics.fullyPaidBookingsCount).toBeGreaterThanOrEqual(1);

    const overallMetrics = computePatientBillingDashboardMetrics(
      bundle.billingRecords,
      bundle.billingTransactions,
    );
    expect(overallMetrics.totalCollectedAmount).toBeGreaterThanOrEqual(700);
  });
});
