-- ============================================================================
-- Migration 0024: Unified Patient Billing, Strict Payment Confirmation & Sync
-- Single Financial Source of Truth across Bookings, Patients, Payments, Accounting
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Strict Granular Permission Helper (NO Implicit Grants)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_patient_billing_permission(_uid uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN _uid IS NULL OR _perm IS NULL OR btrim(_perm) = '' THEN false
      WHEN public.has_role(_uid, 'admin') THEN true
      ELSE EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.user_id
        WHERE p.user_id = _uid
          AND COALESCE(p.is_active, true) = true
          AND p.permissions IS NOT NULL
          AND _perm = ANY (ARRAY(SELECT jsonb_array_elements_text(p.permissions)))
      )
    END;
$$;

REVOKE ALL ON FUNCTION public.has_patient_billing_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_patient_billing_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_patient_billing_permission(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Extend public.payments & Tighten RLS Policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.payments
  ALTER COLUMN amount TYPE NUMERIC(14,2) USING amount::numeric(14,2);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounting_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_by_staff_id UUID,
  ADD COLUMN IF NOT EXISTS confirmed_by_staff_name TEXT,
  ADD COLUMN IF NOT EXISTS is_partial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.payment_notifications
  ALTER COLUMN amount TYPE NUMERIC(14,2) USING amount::numeric(14,2);

DROP POLICY IF EXISTS "Staff read payments" ON public.payments;
DROP POLICY IF EXISTS "Staff insert payments" ON public.payments;
DROP POLICY IF EXISTS "Staff update payments" ON public.payments;
DROP POLICY IF EXISTS "Authorized staff read payments" ON public.payments;
DROP POLICY IF EXISTS "Authorized staff insert payments" ON public.payments;
DROP POLICY IF EXISTS "Authorized staff update payments" ON public.payments;

CREATE POLICY "Authorized staff read payments"
  ON public.payments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_view_history')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm_partial')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_refund')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_reverse')
    OR public.has_accounting_permission(auth.uid(), 'accounting_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_revenue_view')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND COALESCE(p.is_active, true) = true
        AND p.permissions IS NOT NULL
        AND (
          'manage_payments' = ANY (ARRAY(SELECT jsonb_array_elements_text(p.permissions)))
          OR 'review_instapay' = ANY (ARRAY(SELECT jsonb_array_elements_text(p.permissions)))
        )
    )
  );

CREATE POLICY "Authorized staff insert payments"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm_partial')
  );

CREATE POLICY "Authorized staff update payments"
  ON public.payments FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm_partial')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_refund')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_reverse')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm_partial')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_refund')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_reverse')
  );

-- ---------------------------------------------------------------------------
-- 3. Unified Patient Billing Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_billing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  booking_source TEXT NOT NULL DEFAULT 'website' CHECK (booking_source IN ('website', 'staff', 'admin')),
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  doctor_name TEXT NOT NULL,
  service_name TEXT NOT NULL,
  appointment_date TEXT NOT NULL,
  booking_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  original_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (original_price >= 0),
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  discount_reason TEXT,
  final_amount_due NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (final_amount_due >= 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  refunded_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (remaining_balance >= 0),
  financial_status TEXT NOT NULL DEFAULT 'غير مدفوع' CHECK (
    financial_status IN (
      'غير مدفوع',
      'مدفوع جزئيًا',
      'مدفوع بالكامل',
      'ملغي',
      'مسترد بالكامل',
      'مسترد جزئيًا'
    )
  ),
  booking_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (booking_status IN ('confirmed', 'cancelled')),
  created_by_staff_id UUID,
  created_by_staff_name TEXT,
  assigned_staff_id UUID,
  assigned_staff_name TEXT,
  last_payment_at TIMESTAMPTZ,
  last_payment_method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_billing_records_patient_idx
  ON public.patient_billing_records (patient_id, appointment_date DESC);

CREATE INDEX IF NOT EXISTS patient_billing_records_phone_idx
  ON public.patient_billing_records (patient_phone);

CREATE INDEX IF NOT EXISTS patient_billing_records_status_idx
  ON public.patient_billing_records (financial_status, booking_source, appointment_date DESC);

GRANT SELECT, INSERT, UPDATE ON public.patient_billing_records TO authenticated;
GRANT ALL ON public.patient_billing_records TO service_role;
ALTER TABLE public.patient_billing_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff read patient_billing_records" ON public.patient_billing_records;
CREATE POLICY "Authorized staff read patient_billing_records"
  ON public.patient_billing_records FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_patient_billing_permission(auth.uid(), 'patient_accounts_view_all')
    OR public.has_patient_billing_permission(auth.uid(), 'accounting_view_patient_balances')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm_partial')
    OR (
      (
        public.has_patient_billing_permission(auth.uid(), 'patient_accounts_view')
        OR public.has_patient_billing_permission(auth.uid(), 'patient_accounts_view_own')
      )
      AND (
        public.has_patient_billing_permission(auth.uid(), 'patient_accounts_view_all')
        OR created_by_staff_id = auth.uid()
        OR assigned_staff_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Authorized staff create patient_billing_records" ON public.patient_billing_records;
CREATE POLICY "Authorized staff create patient_billing_records"
  ON public.patient_billing_records FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_patient_billing_permission(auth.uid(), 'patient_accounts_create')
  );

DROP POLICY IF EXISTS "Authorized staff edit patient_billing_records" ON public.patient_billing_records;
CREATE POLICY "Authorized staff edit patient_billing_records"
  ON public.patient_billing_records FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_patient_billing_permission(auth.uid(), 'patient_accounts_edit')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_patient_billing_permission(auth.uid(), 'patient_accounts_edit')
  );

CREATE TABLE IF NOT EXISTS public.patient_billing_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_record_id UUID NOT NULL REFERENCES public.patient_billing_records(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  revenue_id UUID REFERENCES public.accounting_revenues(id) ON DELETE SET NULL,
  transaction_kind TEXT NOT NULL CHECK (transaction_kind IN ('payment', 'refund', 'reversal')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'instapay', 'wallet', 'paymob', 'bank_transfer', 'card', 'other')),
  account_id UUID REFERENCES public.accounting_accounts(id) ON DELETE SET NULL,
  transaction_ref TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  confirmed_via TEXT NOT NULL CHECK (
    confirmed_via IN (
      'payments_section',
      'accounting_section',
      'instapay_review',
      'paymob_webhook',
      'payment_webhook',
      'backfill'
    )
  ),
  confirmed_by_staff_id UUID,
  confirmed_by_staff_name TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'reversed')),
  reversed_by_staff_id UUID,
  reversed_by_staff_name TEXT,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS patient_billing_txns_payment_unique_idx
  ON public.patient_billing_transactions (payment_id)
  WHERE payment_id IS NOT NULL AND transaction_kind = 'payment' AND status = 'confirmed';

CREATE INDEX IF NOT EXISTS patient_billing_txns_booking_idx
  ON public.patient_billing_transactions (booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS patient_billing_txns_patient_idx
  ON public.patient_billing_transactions (patient_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.patient_billing_transactions TO authenticated;
GRANT ALL ON public.patient_billing_transactions TO service_role;
ALTER TABLE public.patient_billing_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff read patient_billing_transactions" ON public.patient_billing_transactions;
CREATE POLICY "Authorized staff read patient_billing_transactions"
  ON public.patient_billing_transactions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_view_history')
    OR public.has_patient_billing_permission(auth.uid(), 'accounting_view_patient_balances')
    OR public.has_patient_billing_permission(auth.uid(), 'patient_accounts_view_all')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm_partial')
    OR (
      public.has_patient_billing_permission(auth.uid(), 'patient_accounts_view_own')
      AND EXISTS (
        SELECT 1
        FROM public.patient_billing_records r
        WHERE r.id = billing_record_id
          AND (r.created_by_staff_id = auth.uid() OR r.assigned_staff_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Authorized staff write patient_billing_transactions" ON public.patient_billing_transactions;
CREATE POLICY "Authorized staff write patient_billing_transactions"
  ON public.patient_billing_transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (transaction_kind = 'payment' AND (
      public.has_patient_billing_permission(auth.uid(), 'payment_confirm')
      OR public.has_patient_billing_permission(auth.uid(), 'payment_confirm_partial')
    ))
    OR (transaction_kind = 'refund' AND public.has_patient_billing_permission(auth.uid(), 'payment_refund'))
    OR (transaction_kind = 'reversal' AND public.has_patient_billing_permission(auth.uid(), 'payment_reverse'))
  );

DROP POLICY IF EXISTS "Authorized staff update patient_billing_transactions" ON public.patient_billing_transactions;
CREATE POLICY "Authorized staff update patient_billing_transactions"
  ON public.patient_billing_transactions FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_reverse')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_refund')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_reverse')
    OR public.has_patient_billing_permission(auth.uid(), 'payment_refund')
  );

-- ---------------------------------------------------------------------------
-- 4. Pricing, Balance Recalculation, & Booking Guard Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_booking_expected_amount(
  p_service text,
  p_doctor_id uuid,
  p_doctor_name text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lower text := lower(COALESCE(p_service, ''));
  v_service_price numeric := 0;
  v_doctor_fee numeric := 0;
BEGIN
  IF v_lower LIKE '%متابعة%' OR v_lower LIKE '%متابعه%' OR v_lower LIKE '%re-exam%' OR v_lower LIKE '%follow%' THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(price, 0)::numeric INTO v_service_price
  FROM public.services
  WHERE title = p_service
  ORDER BY created_at
  LIMIT 1;

  IF p_doctor_id IS NOT NULL THEN
    SELECT COALESCE(fee, 0)::numeric INTO v_doctor_fee
    FROM public.doctors
    WHERE id = p_doctor_id
    LIMIT 1;
  END IF;

  IF v_doctor_fee = 0 AND NULLIF(btrim(COALESCE(p_doctor_name, '')), '') IS NOT NULL THEN
    SELECT COALESCE(fee, 0)::numeric INTO v_doctor_fee
    FROM public.doctors
    WHERE name = p_doctor_name
    ORDER BY created_at
    LIMIT 1;
  END IF;

  RETURN GREATEST(COALESCE(v_service_price, 0) + COALESCE(v_doctor_fee, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.compute_booking_expected_amount(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_booking_expected_amount(text, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalculate_patient_billing_record(p_booking_id uuid)
RETURNS public.patient_billing_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.patient_billing_records;
  v_paid numeric(14,2) := 0;
  v_refunded numeric(14,2) := 0;
  v_net_paid numeric(14,2) := 0;
  v_final numeric(14,2) := 0;
  v_remaining numeric(14,2) := 0;
  v_status text := 'غير مدفوع';
  v_last_paid_at timestamptz;
  v_last_method text;
BEGIN
  SELECT * INTO v_rec
  FROM public.patient_billing_records
  WHERE booking_id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE transaction_kind = 'payment' AND status = 'confirmed'), 0),
    COALESCE(SUM(amount) FILTER (WHERE transaction_kind = 'refund' AND status = 'confirmed'), 0),
    MAX(created_at) FILTER (WHERE transaction_kind = 'payment' AND status = 'confirmed')
  INTO v_paid, v_refunded, v_last_paid_at
  FROM public.patient_billing_transactions
  WHERE billing_record_id = v_rec.id;

  SELECT payment_method INTO v_last_method
  FROM public.patient_billing_transactions
  WHERE billing_record_id = v_rec.id
    AND transaction_kind = 'payment'
    AND status = 'confirmed'
  ORDER BY created_at DESC
  LIMIT 1;

  v_final := GREATEST(COALESCE(v_rec.original_price, 0) - COALESCE(v_rec.discount_amount, 0), 0);
  v_net_paid := GREATEST(v_paid - v_refunded, 0);

  IF v_refunded > 0 THEN
    IF v_refunded >= v_paid THEN
      v_status := 'مسترد بالكامل';
      v_remaining := CASE WHEN v_rec.booking_status = 'cancelled' THEN 0 ELSE v_final END;
    ELSE
      v_status := 'مسترد جزئيًا';
      v_remaining := CASE WHEN v_rec.booking_status = 'cancelled' THEN 0 ELSE GREATEST(v_final - v_net_paid, 0) END;
    END IF;
  ELSIF v_rec.booking_status = 'cancelled' AND v_paid = 0 THEN
    v_status := 'ملغي';
    v_remaining := 0;
  ELSIF v_paid <= 0 THEN
    v_status := 'غير مدفوع';
    v_remaining := v_final;
  ELSIF v_paid >= v_final THEN
    v_status := 'مدفوع بالكامل';
    v_remaining := 0;
  ELSE
    v_status := 'مدفوع جزئيًا';
    v_remaining := CASE WHEN v_rec.booking_status = 'cancelled' THEN 0 ELSE GREATEST(v_final - v_paid, 0) END;
  END IF;

  UPDATE public.patient_billing_records
  SET
    final_amount_due = v_final,
    paid_amount = v_paid,
    refunded_amount = v_refunded,
    remaining_balance = v_remaining,
    financial_status = v_status,
    last_payment_at = v_last_paid_at,
    last_payment_method = COALESCE(v_last_method, last_payment_method),
    updated_at = now()
  WHERE id = v_rec.id
  RETURNING * INTO v_rec;

  PERFORM set_config('app.bypass_payment_guard', '1', true);
  UPDATE public.bookings
  SET
    payment_status = CASE WHEN v_status = 'مدفوع بالكامل' THEN 'paid' ELSE 'pending' END,
    updated_at = now()
  WHERE id = p_booking_id
    AND payment_status IS DISTINCT FROM CASE WHEN v_status = 'مدفوع بالكامل' THEN 'paid' ELSE 'pending' END;

  RETURN v_rec;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_patient_billing_record(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_patient_billing_record(uuid) TO service_role;

-- Prevent setting bookings.payment_status = 'paid' outside verified payment flows
CREATE OR REPLACE FUNCTION public.protect_booking_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_setting('app.bypass_payment_guard', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.payment_status := 'pending';
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF pg_trigger_depth() > 0 THEN
      RETURN NEW;
    END IF;
    IF NEW.payment_status = 'paid' AND EXISTS (
      SELECT 1 FROM public.payments p WHERE p.booking_id = NEW.id::text AND p.status = 'paid'
    ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'permission denied: booking payment_status cannot be confirmed directly' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_booking_payment_status ON public.bookings;
CREATE TRIGGER trg_protect_booking_payment_status
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_booking_payment_status();

-- Automatically maintain patient_billing_records on every booking insert/update
CREATE OR REPLACE FUNCTION public.trg_sync_booking_to_patient_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price numeric(14,2) := 0;
  v_patient_id uuid := NEW.patient_id;
  v_norm_phone text := regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g');
BEGIN
  v_price := public.compute_booking_expected_amount(NEW.service, NEW.doctor_id, NEW.doctor_name);

  IF v_patient_id IS NULL AND v_norm_phone <> '' THEN
    SELECT id INTO v_patient_id
    FROM public.patients
    WHERE regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = v_norm_phone
    LIMIT 1;
  END IF;

  INSERT INTO public.patient_billing_records (
    booking_id,
    patient_id,
    patient_name,
    patient_phone,
    booking_source,
    doctor_id,
    doctor_name,
    service_name,
    appointment_date,
    booking_created_at,
    original_price,
    discount_amount,
    final_amount_due,
    remaining_balance,
    financial_status,
    booking_status,
    created_by_staff_id,
    created_by_staff_name,
    assigned_staff_id,
    assigned_staff_name
  ) VALUES (
    NEW.id,
    v_patient_id,
    NEW.patient_name,
    NEW.phone,
    COALESCE(NEW.booking_source, 'website'),
    NEW.doctor_id,
    NEW.doctor_name,
    NEW.service,
    NEW.date,
    COALESCE(NEW.created_at, now()),
    v_price,
    0,
    v_price,
    CASE WHEN NEW.status = 'cancelled' THEN 0 ELSE v_price END,
    CASE WHEN NEW.status = 'cancelled' THEN 'ملغي' ELSE 'غير مدفوع' END,
    CASE WHEN NEW.status = 'cancelled' THEN 'cancelled' ELSE 'confirmed' END,
    NEW.created_by_staff_id,
    NEW.created_by_staff_name,
    NEW.assigned_staff_id,
    NEW.assigned_staff_name
  )
  ON CONFLICT (booking_id) DO UPDATE SET
    patient_id = COALESCE(EXCLUDED.patient_id, public.patient_billing_records.patient_id),
    patient_name = EXCLUDED.patient_name,
    patient_phone = EXCLUDED.patient_phone,
    booking_source = COALESCE(EXCLUDED.booking_source, public.patient_billing_records.booking_source),
    doctor_id = COALESCE(EXCLUDED.doctor_id, public.patient_billing_records.doctor_id),
    doctor_name = EXCLUDED.doctor_name,
    service_name = EXCLUDED.service_name,
    appointment_date = EXCLUDED.appointment_date,
    original_price = EXCLUDED.original_price,
    booking_status = EXCLUDED.booking_status,
    assigned_staff_id = COALESCE(EXCLUDED.assigned_staff_id, public.patient_billing_records.assigned_staff_id),
    assigned_staff_name = COALESCE(EXCLUDED.assigned_staff_name, public.patient_billing_records.assigned_staff_name),
    updated_at = now();

  PERFORM public.recalculate_patient_billing_record(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_booking_to_patient_billing ON public.bookings;
CREATE TRIGGER trg_sync_booking_to_patient_billing
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_booking_to_patient_billing();

-- Sync any direct external/webhook/instapay/paymob paid payments row into billing & accounting once
CREATE OR REPLACE FUNCTION public.trg_sync_confirmed_payment_to_billing_and_accounting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_uuid uuid;
  v_booking public.bookings;
  v_bill public.patient_billing_records;
  v_method text;
  v_source text := 'payment_webhook';
  v_actor_name text;
  v_rev_id uuid;
  v_doc_num text;
  v_cat_id uuid;
  v_cat_name text := 'الكشوفات';
BEGIN
  IF COALESCE(current_setting('app.skip_payment_sync_trigger', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;
  IF NEW.booking_id IS NULL OR NEW.booking_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;

  v_booking_uuid := NEW.booking_id::uuid;
  SELECT * INTO v_booking FROM public.bookings WHERE id = v_booking_uuid;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Ensure billing record exists
  SELECT * INTO v_bill FROM public.patient_billing_records WHERE booking_id = v_booking_uuid;
  IF NOT FOUND THEN
    INSERT INTO public.patient_billing_records (
      booking_id, patient_id, patient_name, patient_phone, booking_source,
      doctor_id, doctor_name, service_name, appointment_date, booking_created_at,
      original_price, final_amount_due, remaining_balance, booking_status,
      created_by_staff_id, created_by_staff_name, assigned_staff_id, assigned_staff_name
    ) VALUES (
      v_booking.id,
      v_booking.patient_id,
      v_booking.patient_name,
      v_booking.phone,
      COALESCE(v_booking.booking_source, 'website'),
      v_booking.doctor_id,
      v_booking.doctor_name,
      v_booking.service,
      v_booking.date,
      COALESCE(v_booking.created_at, now()),
      public.compute_booking_expected_amount(v_booking.service, v_booking.doctor_id, v_booking.doctor_name),
      public.compute_booking_expected_amount(v_booking.service, v_booking.doctor_id, v_booking.doctor_name),
      public.compute_booking_expected_amount(v_booking.service, v_booking.doctor_id, v_booking.doctor_name),
      CASE WHEN v_booking.status = 'cancelled' THEN 'cancelled' ELSE 'confirmed' END,
      v_booking.created_by_staff_id,
      v_booking.created_by_staff_name,
      v_booking.assigned_staff_id,
      v_booking.assigned_staff_name
    )
    ON CONFLICT (booking_id) DO NOTHING;
    SELECT * INTO v_bill FROM public.patient_billing_records WHERE booking_id = v_booking_uuid;
  END IF;

  v_method := CASE
    WHEN NEW.payment_type = 'instapay' THEN 'instapay'
    WHEN NEW.payment_type = 'wallet' THEN 'wallet'
    WHEN COALESCE(NEW.payment_type_detail, '') ILIKE '%paymob%' THEN 'paymob'
    WHEN COALESCE(NEW.payment_type_detail, '') ILIKE '%نقد%' THEN 'cash'
    WHEN COALESCE(NEW.payment_type_detail, '') ILIKE '%بنك%' THEN 'bank_transfer'
    WHEN COALESCE(NEW.payment_type_detail, '') ILIKE '%بطاقة%' THEN 'card'
    ELSE 'other'
  END;

  IF COALESCE(NEW.notes, '') ILIKE '%Paymob%' OR COALESCE(NEW.payment_type_detail, '') ILIKE '%Paymob%' THEN
    v_source := 'paymob_webhook';
  ELSIF NEW.payment_type = 'instapay' THEN
    v_source := 'instapay_review';
  END IF;

  v_actor_name := COALESCE(NULLIF(btrim(NEW.confirmed_by_staff_name), ''), 'نظام الدفع الإلكتروني');

  IF EXISTS (
    SELECT 1 FROM public.patient_billing_transactions
    WHERE payment_id = NEW.id AND transaction_kind = 'payment' AND status = 'confirmed'
  ) THEN
    RETURN NEW;
  END IF;

  -- Create single accounting_revenue entry (idempotent by source_table/source_id)
  SELECT id, name_ar INTO v_cat_id, v_cat_name
  FROM public.accounting_categories
  WHERE kind = 'revenue' AND code = 'rev_consultations'
  LIMIT 1;

  SELECT id INTO v_rev_id
  FROM public.accounting_revenues
  WHERE source_table = 'payments' AND source_id = NEW.id::text AND status = 'posted'
  LIMIT 1;

  IF v_rev_id IS NULL THEN
    v_doc_num := 'REV-' || to_char((now() AT TIME ZONE 'Africa/Cairo')::date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    INSERT INTO public.accounting_revenues (
      doc_number, revenue_date, category_id, category_name, revenue_source,
      description, amount, payment_method, account_id,
      patient_id, patient_name, booking_id, doctor_name, service_name,
      booking_source, contracting_company_id, responsible_staff_id, responsible_staff_name,
      notes, status, source_table, source_id, created_by, created_by_name
    ) VALUES (
      v_doc_num,
      (COALESCE(NEW.matched_at, NEW.created_at, now()) AT TIME ZONE 'Africa/Cairo')::date,
      v_cat_id,
      COALESCE(v_cat_name, 'الكشوفات'),
      CASE WHEN v_booking.contracting_company_id IS NOT NULL THEN 'contracting' ELSE 'booking' END,
      'تحصيل حجز ' || v_booking.patient_name || ' - ' || v_booking.doctor_name || ' (' || COALESCE(NEW.transaction_id, '') || ')',
      NEW.amount,
      CASE WHEN v_method IN ('cash', 'instapay', 'wallet', 'paymob', 'bank_transfer', 'card') THEN v_method ELSE 'paymob' END,
      NEW.account_id,
      v_bill.patient_id,
      v_booking.patient_name,
      v_booking.id,
      v_booking.doctor_name,
      v_booking.service,
      COALESCE(v_booking.booking_source, 'website'),
      v_booking.contracting_company_id,
      NEW.confirmed_by_staff_id,
      v_actor_name,
      NEW.notes,
      'posted',
      'payments',
      NEW.id::text,
      NEW.confirmed_by_staff_id,
      v_actor_name
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_rev_id;

    IF v_rev_id IS NOT NULL AND NEW.account_id IS NOT NULL THEN
      INSERT INTO public.accounting_account_transactions (
        account_id, transaction_date, direction, entry_type, amount,
        reference_table, reference_id, description, created_by, created_by_name
      ) VALUES (
        NEW.account_id,
        (COALESCE(NEW.matched_at, NEW.created_at, now()) AT TIME ZONE 'Africa/Cairo')::date,
        'in',
        'revenue',
        NEW.amount,
        'accounting_revenues',
        v_rev_id,
        v_doc_num || ' - تحصيل حجز ' || v_booking.patient_name,
        NEW.confirmed_by_staff_id,
        v_actor_name
      );
    END IF;
  END IF;

  INSERT INTO public.patient_billing_transactions (
    billing_record_id, booking_id, patient_id, payment_id, revenue_id,
    transaction_kind, amount, payment_method, account_id,
    transaction_ref, idempotency_key, confirmed_via,
    confirmed_by_staff_id, confirmed_by_staff_name, notes, status, created_at
  ) VALUES (
    v_bill.id,
    v_booking.id,
    v_bill.patient_id,
    NEW.id,
    v_rev_id,
    'payment',
    NEW.amount,
    v_method,
    NEW.account_id,
    COALESCE(NULLIF(btrim(NEW.transaction_id), ''), 'PAY-' || substr(NEW.id::text, 1, 8)),
    'payment:' || NEW.id::text,
    v_source,
    NEW.confirmed_by_staff_id,
    v_actor_name,
    NEW.notes,
    'confirmed',
    COALESCE(NEW.matched_at, NEW.created_at, now())
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  PERFORM public.recalculate_patient_billing_record(v_booking.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_confirmed_payment_to_billing_and_accounting ON public.payments;
CREATE TRIGGER trg_sync_confirmed_payment_to_billing_and_accounting
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_confirmed_payment_to_billing_and_accounting();

-- ---------------------------------------------------------------------------
-- 5. Security-Definer Unified Financial RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_patient_booking_payment(
  _booking_id uuid,
  _amount numeric,
  _payment_method text,
  _account_id uuid DEFAULT NULL,
  _confirmed_via text DEFAULT 'payments_section',
  _idempotency_key text DEFAULT NULL,
  _transaction_ref text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _issue_voucher boolean DEFAULT false
)
RETURNS public.patient_billing_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_name text;
  v_booking public.bookings;
  v_bill public.patient_billing_records;
  v_existing public.patient_billing_transactions;
  v_idem text := COALESCE(NULLIF(btrim(_idempotency_key), ''), gen_random_uuid()::text);
  v_is_partial boolean := false;
  v_payment_id uuid := gen_random_uuid();
  v_rev_id uuid := gen_random_uuid();
  v_txn public.patient_billing_transactions;
  v_enum_type public.payment_type;
  v_type_detail text;
  v_tx_ref text;
  v_doc_num text;
  v_vch_num text;
  v_cat_id uuid;
  v_cat_name text := 'الكشوفات';
  v_today date := (now() AT TIME ZONE 'Africa/Cairo')::date;
BEGIN
  IF v_uid IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Idempotency short-circuit
  SELECT * INTO v_existing FROM public.patient_billing_transactions WHERE idempotency_key = v_idem LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found' USING ERRCODE = 'P0002';
  END IF;

  -- Ensure billing record exists and lock it
  SELECT * INTO v_bill FROM public.patient_billing_records WHERE booking_id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.patient_billing_records (
      booking_id, patient_id, patient_name, patient_phone, booking_source,
      doctor_id, doctor_name, service_name, appointment_date, booking_created_at,
      original_price, final_amount_due, remaining_balance, booking_status,
      created_by_staff_id, created_by_staff_name, assigned_staff_id, assigned_staff_name
    ) VALUES (
      v_booking.id, v_booking.patient_id, v_booking.patient_name, v_booking.phone,
      COALESCE(v_booking.booking_source, 'website'), v_booking.doctor_id,
      v_booking.doctor_name, v_booking.service, v_booking.date,
      COALESCE(v_booking.created_at, now()),
      public.compute_booking_expected_amount(v_booking.service, v_booking.doctor_id, v_booking.doctor_name),
      public.compute_booking_expected_amount(v_booking.service, v_booking.doctor_id, v_booking.doctor_name),
      public.compute_booking_expected_amount(v_booking.service, v_booking.doctor_id, v_booking.doctor_name),
      CASE WHEN v_booking.status = 'cancelled' THEN 'cancelled' ELSE 'confirmed' END,
      v_booking.created_by_staff_id, v_booking.created_by_staff_name,
      v_booking.assigned_staff_id, v_booking.assigned_staff_name
    );
    SELECT * INTO v_bill FROM public.patient_billing_records WHERE booking_id = _booking_id FOR UPDATE;
  END IF;

  IF v_bill.booking_status = 'cancelled' THEN
    RAISE EXCEPTION 'cannot confirm payment for a cancelled booking' USING ERRCODE = '22023';
  END IF;

  IF v_bill.remaining_balance > 0 AND _amount > v_bill.remaining_balance + 0.01 THEN
    RAISE EXCEPTION 'payment amount exceeds remaining balance' USING ERRCODE = '22023';
  END IF;

  v_is_partial := (v_bill.final_amount_due > 0 AND _amount < v_bill.remaining_balance - 0.01)
                  OR (v_bill.paid_amount > 0);

  IF auth.role() <> 'service_role' THEN
    IF v_is_partial THEN
      IF NOT (
        public.has_patient_billing_permission(v_uid, 'payment_confirm_partial')
        OR public.has_patient_billing_permission(v_uid, 'payment_confirm')
      ) THEN
        RAISE EXCEPTION 'permission denied: payment_confirm_partial required' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NOT public.has_patient_billing_permission(v_uid, 'payment_confirm') THEN
        RAISE EXCEPTION 'permission denied: payment_confirm required' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  SELECT name INTO v_actor_name FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  v_actor_name := COALESCE(NULLIF(btrim(v_actor_name), ''), 'موظف معتمد');

  v_enum_type := CASE
    WHEN _payment_method = 'instapay' THEN 'instapay'::public.payment_type
    WHEN _payment_method = 'wallet' THEN 'wallet'::public.payment_type
    WHEN _payment_method = 'fawry' THEN 'fawry'::public.payment_type
    ELSE 'other'::public.payment_type
  END;

  v_type_detail := CASE _payment_method
    WHEN 'cash' THEN 'نقداً (خزينة)'
    WHEN 'bank_transfer' THEN 'تحويل بنكي'
    WHEN 'card' THEN 'بطاقة بنكية (POS)'
    WHEN 'paymob' THEN 'Paymob / بطاقة إلكترونية'
    WHEN 'instapay' THEN 'InstaPay'
    WHEN 'wallet' THEN 'محفظة إلكترونية'
    ELSE 'أخرى'
  END;

  v_tx_ref := COALESCE(NULLIF(btrim(_transaction_ref), ''), 'PAY-' || to_char(v_today, 'YYYYMMDD') || '-' || upper(substr(replace(v_payment_id::text, '-', ''), 1, 6)));

  PERFORM set_config('app.skip_payment_sync_trigger', '1', true);

  INSERT INTO public.payments (
    id, patient_name, patient_phone, amount, transaction_id,
    payment_type, payment_type_detail, status, booking_id, matched_at,
    notes, account_id, confirmed_by_staff_id, confirmed_by_staff_name,
    is_partial, created_at, updated_at
  ) VALUES (
    v_payment_id,
    v_booking.patient_name,
    v_booking.phone,
    round(_amount, 2),
    v_tx_ref,
    v_enum_type,
    v_type_detail,
    'paid',
    _booking_id::text,
    now(),
    NULLIF(btrim(COALESCE(_notes, '')), ''),
    _account_id,
    v_uid,
    v_actor_name,
    v_is_partial,
    now(),
    now()
  );

  SELECT id, name_ar INTO v_cat_id, v_cat_name
  FROM public.accounting_categories
  WHERE kind = 'revenue' AND code = 'rev_consultations'
  LIMIT 1;

  v_doc_num := 'REV-' || to_char(v_today, 'YYYYMMDD') || '-' || upper(substr(replace(v_rev_id::text, '-', ''), 1, 6));

  INSERT INTO public.accounting_revenues (
    id, doc_number, revenue_date, category_id, category_name, revenue_source,
    description, amount, payment_method, account_id,
    patient_id, patient_name, booking_id, doctor_name, service_name,
    booking_source, contracting_company_id, responsible_staff_id, responsible_staff_name,
    notes, status, source_table, source_id, created_by, created_by_name
  ) VALUES (
    v_rev_id,
    v_doc_num,
    v_today,
    v_cat_id,
    COALESCE(v_cat_name, 'الكشوفات'),
    CASE WHEN v_booking.contracting_company_id IS NOT NULL THEN 'contracting' ELSE 'booking' END,
    'تحصيل حجز ' || v_booking.patient_name || ' - ' || v_booking.doctor_name || ' (' || v_booking.service || ')',
    round(_amount, 2),
    CASE WHEN _payment_method IN ('cash', 'instapay', 'wallet', 'paymob', 'bank_transfer', 'card') THEN _payment_method ELSE 'cash' END,
    _account_id,
    v_bill.patient_id,
    v_booking.patient_name,
    v_booking.id,
    v_booking.doctor_name,
    v_booking.service,
    COALESCE(v_booking.booking_source, 'website'),
    v_booking.contracting_company_id,
    v_uid,
    v_actor_name,
    NULLIF(btrim(COALESCE(_notes, '')), ''),
    'posted',
    'payments',
    v_payment_id::text,
    v_uid,
    v_actor_name
  );

  IF _account_id IS NOT NULL THEN
    INSERT INTO public.accounting_account_transactions (
      account_id, transaction_date, direction, entry_type, amount,
      reference_table, reference_id, description, created_by, created_by_name
    ) VALUES (
      _account_id,
      v_today,
      'in',
      'revenue',
      round(_amount, 2),
      'accounting_revenues',
      v_rev_id,
      v_doc_num || ' - تحصيل حجز ' || v_booking.patient_name,
      v_uid,
      v_actor_name
    );
  END IF;

  IF _issue_voucher THEN
    v_vch_num := 'RCV-' || to_char(v_today, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    INSERT INTO public.accounting_vouchers (
      voucher_kind, voucher_number, voucher_date, party_name, amount,
      reason, payment_method, account_id, affects_account, booking_id,
      patient_id, revenue_id, responsible_staff_id, responsible_staff_name,
      notes, status, created_by, created_by_name
    ) VALUES (
      'receipt',
      v_vch_num,
      v_today,
      v_booking.patient_name,
      round(_amount, 2),
      'سداد حجز ' || v_booking.service || ' - ' || v_booking.doctor_name,
      CASE WHEN _payment_method IN ('cash', 'instapay', 'wallet', 'paymob', 'bank_transfer', 'card', 'other') THEN _payment_method ELSE 'cash' END,
      _account_id,
      false,
      v_booking.id,
      v_bill.patient_id,
      v_rev_id,
      v_uid,
      v_actor_name,
      'مرتبط بالمعاملة ' || v_tx_ref,
      'posted',
      v_uid,
      v_actor_name
    );
  END IF;

  INSERT INTO public.patient_billing_transactions (
    billing_record_id, booking_id, patient_id, payment_id, revenue_id,
    transaction_kind, amount, payment_method, account_id,
    transaction_ref, idempotency_key, confirmed_via,
    confirmed_by_staff_id, confirmed_by_staff_name, notes, status
  ) VALUES (
    v_bill.id,
    v_booking.id,
    v_bill.patient_id,
    v_payment_id,
    v_rev_id,
    'payment',
    round(_amount, 2),
    CASE WHEN _payment_method IN ('cash', 'instapay', 'wallet', 'paymob', 'bank_transfer', 'card', 'other') THEN _payment_method ELSE 'other' END,
    _account_id,
    v_tx_ref,
    v_idem,
    CASE WHEN _confirmed_via IN ('payments_section', 'accounting_section', 'instapay_review', 'paymob_webhook', 'payment_webhook', 'backfill') THEN _confirmed_via ELSE 'payments_section' END,
    v_uid,
    v_actor_name,
    NULLIF(btrim(COALESCE(_notes, '')), ''),
    'confirmed'
  )
  RETURNING * INTO v_txn;

  PERFORM public.recalculate_patient_billing_record(_booking_id);

  INSERT INTO public.clinic_audit_logs (
    actor_user_id, actor_name, module, action, entity_type, entity_id, summary, new_values
  ) VALUES (
    v_uid,
    v_actor_name,
    'accounting',
    'PATIENT_PAYMENT_CONFIRMED',
    'patient_billing_transaction',
    v_txn.id::text,
    'تأكيد استلام دفعة بقيمة ' || round(_amount, 2)::text || ' ج.م للمريض ' || v_booking.patient_name || ' (' || v_tx_ref || ')',
    jsonb_build_object(
      'booking_id', _booking_id,
      'payment_id', v_payment_id,
      'revenue_id', v_rev_id,
      'amount', round(_amount, 2),
      'payment_method', _payment_method,
      'confirmed_via', _confirmed_via
    )
  );

  RETURN v_txn;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_patient_booking_payment(uuid, numeric, text, uuid, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_patient_booking_payment(uuid, numeric, text, uuid, text, text, text, text, boolean) TO authenticated, service_role;

-- Refund or Reversal RPC
CREATE OR REPLACE FUNCTION public.refund_or_reverse_patient_payment(
  _booking_id uuid,
  _mode text,
  _amount numeric,
  _payment_method text DEFAULT 'cash',
  _account_id uuid DEFAULT NULL,
  _reason text DEFAULT '',
  _target_transaction_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS public.patient_billing_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_name text;
  v_bill public.patient_billing_records;
  v_target public.patient_billing_transactions;
  v_existing public.patient_billing_transactions;
  v_idem text := COALESCE(NULLIF(btrim(_idempotency_key), ''), gen_random_uuid()::text);
  v_clean_reason text := btrim(COALESCE(_reason, ''));
  v_available numeric(14,2) := 0;
  v_amt numeric(14,2) := COALESCE(_amount, 0);
  v_txn public.patient_billing_transactions;
  v_today date := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_rev_id uuid;
  v_acc_id uuid;
  v_tx_ref text;
BEGIN
  IF v_uid IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing FROM public.patient_billing_transactions WHERE idempotency_key = v_idem LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  IF v_clean_reason = '' THEN
    RAISE EXCEPTION 'reason is required' USING ERRCODE = '22023';
  END IF;

  IF _mode NOT IN ('refund', 'reversal') THEN
    RAISE EXCEPTION 'invalid mode' USING ERRCODE = '22023';
  END IF;

  IF auth.role() <> 'service_role' THEN
    IF _mode = 'refund' AND NOT public.has_patient_billing_permission(v_uid, 'payment_refund') THEN
      RAISE EXCEPTION 'permission denied: payment_refund required' USING ERRCODE = '42501';
    END IF;
    IF _mode = 'reversal' AND NOT public.has_patient_billing_permission(v_uid, 'payment_reverse') THEN
      RAISE EXCEPTION 'permission denied: payment_reverse required' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_bill FROM public.patient_billing_records WHERE booking_id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing record not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT name INTO v_actor_name FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  v_actor_name := COALESCE(NULLIF(btrim(v_actor_name), ''), 'موظف معتمد');

  PERFORM set_config('app.skip_payment_sync_trigger', '1', true);

  IF _mode = 'reversal' THEN
    IF _target_transaction_id IS NULL THEN
      SELECT * INTO v_target
      FROM public.patient_billing_transactions
      WHERE booking_id = _booking_id AND transaction_kind = 'payment' AND status = 'confirmed'
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    ELSE
      SELECT * INTO v_target
      FROM public.patient_billing_transactions
      WHERE id = _target_transaction_id AND booking_id = _booking_id AND transaction_kind = 'payment' AND status = 'confirmed'
      FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'confirmed payment transaction not found for reversal' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.patient_billing_transactions
    SET
      status = 'reversed',
      reversed_by_staff_id = v_uid,
      reversed_by_staff_name = v_actor_name,
      reversed_at = now(),
      reversal_reason = v_clean_reason
    WHERE id = v_target.id;

    IF v_target.payment_id IS NOT NULL THEN
      UPDATE public.payments
      SET status = 'failed', notes = COALESCE(notes || ' | ', '') || 'عكس معاملة: ' || v_clean_reason, updated_at = now()
      WHERE id = v_target.payment_id;
    END IF;

    v_rev_id := v_target.revenue_id;
    v_acc_id := COALESCE(_account_id, v_target.account_id);
    IF v_rev_id IS NOT NULL THEN
      UPDATE public.accounting_revenues
      SET
        status = 'reversed',
        reversal_reason = v_clean_reason,
        reversed_by = v_uid,
        reversed_by_name = v_actor_name,
        reversed_at = now()
      WHERE id = v_rev_id AND status = 'posted';
    END IF;

    IF v_acc_id IS NOT NULL THEN
      INSERT INTO public.accounting_account_transactions (
        account_id, transaction_date, direction, entry_type, amount,
        reference_table, reference_id, description, created_by, created_by_name
      ) VALUES (
        v_acc_id,
        v_today,
        'out',
        'revenue_reversal',
        v_target.amount,
        'patient_billing_transactions',
        v_target.id,
        'عكس دفعة مريض ' || v_bill.patient_name || ': ' || v_clean_reason,
        v_uid,
        v_actor_name
      );
    END IF;

    v_tx_ref := 'REV-' || to_char(v_today, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    INSERT INTO public.patient_billing_transactions (
      billing_record_id, booking_id, patient_id, payment_id, revenue_id,
      transaction_kind, amount, payment_method, account_id,
      transaction_ref, idempotency_key, confirmed_via,
      confirmed_by_staff_id, confirmed_by_staff_name, notes, status
    ) VALUES (
      v_bill.id, _booking_id, v_bill.patient_id, v_target.payment_id, v_rev_id,
      'reversal', v_target.amount, v_target.payment_method, v_acc_id,
      v_tx_ref, v_idem, 'accounting_section',
      v_uid, v_actor_name, v_clean_reason, 'confirmed'
    )
    RETURNING * INTO v_txn;

  ELSE
    v_available := GREATEST(v_bill.paid_amount - v_bill.refunded_amount, 0);
    IF v_amt <= 0 OR v_amt > v_available + 0.01 THEN
      RAISE EXCEPTION 'refund amount exceeds refundable balance' USING ERRCODE = '22023';
    END IF;

    v_acc_id := _account_id;
    IF v_acc_id IS NULL THEN
      SELECT account_id INTO v_acc_id
      FROM public.patient_billing_transactions
      WHERE booking_id = _booking_id AND transaction_kind = 'payment' AND status = 'confirmed' AND account_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_acc_id IS NOT NULL THEN
      INSERT INTO public.accounting_account_transactions (
        account_id, transaction_date, direction, entry_type, amount,
        reference_table, reference_id, description, created_by, created_by_name
      ) VALUES (
        v_acc_id,
        v_today,
        'out',
        'revenue_reversal',
        round(v_amt, 2),
        'patient_billing_records',
        v_bill.id,
        'استرداد مبلغ للمريض ' || v_bill.patient_name || ': ' || v_clean_reason,
        v_uid,
        v_actor_name
      );
    END IF;

    IF v_amt >= v_available - 0.01 THEN
      UPDATE public.accounting_revenues
      SET
        status = 'reversed',
        reversal_reason = 'استرداد كامل: ' || v_clean_reason,
        reversed_by = v_uid,
        reversed_by_name = v_actor_name,
        reversed_at = now()
      WHERE booking_id = _booking_id AND status = 'posted';
    END IF;

    INSERT INTO public.accounting_vouchers (
      voucher_kind, voucher_number, voucher_date, party_name, amount,
      reason, payment_method, account_id, affects_account, booking_id,
      patient_id, responsible_staff_id, responsible_staff_name,
      notes, status, created_by, created_by_name
    ) VALUES (
      'disbursement',
      'PAY-' || to_char(v_today, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
      v_today,
      v_bill.patient_name,
      round(v_amt, 2),
      'استرداد مبلغ حجز ' || v_bill.service_name || ': ' || v_clean_reason,
      CASE WHEN _payment_method IN ('cash', 'instapay', 'wallet', 'paymob', 'bank_transfer', 'card', 'other') THEN _payment_method ELSE 'cash' END,
      v_acc_id,
      false,
      _booking_id,
      v_bill.patient_id,
      v_uid,
      v_actor_name,
      v_clean_reason,
      'posted',
      v_uid,
      v_actor_name
    );

    v_tx_ref := 'RFD-' || to_char(v_today, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    INSERT INTO public.patient_billing_transactions (
      billing_record_id, booking_id, patient_id, payment_id, revenue_id,
      transaction_kind, amount, payment_method, account_id,
      transaction_ref, idempotency_key, confirmed_via,
      confirmed_by_staff_id, confirmed_by_staff_name, notes, status
    ) VALUES (
      v_bill.id, _booking_id, v_bill.patient_id, NULL, NULL,
      'refund', round(v_amt, 2),
      CASE WHEN _payment_method IN ('cash', 'instapay', 'wallet', 'paymob', 'bank_transfer', 'card', 'other') THEN _payment_method ELSE 'cash' END,
      v_acc_id,
      v_tx_ref, v_idem, 'accounting_section',
      v_uid, v_actor_name, v_clean_reason, 'confirmed'
    )
    RETURNING * INTO v_txn;
  END IF;

  PERFORM public.recalculate_patient_billing_record(_booking_id);

  INSERT INTO public.clinic_audit_logs (
    actor_user_id, actor_name, module, action, entity_type, entity_id, summary, reason
  ) VALUES (
    v_uid,
    v_actor_name,
    'accounting',
    CASE WHEN _mode = 'refund' THEN 'PATIENT_PAYMENT_REFUNDED' ELSE 'PATIENT_PAYMENT_REVERSED' END,
    'patient_billing_transaction',
    v_txn.id::text,
    (CASE WHEN _mode = 'refund' THEN 'استرداد مبلغ ' ELSE 'عكس دفعة بقيمة ' END) || v_txn.amount::text || ' ج.م للمريض ' || v_bill.patient_name,
    v_clean_reason
  );

  RETURN v_txn;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_or_reverse_patient_payment(uuid, text, numeric, text, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_or_reverse_patient_payment(uuid, text, numeric, text, uuid, text, uuid, text) TO authenticated, service_role;

-- Discount RPC
CREATE OR REPLACE FUNCTION public.apply_patient_billing_discount(
  _booking_id uuid,
  _discount numeric,
  _reason text DEFAULT ''
)
RETURNS public.patient_billing_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_name text;
  v_bill public.patient_billing_records;
  v_disc numeric(14,2) := GREATEST(COALESCE(_discount, 0), 0);
BEGIN
  IF v_uid IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.has_patient_billing_permission(v_uid, 'patient_accounts_edit') THEN
    RAISE EXCEPTION 'permission denied: patient_accounts_edit required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bill FROM public.patient_billing_records WHERE booking_id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing record not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_disc > v_bill.original_price THEN
    RAISE EXCEPTION 'discount cannot exceed original price' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_actor_name FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  v_actor_name := COALESCE(NULLIF(btrim(v_actor_name), ''), 'موظف معتمد');

  UPDATE public.patient_billing_records
  SET
    discount_amount = round(v_disc, 2),
    discount_reason = NULLIF(btrim(COALESCE(_reason, '')), ''),
    updated_at = now()
  WHERE id = v_bill.id;

  v_bill := public.recalculate_patient_billing_record(_booking_id);

  INSERT INTO public.clinic_audit_logs (
    actor_user_id, actor_name, module, action, entity_type, entity_id, summary, reason
  ) VALUES (
    v_uid,
    v_actor_name,
    'accounting',
    'PATIENT_BILLING_DISCOUNT_UPDATED',
    'patient_billing_record',
    v_bill.id::text,
    'تعديل خصم حجز المريض ' || v_bill.patient_name || ' إلى ' || round(v_disc, 2)::text || ' ج.م',
    NULLIF(btrim(COALESCE(_reason, '')), '')
  );

  RETURN v_bill;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_patient_billing_discount(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_patient_billing_discount(uuid, numeric, text) TO authenticated, service_role;

-- Idempotent Historical Sync RPC
CREATE OR REPLACE FUNCTION public.sync_all_patient_billing_records()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_b public.bookings;
  v_p public.payments;
  v_price numeric(14,2);
  v_patient_id uuid;
  v_norm_phone text;
  v_bill_id uuid;
  v_rev_id uuid;
  v_method text;
BEGIN
  FOR v_b IN SELECT * FROM public.bookings LOOP
    v_price := public.compute_booking_expected_amount(v_b.service, v_b.doctor_id, v_b.doctor_name);
    v_patient_id := v_b.patient_id;
    IF v_patient_id IS NULL THEN
      v_norm_phone := regexp_replace(COALESCE(v_b.phone, ''), '\D', '', 'g');
      SELECT id INTO v_patient_id
      FROM public.patients
      WHERE regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = v_norm_phone
      LIMIT 1;
    END IF;

    INSERT INTO public.patient_billing_records (
      booking_id, patient_id, patient_name, patient_phone, booking_source,
      doctor_id, doctor_name, service_name, appointment_date, booking_created_at,
      original_price, final_amount_due, remaining_balance, financial_status, booking_status,
      created_by_staff_id, created_by_staff_name, assigned_staff_id, assigned_staff_name
    ) VALUES (
      v_b.id, v_patient_id, v_b.patient_name, v_b.phone, COALESCE(v_b.booking_source, 'website'),
      v_b.doctor_id, v_b.doctor_name, v_b.service, v_b.date, COALESCE(v_b.created_at, now()),
      v_price, v_price, CASE WHEN v_b.status = 'cancelled' THEN 0 ELSE v_price END,
      CASE WHEN v_b.status = 'cancelled' THEN 'ملغي' ELSE 'غير مدفوع' END,
      CASE WHEN v_b.status = 'cancelled' THEN 'cancelled' ELSE 'confirmed' END,
      v_b.created_by_staff_id, v_b.created_by_staff_name, v_b.assigned_staff_id, v_b.assigned_staff_name
    )
    ON CONFLICT (booking_id) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  FOR v_p IN
    SELECT * FROM public.payments
    WHERE status = 'paid'
      AND booking_id IS NOT NULL
      AND booking_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    SELECT id, patient_id INTO v_bill_id, v_patient_id
    FROM public.patient_billing_records
    WHERE booking_id = v_p.booking_id::uuid
    LIMIT 1;

    IF v_bill_id IS NOT NULL THEN
      SELECT id INTO v_rev_id
      FROM public.accounting_revenues
      WHERE source_table = 'payments' AND source_id = v_p.id::text AND status = 'posted'
      LIMIT 1;

      v_method := CASE
        WHEN v_p.payment_type = 'instapay' THEN 'instapay'
        WHEN v_p.payment_type = 'wallet' THEN 'wallet'
        WHEN COALESCE(v_p.payment_type_detail, '') ILIKE '%paymob%' THEN 'paymob'
        WHEN COALESCE(v_p.payment_type_detail, '') ILIKE '%نقد%' THEN 'cash'
        WHEN COALESCE(v_p.payment_type_detail, '') ILIKE '%بنك%' THEN 'bank_transfer'
        WHEN COALESCE(v_p.payment_type_detail, '') ILIKE '%بطاقة%' THEN 'card'
        ELSE 'other'
      END;

      INSERT INTO public.patient_billing_transactions (
        billing_record_id, booking_id, patient_id, payment_id, revenue_id,
        transaction_kind, amount, payment_method, account_id,
        transaction_ref, idempotency_key, confirmed_via,
        confirmed_by_staff_id, confirmed_by_staff_name, notes, status, created_at
      ) VALUES (
        v_bill_id, v_p.booking_id::uuid, v_patient_id, v_p.id, v_rev_id,
        'payment', v_p.amount, v_method, v_p.account_id,
        COALESCE(NULLIF(btrim(v_p.transaction_id), ''), 'PAY-' || substr(v_p.id::text, 1, 8)),
        'payment:' || v_p.id::text,
        'backfill',
        v_p.confirmed_by_staff_id,
        COALESCE(NULLIF(btrim(v_p.confirmed_by_staff_name), ''), 'ترحيل تاريخي'),
        v_p.notes,
        'confirmed',
        COALESCE(v_p.matched_at, v_p.created_at, now())
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END LOOP;

  FOR v_b IN SELECT * FROM public.bookings LOOP
    PERFORM public.recalculate_patient_billing_record(v_b.id);
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_all_patient_billing_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_all_patient_billing_records() TO authenticated, service_role;

-- Backfill existing data cleanly without duplicates
SELECT public.sync_all_patient_billing_records();

-- ---------------------------------------------------------------------------
-- 6. Realtime Publication & Migration Tracking
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patient_billing_records',
    'patient_billing_transactions'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('ops.applied_migrations') IS NOT NULL THEN
    INSERT INTO ops.applied_migrations (name)
    VALUES ('0024_unified_patient_billing_and_payment_sync.sql')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
