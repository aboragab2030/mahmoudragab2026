import { describe, it, expect } from 'vitest';
import { mapOperationRow } from '@/barada/clinicRecords';
import { createMockSupabaseClient } from '@/integrations/supabase/mockClient';

describe('Operation eyeSide mapping', () => {
  it('maps valid eye_side values (right, left, both) and ignores unknown ones', () => {
    expect(
      mapOperationRow({
        id: '00000000-0000-0000-0000-000000000001',
        patient_name: 'مريض تجريبي',
        patient_phone: '01012345678',
        doctor_name: 'د. أحمد برادة',
        surgery_type: 'مياه بيضاء',
        date: '2026-06-01',
        cost: 5000,
        eye_side: 'right',
      }).eyeSide,
    ).toBe('right');

    expect(
      mapOperationRow({
        id: '00000000-0000-0000-0000-000000000002',
        patient_name: 'مريض تجريبي',
        patient_phone: '01012345678',
        doctor_name: 'د. أحمد برادة',
        surgery_type: 'ليزك',
        date: '2026-06-01',
        cost: 8000,
        eye_side: 'both',
      }).eyeSide,
    ).toBe('both');

    expect(
      mapOperationRow({
        id: '00000000-0000-0000-0000-000000000003',
        patient_name: 'مريض تجريبي',
        patient_phone: '01012345678',
        doctor_name: 'د. أحمد برادة',
        surgery_type: 'مياه زرقاء',
        date: '2026-06-01',
        cost: 6000,
        eye_side: null,
      }).eyeSide,
    ).toBeUndefined();
  });
});

describe('Mock client booking phone OR lookup & InstaPay submission', () => {
  it('supports .or() phone lookup and records InstaPay submissions', async () => {
    const client = createMockSupabaseClient();
    const bookingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    await client.from('bookings').insert({
      id: bookingId,
      patient_name: 'أحمد محمد علي محمود',
      phone: '01099887766',
      phone2: '01122334455',
      doctor_name: 'د. أحمد برادة',
      service: 'كشف عيون شامل',
      date: '2026-06-02',
      time: '12:00 PM',
      status: 'confirmed',
      payment_method: 'instapay',
      payment_status: 'pending',
    } as any);

    const { data: instapayData } = await client.rpc('submit_instapay_payment', {
      _booking_id: bookingId,
      _phone: '01099887766',
      _transaction_ref: 'TXN-12345',
      _declared_amount: 400,
      _evidence_path: `${bookingId}/receipt.png`,
    } as any);
    expect(Array.isArray(instapayData)).toBe(true);

    const { data: byPhone2 } = await client
      .from('bookings')
      .select('*')
      .or('phone.eq.01122334455,phone2.eq.01122334455');
    expect(byPhone2).toHaveLength(1);
    expect((byPhone2 as any[])[0].id).toBe(bookingId);

    const { data: submissions } = await client
      .from('instapay_submissions' as any)
      .select('*')
      .eq('booking_id', bookingId);
    expect(submissions).toHaveLength(1);
    expect((submissions as any[])[0].transaction_ref).toBe('TXN-12345');
  });

  it('authorizes admin and review_instapay staff for can_review_instapay and approves payment', async () => {
    const client = createMockSupabaseClient();

    // Unauthenticated / unknown uid cannot review
    const { data: anonAllowed } = await client.rpc('can_review_instapay', {
      _uid: '00000000-0000-4000-8000-000000000999',
    } as any);
    expect(anonAllowed).toBe(false);

    // Staff without review_instapay cannot review
    const { data: plainStaffRes } = await (client.auth.admin as any).createUser({
      email: 'plain-staff@barada.local',
      password: 'Password123',
      user_metadata: { name: 'موظف عادي', role: 'staff' },
    });
    const plainStaffId = plainStaffRes.user.id;
    await client.from('profiles').upsert({
      user_id: plainStaffId,
      name: 'موظف عادي',
      permissions: ['manage_bookings'],
      is_active: true,
    });
    const { data: plainAllowed } = await client.rpc('can_review_instapay', {
      _uid: plainStaffId,
    } as any);
    expect(plainAllowed).toBe(false);

    // Staff with review_instapay can review
    const { data: reviewerRes } = await (client.auth.admin as any).createUser({
      email: 'reviewer@barada.local',
      password: 'Password123',
      user_metadata: { name: 'مراجع إنستاباي', role: 'staff' },
    });
    const reviewerId = reviewerRes.user.id;
    await client.from('profiles').upsert({
      user_id: reviewerId,
      name: 'مراجع إنستاباي',
      permissions: ['review_instapay'],
      is_active: true,
    });
    const { data: reviewerAllowed } = await client.rpc('can_review_instapay', {
      _uid: reviewerId,
    } as any);
    expect(reviewerAllowed).toBe(true);

    // Admin can review and approve submission
    const { data: adminSignIn } = await client.auth.signInWithPassword({
      email: 'admin-instapay@barada.local',
      password: 'AdminPassword123',
    });
    const adminId = adminSignIn.user!.id;
    const { data: adminAllowed } = await client.rpc('can_review_instapay', {
      _uid: adminId,
    } as any);
    expect(adminAllowed).toBe(true);

    const bookingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
    await client.from('bookings').insert({
      id: bookingId,
      patient_name: 'سارة علي محمود',
      phone: '01055443322',
      doctor_name: 'د. أحمد برادة',
      service: 'كشف عيون شامل',
      date: '2026-06-05',
      time: '01:00 PM',
      status: 'confirmed',
      payment_method: 'instapay',
      payment_status: 'pending',
    } as any);

    await client.rpc('submit_instapay_payment', {
      _booking_id: bookingId,
      _phone: '01055443322',
      _transaction_ref: 'TXN-REVIEW-01',
      _declared_amount: 400,
      _evidence_path: `${bookingId}/receipt.png`,
    } as any);

    const { data: subList } = await client
      .from('instapay_submissions' as any)
      .select('*')
      .eq('booking_id', bookingId);
    const submission = (subList as any[])[0];
    expect(submission).toBeTruthy();

    const { data: reviewStatus, error: reviewErr } = await client.rpc('review_instapay_payment', {
      _submission_id: submission.id,
      _action: 'approve',
      _verified_amount: submission.amount_due,
      _reason: '',
    } as any);
    expect(reviewErr).toBeNull();
    expect(reviewStatus).toBe('PAID');

    const { data: updatedBooking } = await client
      .from('bookings')
      .select('payment_status')
      .eq('id', bookingId)
      .single();
    expect((updatedBooking as any)?.payment_status).toBe('paid');
  });

  it('supports chained multi-column .order() queries and re-query refresh consistency', async () => {
    const client = createMockSupabaseClient();

    await client.from('offers' as any).insert([
      {
        id: 'off-1',
        title: 'عرض أول أقدم',
        doctor_id: 'doc-1',
        offer_price: 200,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        display_order: 1,
        created_at: '2026-01-01T10:00:00.000Z',
      },
      {
        id: 'off-2',
        title: 'عرض أول أحدث',
        doctor_id: 'doc-1',
        offer_price: 250,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        display_order: 1,
        created_at: '2026-02-01T10:00:00.000Z',
      },
      {
        id: 'off-3',
        title: 'عرض ثاني',
        doctor_id: 'doc-1',
        offer_price: 300,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        display_order: 2,
        created_at: '2026-03-01T10:00:00.000Z',
      },
    ] as any);

    const { data: sortedOffers, error } = await client
      .from('offers' as any)
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    expect(error).toBeNull();
    expect((sortedOffers as any[]).map((o) => o.id)).toEqual(['off-2', 'off-1', 'off-3']);

    // Verify re-query reflects subsequent updates cleanly
    await client.from('offers' as any).update({ display_order: 0 }).eq('id', 'off-3');
    const { data: refreshedOffers } = await client
      .from('offers' as any)
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    expect((refreshedOffers as any[]).map((o) => o.id)).toEqual(['off-3', 'off-2', 'off-1']);
  });
});


