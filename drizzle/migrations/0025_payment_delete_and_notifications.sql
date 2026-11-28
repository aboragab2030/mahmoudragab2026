-- ============================================================================
-- Migration 0025: Safe Admin Payment Deletion & Patient/Cancellation Notices
-- 1. Upgrade delete_payment_record to cleanly remove linked billing/accounting
--    rows and recalculate patient billing & booking payment_status.
-- 2. Emit green payment_notifications on patient/booking addition (deduped).
-- 3. Emit red payment_notifications on any booking/service cancellation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_payment_record(_payment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id text;
  v_deleted boolean := false;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT booking_id INTO v_booking_id
  FROM public.payments
  WHERE id = _payment_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.instapay_submissions
  SET payment_id = NULL
  WHERE payment_id = _payment_id;

  UPDATE public.paymob_payments
  SET payment_id = NULL
  WHERE payment_id = _payment_id;

  -- Remove linked account ledger transactions & revenues generated from this payment
  DELETE FROM public.accounting_account_transactions
  WHERE reference_table = 'accounting_revenues'
    AND reference_id IN (
      SELECT id
      FROM public.accounting_revenues
      WHERE source_table = 'payments'
        AND source_id = _payment_id::text
    );

  DELETE FROM public.patient_billing_transactions
  WHERE payment_id = _payment_id;

  DELETE FROM public.accounting_revenues
  WHERE source_table = 'payments'
    AND source_id = _payment_id::text;

  DELETE FROM public.payment_notifications
  WHERE payment_id = _payment_id;

  DELETE FROM public.payments
  WHERE id = _payment_id;

  v_deleted := FOUND;

  IF v_deleted AND v_booking_id IS NOT NULL
     AND v_booking_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    IF EXISTS (SELECT 1 FROM public.patient_billing_records WHERE booking_id = v_booking_id::uuid) THEN
      PERFORM public.recalculate_patient_billing_record(v_booking_id::uuid);
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.payments WHERE booking_id = v_booking_id AND status = 'paid'
    ) THEN
      PERFORM set_config('app.bypass_payment_guard', '1', true);
      UPDATE public.bookings
      SET payment_status = 'pending', updated_at = now()
      WHERE id = v_booking_id::uuid AND payment_status = 'paid';
    END IF;
  END IF;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_payment_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_payment_record(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Green notification when adding a new patient
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_patient_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(btrim(NEW.full_name), '') = '' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_notifications
    WHERE is_read = false
      AND patient_name = NEW.full_name
      AND message LIKE 'تم إضافة %'
      AND created_at >= now() - interval '15 seconds'
  ) THEN
    INSERT INTO public.payment_notifications (payment_id, patient_name, amount, message, is_read)
    VALUES (
      NULL,
      NEW.full_name,
      0,
      'تم إضافة مريض جديد: ' || NEW.full_name || CASE WHEN COALESCE(btrim(NEW.phone), '') <> '' THEN ' (' || NEW.phone || ')' ELSE '' END,
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_patient_added() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_patient_added ON public.patients;
CREATE TRIGGER trg_notify_patient_added
  AFTER INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.notify_patient_added();

-- ---------------------------------------------------------------------------
-- Green notification when a patient/booking is added (if not just logged above)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_booking_patient_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amt numeric := 0;
BEGIN
  IF COALESCE(btrim(NEW.patient_name), '') = '' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_notifications
    WHERE is_read = false
      AND patient_name = NEW.patient_name
      AND message LIKE 'تم إضافة %'
      AND created_at >= now() - interval '15 seconds'
  ) THEN
    v_amt := COALESCE(public.instapay_amount_due(NEW.service, NEW.doctor_id, NEW.doctor_name), 0);
    INSERT INTO public.payment_notifications (payment_id, patient_name, amount, message, is_read)
    VALUES (
      NULL,
      NEW.patient_name,
      v_amt,
      'تم إضافة مريض / حجز جديد: ' || COALESCE(NEW.service, '') || CASE WHEN COALESCE(btrim(NEW.doctor_name), '') <> '' THEN ' - د. ' || NEW.doctor_name ELSE '' END,
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_booking_patient_added() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_booking_patient_added ON public.bookings;
CREATE TRIGGER trg_notify_booking_patient_added
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_patient_added();

-- ---------------------------------------------------------------------------
-- Red notification when any booking / service is cancelled (paid OR unpaid)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_paid_booking_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  v_found boolean := false;
  v_detail text;
  v_due numeric := 0;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    v_detail := ' - ' || COALESCE(NEW.service, '') || ' - د. ' || COALESCE(NEW.doctor_name, '') || ' - ' || COALESCE(NEW.date, '') || ' ' || COALESCE(NEW.time, '');
    v_due := COALESCE(public.instapay_amount_due(NEW.service, NEW.doctor_id, NEW.doctor_name), 0);

    FOR p IN SELECT id, amount FROM public.payments WHERE booking_id = NEW.id::text AND status = 'paid' LOOP
      v_found := true;
      INSERT INTO public.payment_notifications (payment_id, patient_name, amount, message, is_read)
      VALUES (p.id, NEW.patient_name, p.amount, 'تم إلغاء إجراء مدفوع' || v_detail, false);
    END LOOP;

    IF NOT v_found AND NEW.payment_status = 'paid' THEN
      INSERT INTO public.payment_notifications (payment_id, patient_name, amount, message, is_read)
      VALUES (NULL, NEW.patient_name, v_due, 'تم إلغاء إجراء مدفوع' || v_detail, false);
    ELSIF NOT v_found THEN
      INSERT INTO public.payment_notifications (payment_id, patient_name, amount, message, is_read)
      VALUES (NULL, NEW.patient_name, v_due, 'تم إلغاء خدمة' || v_detail, false);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_paid_booking_cancelled() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bookings_paid_cancel_notice ON public.bookings;
CREATE TRIGGER bookings_paid_cancel_notice
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_paid_booking_cancelled();
