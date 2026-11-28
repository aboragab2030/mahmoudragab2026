import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  CANCELLED_PAID_NOTICE,
  CANCELLED_SERVICE_NOTICE,
  isCancellationNotice,
  isCancelledPaidNotice,
} from '@/barada/paymentsLog';
import { MIN_REFRESH_SPIN_MS, withMinSpin } from '@/lib/refreshSpin';
import { savePatientRecord } from '@/barada/patientsService';
import { createAccountingAccount, loadAccountingBundle } from '@/barada/accountingService';
import {
  confirmUnifiedBookingPayment,
  loadPatientBillingRecords,
  loadPatientBillingTransactions,
} from '@/barada/patientBillingService';

describe('Payment Delete Confirmation, Patient/Cancellation Notifications & Refresh Spin', () => {
  const actor = { userId: 'admin-notif-test', name: 'المدير التنفيذي' };
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
          name: 'خزينة الاختبار',
          openingBalance: 0,
          openingBalanceDate: '2030-06-01',
        },
        actor,
      );
      cashboxId = created.id;
    }
  });

  it('detects both paid and unpaid cancellation notices while treating additions as non-cancellation', () => {
    expect(isCancelledPaidNotice(`${CANCELLED_PAID_NOTICE} - كشف`)).toBe(true);
    expect(isCancellationNotice(`${CANCELLED_PAID_NOTICE} - كشف`)).toBe(true);
    expect(isCancellationNotice(`${CANCELLED_SERVICE_NOTICE} - كشف عيون`)).toBe(true);
    expect(isCancellationNotice('تم إلغاء حجز المريض')).toBe(true);
    expect(isCancellationNotice('تم إلغاء عملية جراحية')).toBe(true);
    expect(isCancellationNotice('تم إضافة مريض جديد: سامي عادل')).toBe(false);
    expect(isCancellationNotice('تم إضافة مريض / حجز جديد: ريم حسن')).toBe(false);
  });

  it('withMinSpin returns task output and enforces minimum spin window', async () => {
    const start = Date.now();
    const result = await withMinSpin(async () => 'done', 60);
    const elapsed = Date.now() - start;
    expect(result).toBe('done');
    expect(elapsed).toBeGreaterThanOrEqual(50);
    expect(MIN_REFRESH_SPIN_MS).toBe(450);
  });

  it('inserting a patient creates a green non-cancellation payment notification and deduplicates immediate booking for same patient', async () => {
    const uniqueName = `مريض إشعار ${Date.now()}`;
    const phone = `01088${String(Date.now()).slice(-6)}`;

    await savePatientRecord(
      {
        fullName: uniqueName,
        phone,
      },
      actor,
    );

    const { data: afterPatient, error: notifErr } = await supabase
      .from('payment_notifications')
      .select('*')
      .eq('patient_name', uniqueName)
      .order('created_at', { ascending: false });

    expect(notifErr).toBeNull();
    expect(afterPatient).toBeTruthy();
    expect(afterPatient!.length).toBe(1);
    expect(afterPatient![0].is_read).toBe(false);
    expect(afterPatient![0].message).toContain('تم إضافة مريض جديد');
    expect(isCancellationNotice(afterPatient![0].message)).toBe(false);

    // Immediate booking insert for the same patient within 15s deduplicates
    await supabase.from('bookings').insert([
      {
        id: crypto.randomUUID(),
        cancellation_token: crypto.randomUUID(),
        patient_name: uniqueName,
        phone,
        doctor_name: 'د. أحمد برادة',
        service: 'كشف عيون شامل',
        date: '2030-06-10',
        time: '11:00 ص',
        booking_source: 'staff',
        status: 'confirmed',
      } as any,
    ]);

    const { data: afterBooking } = await supabase
      .from('payment_notifications')
      .select('*')
      .eq('patient_name', uniqueName);

    expect(afterBooking?.length).toBe(1);
  });

  it('online booking insert creates a green notification and cancelling unpaid or paid booking creates red cancellation notice', async () => {
    const unpaidName = `مريض أونلاين ${Date.now()}`;
    const unpaidBookingId = crypto.randomUUID();
    const cancelToken = crypto.randomUUID();

    await supabase.from('bookings').insert([
      {
        id: unpaidBookingId,
        cancellation_token: cancelToken,
        patient_name: unpaidName,
        phone: '01077001122',
        doctor_name: 'د. أحمد برادة',
        service: 'كشف عيون شامل',
        date: '2030-06-12',
        time: '12:00 م',
        booking_source: 'website',
        status: 'confirmed',
      } as any,
    ]);

    const { data: addedNotices } = await supabase
      .from('payment_notifications')
      .select('*')
      .eq('patient_name', unpaidName);

    expect(addedNotices?.length).toBe(1);
    expect(isCancellationNotice(addedNotices![0].message)).toBe(false);

    // Patient cancels unpaid booking via capability RPC
    const { error: cancelRpcErr } = await supabase.rpc('cancel_patient_booking', {
      _booking_id: unpaidBookingId,
      _token: cancelToken,
    });
    expect(cancelRpcErr).toBeNull();

    const { data: afterCancelNotices } = await supabase
      .from('payment_notifications')
      .select('*')
      .eq('patient_name', unpaidName)
      .order('created_at', { ascending: true });

    expect(afterCancelNotices?.length).toBe(2);
    const cancelNotice = afterCancelNotices![afterCancelNotices!.length - 1];
    expect(cancelNotice.is_read).toBe(false);
    expect(isCancellationNotice(cancelNotice.message)).toBe(true);
    expect(cancelNotice.message).toContain(CANCELLED_SERVICE_NOTICE);

    // Paid booking cancellation via status update creates red paid cancellation notice
    const paidName = `مريض مدفوع ملغي ${Date.now()}`;
    const paidBookingId = crypto.randomUUID();
    await supabase.from('bookings').insert([
      {
        id: paidBookingId,
        cancellation_token: crypto.randomUUID(),
        patient_name: paidName,
        phone: '01077001133',
        doctor_name: 'د. محمود الشريف',
        service: 'كشف عيون شامل',
        date: '2030-06-13',
        time: '01:00 م',
        booking_source: 'website',
        status: 'confirmed',
      } as any,
    ]);

    await confirmUnifiedBookingPayment({
      bookingId: paidBookingId,
      amount: 700,
      paymentMethod: 'cash',
      accountId: cashboxId,
      confirmedVia: 'payments_section',
    });

    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', paidBookingId);

    const { data: paidNotices } = await supabase
      .from('payment_notifications')
      .select('*')
      .eq('patient_name', paidName);

    const paidCancelNotice = (paidNotices || []).find((n: any) =>
      isCancellationNotice(n.message),
    );
    expect(paidCancelNotice).toBeTruthy();
    expect(paidCancelNotice!.message).toContain(CANCELLED_PAID_NOTICE);
  });

  it('delete_payment_record deletes payment, linked billing txn, accounting revenue & notifications and recalculates booking balance (admin only)', async () => {
    const patientName = `مريض حذف دفع ${Date.now()}`;
    const bookingId = crypto.randomUUID();

    await supabase.from('bookings').insert([
      {
        id: bookingId,
        cancellation_token: crypto.randomUUID(),
        patient_name: patientName,
        phone: '01066001144',
        doctor_name: 'د. أحمد برادة',
        service: 'كشف عيون شامل', // 350 + 400 = 750
        date: '2030-06-15',
        time: '02:00 م',
        booking_source: 'website',
        status: 'confirmed',
      } as any,
    ]);

    const confirmed = await confirmUnifiedBookingPayment({
      bookingId,
      amount: 750,
      paymentMethod: 'cash',
      accountId: cashboxId,
      confirmedVia: 'payments_section',
    });

    expect(confirmed.paymentId).toBeTruthy();

    // Non-admin staff is blocked from deleting payment record
    const staffEmail = `nonadmin-del-${Date.now()}@barada-clinic.local`;
    await supabase.auth.signUp({
      email: staffEmail,
      password: 'Password@123',
    });
    await supabase.auth.signInWithPassword({
      email: staffEmail,
      password: 'Password@123',
    });

    const { error: nonAdminErr } = await supabase.rpc('delete_payment_record', {
      _payment_id: confirmed.paymentId!,
    });
    expect(nonAdminErr).toBeTruthy();

    // Switch back to admin and delete payment
    await supabase.auth.signInWithPassword({
      email: 'admin@barada-clinic.local',
      password: 'admin',
    });

    const { error: adminDelErr } = await supabase.rpc('delete_payment_record', {
      _payment_id: confirmed.paymentId!,
    });
    expect(adminDelErr).toBeNull();

    // Verify payment row, billing txn, accounting revenue & linked payment notification are removed
    const { data: remainingPayments } = await supabase
      .from('payments')
      .select('*')
      .eq('id', confirmed.paymentId!);
    expect(remainingPayments?.length || 0).toBe(0);

    const { data: remainingNotifs } = await supabase
      .from('payment_notifications')
      .select('*')
      .eq('payment_id', confirmed.paymentId!);
    expect(remainingNotifs?.length || 0).toBe(0);

    const billingTxns = await loadPatientBillingTransactions({ bookingId });
    expect(billingTxns.length).toBe(0);

    const billingRecords = await loadPatientBillingRecords();
    const record = billingRecords.find((r) => r.bookingId === bookingId);
    expect(record).toBeTruthy();
    expect(record!.paidAmount).toBe(0);
    expect(record!.remainingBalance).toBe(750);
    expect(record!.financialStatus).toBe('غير مدفوع');

    const bundle = await loadAccountingBundle();
    const rev = bundle.revenues.find(
      (r) => r.sourceTable === 'payments' && r.sourceId === confirmed.paymentId,
    );
    expect(rev).toBeUndefined();

    const { data: bookingRow } = await supabase
      .from('bookings')
      .select('payment_status')
      .eq('id', bookingId)
      .maybeSingle();
    expect(bookingRow?.payment_status).toBe('pending');
  });

  it('verifies UI components have in-app delete confirmation modal and spinning circular refresh controls', () => {
    const paymentsTabSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/barada/PaymentsTab.tsx'),
      'utf-8',
    );
    const patientModalSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/barada/PatientManagementModal.tsx'),
      'utf-8',
    );
    const indexSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/barada/index.tsx'),
      'utf-8',
    );

    expect(paymentsTabSrc).not.toContain('window.confirm');
    expect(paymentsTabSrc).toContain('تأكيد حذف عملية الدفع');
    expect(paymentsTabSrc).toContain('isCancellationNotice');
    expect(paymentsTabSrc).toContain('withMinSpin');

    expect(patientModalSrc).toContain('<RefreshCw');
    expect(patientModalSrc).toContain('withMinSpin');
    expect(indexSrc).toContain('withMinSpin');
  });
});
