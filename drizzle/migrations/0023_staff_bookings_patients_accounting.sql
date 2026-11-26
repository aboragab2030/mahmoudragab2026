-- Staff Booking Management + Patient Registry + Independent Accounting System + Granular RBAC
-- Additive migration 0023: preserves all existing tables, public booking workflows, and payment systems.

-- ---------------------------------------------------------------------------
-- 1. Granular Permission Helper Functions (Patient, Staff Booking, Accounting)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_patient_permission(_uid uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_uid, 'admin') OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _uid
      AND p.is_active IS NOT FALSE
      AND public.is_staff_or_admin(_uid)
      AND (
        COALESCE(p.permissions, '[]'::jsonb) ? _perm
        OR (
          COALESCE(p.permissions, '[]'::jsonb) ? 'manage_bookings'
          AND _perm IN ('patients_view', 'patients_search', 'patients_view_history')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_staff_booking_permission(_uid uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_uid, 'admin') OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _uid
      AND p.is_active IS NOT FALSE
      AND public.is_staff_or_admin(_uid)
      AND (
        COALESCE(p.permissions, '[]'::jsonb) ? _perm
        OR (
          COALESCE(p.permissions, '[]'::jsonb) ? 'manage_bookings'
          AND _perm IN (
            'staff_bookings_view',
            'staff_bookings_edit',
            'staff_bookings_cancel',
            'staff_bookings_view_all'
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_accounting_permission(_uid uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_uid, 'admin') OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _uid
      AND p.is_active IS NOT FALSE
      AND public.is_staff_or_admin(_uid)
      AND (
        COALESCE(p.permissions, '[]'::jsonb) ? _perm
        OR (
          COALESCE(p.permissions, '[]'::jsonb) ? 'accounting_manage'
          AND _perm NOT IN (
            'accounting_manage_opening_balances',
            'accounting_manage_settings',
            'accounting_view_sensitive_data'
          )
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Patients Registry Table + Backfill from Existing Bookings & Operations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_number TEXT UNIQUE,
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  phone TEXT NOT NULL CHECK (char_length(trim(phone)) >= 8),
  phone2 TEXT,
  national_id TEXT,
  email TEXT,
  age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 130)),
  governorate TEXT,
  center TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_staff_id UUID,
  created_by_staff_name TEXT,
  updated_by_staff_id UUID,
  updated_by_staff_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS patients_phone_unique_idx
  ON public.patients (regexp_replace(trim(phone), '[^0-9]', '', 'g'));

CREATE INDEX IF NOT EXISTS patients_name_search_idx
  ON public.patients (lower(full_name));

CREATE INDEX IF NOT EXISTS patients_phone2_idx
  ON public.patients (phone2);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff read patients" ON public.patients;
CREATE POLICY "Authorized staff read patients"
  ON public.patients FOR SELECT TO authenticated
  USING (
    public.has_patient_permission(auth.uid(), 'patients_view')
    OR public.has_patient_permission(auth.uid(), 'patients_search')
    OR public.has_patient_permission(auth.uid(), 'patients_view_history')
    OR public.has_staff_booking_permission(auth.uid(), 'staff_bookings_view')
    OR public.has_staff_booking_permission(auth.uid(), 'staff_bookings_create')
    OR public.has_accounting_permission(auth.uid(), 'accounting_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_revenue_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_receipts_view')
  );

DROP POLICY IF EXISTS "Authorized staff insert patients" ON public.patients;
CREATE POLICY "Authorized staff insert patients"
  ON public.patients FOR INSERT TO authenticated
  WITH CHECK (
    public.has_patient_permission(auth.uid(), 'patients_create')
    OR public.has_staff_booking_permission(auth.uid(), 'staff_bookings_create')
  );

DROP POLICY IF EXISTS "Authorized staff update patients" ON public.patients;
CREATE POLICY "Authorized staff update patients"
  ON public.patients FOR UPDATE TO authenticated
  USING (public.has_patient_permission(auth.uid(), 'patients_edit'))
  WITH CHECK (public.has_patient_permission(auth.uid(), 'patients_edit'));

DROP POLICY IF EXISTS "Admins delete patients" ON public.patients;
CREATE POLICY "Admins delete patients"
  ON public.patients FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Backfill existing unique patients from historical bookings without altering existing booking data
WITH distinct_patients AS (
  SELECT DISTINCT ON (regexp_replace(trim(b.phone), '[^0-9]', '', 'g'))
    b.patient_name,
    regexp_replace(trim(b.phone), '[^0-9]', '', 'g') AS norm_phone,
    b.phone2,
    b.patient_email,
    b.age,
    b.governorate,
    b.center,
    b.address,
    b.created_at
  FROM public.bookings b
  WHERE trim(COALESCE(b.phone, '')) <> ''
    AND char_length(regexp_replace(trim(b.phone), '[^0-9]', '', 'g')) >= 8
  ORDER BY regexp_replace(trim(b.phone), '[^0-9]', '', 'g'), b.created_at DESC
)
INSERT INTO public.patients (
  file_number,
  full_name,
  phone,
  phone2,
  email,
  age,
  governorate,
  center,
  address,
  created_by_staff_name,
  created_at,
  updated_at
)
SELECT
  'PAT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  dp.patient_name,
  dp.norm_phone,
  NULLIF(trim(COALESCE(dp.phone2, '')), ''),
  NULLIF(trim(COALESCE(dp.patient_email, '')), ''),
  dp.age,
  NULLIF(trim(COALESCE(dp.governorate, '')), ''),
  NULLIF(trim(COALESCE(dp.center, '')), ''),
  NULLIF(trim(COALESCE(dp.address, '')), ''),
  'ترحيل تلقائي',
  dp.created_at,
  now()
FROM distinct_patients dp
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Bookings Staff Tracking & Source Extension (Backward Compatible)
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_source TEXT NOT NULL DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS created_by_staff_id UUID,
  ADD COLUMN IF NOT EXISTS created_by_staff_name TEXT,
  ADD COLUMN IF NOT EXISTS assigned_staff_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_staff_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_staff_id UUID,
  ADD COLUMN IF NOT EXISTS updated_by_staff_name TEXT,
  ADD COLUMN IF NOT EXISTS override_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookings_booking_source_chk'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_booking_source_chk
      CHECK (booking_source IN ('website', 'staff', 'admin'));
  END IF;
END $$;

UPDATE public.bookings b
SET patient_id = p.id
FROM public.patients p
WHERE b.patient_id IS NULL
  AND regexp_replace(trim(b.phone), '[^0-9]', '', 'g') = regexp_replace(trim(p.phone), '[^0-9]', '', 'g');

CREATE INDEX IF NOT EXISTS bookings_source_staff_idx
  ON public.bookings (booking_source, created_by_staff_id, assigned_staff_id, date);

CREATE INDEX IF NOT EXISTS bookings_patient_id_idx
  ON public.bookings (patient_id);

-- Replace bookings RLS with granular employee scope + strict override enforcement
DROP POLICY IF EXISTS "Anyone can insert bookings" ON public.bookings;
CREATE POLICY "Anyone can insert bookings"
  ON public.bookings FOR INSERT TO anon, authenticated
  WITH CHECK (
    (
      COALESCE(booking_source, 'website') = 'website'
      AND created_by_staff_id IS NULL
      AND NULLIF(trim(COALESCE(override_reason, '')), '') IS NULL
    )
    OR (
      auth.role() = 'authenticated'
      AND booking_source IN ('staff', 'admin')
      AND public.has_staff_booking_permission(auth.uid(), 'staff_bookings_create')
      AND (
        NULLIF(trim(COALESCE(override_reason, '')), '') IS NULL
        OR public.has_staff_booking_permission(auth.uid(), 'staff_bookings_override_rules')
      )
    )
  );

DROP POLICY IF EXISTS "Staff can read all bookings" ON public.bookings;
CREATE POLICY "Staff can read all bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_active IS NOT FALSE
        AND public.is_staff_or_admin(auth.uid())
        AND (
          COALESCE(p.permissions, '[]'::jsonb) ?| ARRAY[
            'manage_bookings',
            'staff_bookings_view_all',
            'view_overview',
            'view_reports',
            'manage_reminders',
            'view_intelligence',
            'manage_payments',
            'review_instapay',
            'partners_view_referrals',
            'partners_view_revenue',
            'accounting_view',
            'accounting_revenue_view',
            'accounting_reports_view'
          ]
        )
    )
    OR (
      (
        public.has_staff_booking_permission(auth.uid(), 'staff_bookings_view_own')
        OR public.has_staff_booking_permission(auth.uid(), 'staff_bookings_view')
      )
      AND (created_by_staff_id = auth.uid() OR assigned_staff_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff can update bookings" ON public.bookings;
CREATE POLICY "Staff can update bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_staff_booking_permission(auth.uid(), 'manage_bookings')
    OR public.has_staff_booking_permission(auth.uid(), 'staff_bookings_edit')
    OR public.has_staff_booking_permission(auth.uid(), 'staff_bookings_cancel')
    OR public.has_staff_booking_permission(auth.uid(), 'staff_bookings_assign_employee')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_staff_booking_permission(auth.uid(), 'manage_bookings')
    OR public.has_staff_booking_permission(auth.uid(), 'staff_bookings_edit')
    OR public.has_staff_booking_permission(auth.uid(), 'staff_bookings_cancel')
    OR public.has_staff_booking_permission(auth.uid(), 'staff_bookings_assign_employee')
  );

DROP POLICY IF EXISTS "Admin can delete bookings" ON public.bookings;
CREATE POLICY "Admin can delete bookings"
  ON public.bookings FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_staff_booking_permission(auth.uid(), 'staff_bookings_delete')
  );

-- ---------------------------------------------------------------------------
-- 4. Clinic Audit Log Table (Booking Overrides, Patients, Accounting)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID DEFAULT auth.uid(),
  actor_name TEXT NOT NULL DEFAULT 'SYSTEM',
  module TEXT NOT NULL CHECK (module IN ('bookings', 'patients', 'accounting', 'permissions', 'system')),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  reason TEXT,
  previous_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinic_audit_logs_module_created_idx
  ON public.clinic_audit_logs (module, created_at DESC);

GRANT SELECT, INSERT ON public.clinic_audit_logs TO authenticated;
GRANT ALL ON public.clinic_audit_logs TO service_role;
ALTER TABLE public.clinic_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff read clinic_audit_logs" ON public.clinic_audit_logs;
CREATE POLICY "Authorized staff read clinic_audit_logs"
  ON public.clinic_audit_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (module = 'accounting' AND (
      public.has_accounting_permission(auth.uid(), 'accounting_view')
      OR public.has_accounting_permission(auth.uid(), 'accounting_manage')
      OR public.has_accounting_permission(auth.uid(), 'accounting_reports_view')
    ))
    OR (module = 'bookings' AND public.has_staff_booking_permission(auth.uid(), 'staff_bookings_view'))
    OR (module = 'patients' AND public.has_patient_permission(auth.uid(), 'patients_view'))
  );

DROP POLICY IF EXISTS "Staff insert clinic_audit_logs" ON public.clinic_audit_logs;
CREATE POLICY "Staff insert clinic_audit_logs"
  ON public.clinic_audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff_or_admin(auth.uid())
    AND (actor_user_id IS NULL OR actor_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. Update Doctor Capacity Trigger with Audited Staff Override Permission
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_doctor_hourly_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id uuid;
  v_capacity integer;
  v_daily integer;
  v_count integer;
  v_day_count integer;
  v_hour text;
  v_period text;
  v_has_override boolean := false;
BEGIN
  -- Validate booking_source & override permission regardless of status
  IF COALESCE(NEW.booking_source, 'website') IN ('staff', 'admin') THEN
    IF auth.role() <> 'service_role' AND NOT public.has_staff_booking_permission(auth.uid(), 'staff_bookings_create') AND TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'permission denied: staff_bookings_create required' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(trim(COALESCE(NEW.override_reason, '')), '') IS NOT NULL THEN
      IF auth.role() <> 'service_role' AND NOT public.has_staff_booking_permission(auth.uid(), 'staff_bookings_override_rules') THEN
        RAISE EXCEPTION 'permission denied: staff_bookings_override_rules required' USING ERRCODE = '42501';
      END IF;
      v_has_override := true;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND COALESCE(NEW.booking_source, 'website') IN ('staff', 'admin') THEN
    NEW.created_by_staff_id := COALESCE(NEW.created_by_staff_id, auth.uid());
    NEW.updated_by_staff_id := auth.uid();
  ELSIF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL THEN
    NEW.updated_by_staff_id := auth.uid();
    NEW.updated_at := now();
  END IF;

  IF NEW.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;

  IF v_has_override THEN
    INSERT INTO public.clinic_audit_logs (
      actor_user_id,
      actor_name,
      module,
      action,
      entity_type,
      entity_id,
      summary,
      reason,
      new_values
    ) VALUES (
      auth.uid(),
      COALESCE(NULLIF(trim(NEW.updated_by_staff_name), ''), NULLIF(trim(NEW.created_by_staff_name), ''), 'موظف'),
      'bookings',
      'BOOKING_RULE_OVERRIDE',
      'booking',
      NEW.id::text,
      'استثناء قيود الحجز للمريض ' || NEW.patient_name || ' (' || NEW.date || ' ' || NEW.time || ')',
      trim(NEW.override_reason),
      jsonb_build_object(
        'doctor_name', NEW.doctor_name,
        'date', NEW.date,
        'time', NEW.time,
        'booking_source', NEW.booking_source
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'confirmed'
     AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
     AND NEW.doctor_name IS NOT DISTINCT FROM OLD.doctor_name
     AND NEW.date IS NOT DISTINCT FROM OLD.date
     AND NEW.time IS NOT DISTINCT FROM OLD.time THEN
    RETURN NEW;
  END IF;

  IF NEW.doctor_id IS NOT NULL THEN
    SELECT id, patients_per_hour, max_patients INTO v_doctor_id, v_capacity, v_daily
    FROM public.doctors WHERE id = NEW.doctor_id FOR UPDATE;
  ELSE
    SELECT id, patients_per_hour, max_patients INTO v_doctor_id, v_capacity, v_daily
    FROM public.doctors WHERE name = NEW.doctor_name
    ORDER BY created_at LIMIT 1 FOR UPDATE;
  END IF;

  IF v_doctor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_daily IS NOT NULL AND v_daily > 0 THEN
    SELECT count(*) INTO v_day_count
    FROM public.bookings b
    WHERE b.status = 'confirmed'
      AND b.date = NEW.date
      AND b.id <> NEW.id
      AND (b.doctor_id = v_doctor_id OR (b.doctor_id IS NULL AND b.doctor_name = NEW.doctor_name));
    IF v_day_count >= v_daily THEN
      RAISE EXCEPTION 'DOCTOR_DAY_FULL' USING ERRCODE = 'P0001',
        HINT = 'اكتمل الحد الأقصى لعدد المرضى لهذا الطبيب في هذا اليوم';
    END IF;
  END IF;

  IF v_capacity IS NULL OR v_capacity <= 0 THEN
    RETURN NEW;
  END IF;

  v_hour := split_part(trim(NEW.time), ':', 1);
  v_period := split_part(trim(NEW.time), ' ', 2);

  SELECT count(*) INTO v_count
  FROM public.bookings b
  WHERE b.status = 'confirmed'
    AND b.date = NEW.date
    AND b.id <> NEW.id
    AND (b.doctor_id = v_doctor_id OR (b.doctor_id IS NULL AND b.doctor_name = NEW.doctor_name))
    AND split_part(trim(b.time), ':', 1) = v_hour
    AND split_part(trim(b.time), ' ', 2) = v_period;

  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'DOCTOR_HOUR_FULL' USING ERRCODE = 'P0001',
      HINT = 'اكتملت سعة الطبيب في هذه الساعة';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_doctor_hourly_capacity() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Independent Accounting Module Schema
-- ---------------------------------------------------------------------------

-- 6.1 Configurable Categories (No Fake Money)
CREATE TABLE IF NOT EXISTS public.accounting_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('revenue', 'expense')),
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL CHECK (char_length(trim(name_ar)) > 0),
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 100,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.accounting_categories (kind, code, name_ar, is_system, display_order) VALUES
  ('revenue', 'rev_consultations', 'الكشوفات', true, 1),
  ('revenue', 'rev_surgeries', 'العمليات الجراحية', true, 2),
  ('revenue', 'rev_procedures', 'الإجراءات الطبية والفحوصات', true, 3),
  ('revenue', 'rev_followups', 'المتابعات', true, 4),
  ('revenue', 'rev_offers', 'العروض الطبية', true, 5),
  ('revenue', 'rev_contracting', 'جهات التعاقد والتأمين', true, 6),
  ('revenue', 'rev_other', 'إيرادات أخرى', true, 7),
  ('expense', 'exp_salaries', 'رواتب وأجور', true, 1),
  ('expense', 'exp_rent', 'إيجار', true, 2),
  ('expense', 'exp_medical_supplies', 'مستلزمات طبية', true, 3),
  ('expense', 'exp_equipment_maintenance', 'أجهزة وصيانة', true, 4),
  ('expense', 'exp_marketing', 'تسويق وإعلان', true, 5),
  ('expense', 'exp_utilities', 'كهرباء ومرافق وإنترنت', true, 6),
  ('expense', 'exp_hospitality', 'نظافة وضيافة', true, 7),
  ('expense', 'exp_admin', 'مصروفات إدارية', true, 8),
  ('expense', 'exp_other', 'مصروفات أخرى', true, 9)
ON CONFLICT (code) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_categories TO authenticated;
GRANT ALL ON public.accounting_categories TO service_role;
ALTER TABLE public.accounting_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accounting users read categories" ON public.accounting_categories;
CREATE POLICY "Accounting users read categories"
  ON public.accounting_categories FOR SELECT TO authenticated
  USING (
    public.has_accounting_permission(auth.uid(), 'accounting_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_revenue_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_revenue_create')
    OR public.has_accounting_permission(auth.uid(), 'accounting_expenses_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_expenses_create')
    OR public.has_accounting_permission(auth.uid(), 'accounting_reports_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage_categories')
  );

DROP POLICY IF EXISTS "Accounting admins manage categories" ON public.accounting_categories;
CREATE POLICY "Accounting admins manage categories"
  ON public.accounting_categories FOR ALL TO authenticated
  USING (public.has_accounting_permission(auth.uid(), 'accounting_manage_categories'))
  WITH CHECK (public.has_accounting_permission(auth.uid(), 'accounting_manage_categories'));

-- 6.2 Accounting Settings
CREATE TABLE IF NOT EXISTS public.accounting_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  clinic_tax_number TEXT,
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  require_expense_approval BOOLEAN NOT NULL DEFAULT false,
  lock_before_date DATE,
  default_currency TEXT NOT NULL DEFAULT 'EGP',
  voucher_notes_footer TEXT,
  updated_by UUID,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.accounting_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.accounting_settings TO authenticated;
GRANT ALL ON public.accounting_settings TO service_role;
ALTER TABLE public.accounting_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accounting users read settings" ON public.accounting_settings;
CREATE POLICY "Accounting users read settings"
  ON public.accounting_settings FOR SELECT TO authenticated
  USING (
    public.has_accounting_permission(auth.uid(), 'accounting_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage_settings')
  );

DROP POLICY IF EXISTS "Accounting settings managers write" ON public.accounting_settings;
CREATE POLICY "Accounting settings managers write"
  ON public.accounting_settings FOR ALL TO authenticated
  USING (public.has_accounting_permission(auth.uid(), 'accounting_manage_settings'))
  WITH CHECK (public.has_accounting_permission(auth.uid(), 'accounting_manage_settings'));

-- 6.3 Cashboxes & Bank Accounts (Starts Empty — No Fake Balances)
CREATE TABLE IF NOT EXISTS public.accounting_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type TEXT NOT NULL CHECK (account_type IN ('cashbox', 'bank')),
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  code TEXT UNIQUE,
  bank_name TEXT,
  account_number TEXT,
  currency TEXT NOT NULL DEFAULT 'EGP',
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_balance_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Cairo')::date),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_by_name TEXT,
  updated_by UUID,
  updated_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_accounts TO authenticated;
GRANT ALL ON public.accounting_accounts TO service_role;
ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accounting users read accounts" ON public.accounting_accounts;
CREATE POLICY "Accounting users read accounts"
  ON public.accounting_accounts FOR SELECT TO authenticated
  USING (
    public.has_accounting_permission(auth.uid(), 'accounting_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_accounts_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_accounts_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_revenue_create')
    OR public.has_accounting_permission(auth.uid(), 'accounting_expenses_pay')
    OR public.has_accounting_permission(auth.uid(), 'accounting_transfers_create')
    OR public.has_accounting_permission(auth.uid(), 'accounting_receipts_create')
    OR public.has_accounting_permission(auth.uid(), 'accounting_disbursements_create')
    OR public.has_accounting_permission(auth.uid(), 'accounting_reports_view')
  );

DROP POLICY IF EXISTS "Authorized staff insert accounting_accounts" ON public.accounting_accounts;
CREATE POLICY "Authorized staff insert accounting_accounts"
  ON public.accounting_accounts FOR INSERT TO authenticated
  WITH CHECK (
    public.has_accounting_permission(auth.uid(), 'accounting_accounts_manage')
    AND (
      opening_balance = 0
      OR public.has_accounting_permission(auth.uid(), 'accounting_manage_opening_balances')
    )
  );

DROP POLICY IF EXISTS "Authorized staff update accounting_accounts" ON public.accounting_accounts;
CREATE POLICY "Authorized staff update accounting_accounts"
  ON public.accounting_accounts FOR UPDATE TO authenticated
  USING (
    public.has_accounting_permission(auth.uid(), 'accounting_accounts_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage_opening_balances')
  )
  WITH CHECK (
    public.has_accounting_permission(auth.uid(), 'accounting_accounts_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage_opening_balances')
  );

DROP POLICY IF EXISTS "Admins delete accounting_accounts" ON public.accounting_accounts;
CREATE POLICY "Admins delete accounting_accounts"
  ON public.accounting_accounts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.enforce_opening_balance_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.opening_balance IS DISTINCT FROM OLD.opening_balance THEN
    IF NOT public.has_accounting_permission(auth.uid(), 'accounting_manage_opening_balances') THEN
      RAISE EXCEPTION 'permission denied: accounting_manage_opening_balances required' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_opening_balance_permission ON public.accounting_accounts;
CREATE TRIGGER trg_enforce_opening_balance_permission
  BEFORE UPDATE ON public.accounting_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_opening_balance_permission();

-- 6.4 Revenues
CREATE TABLE IF NOT EXISTS public.accounting_revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_number TEXT NOT NULL UNIQUE,
  revenue_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Cairo')::date),
  category_id UUID REFERENCES public.accounting_categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL,
  revenue_source TEXT NOT NULL DEFAULT 'direct' CHECK (revenue_source IN ('booking', 'operation', 'direct', 'contracting', 'offer', 'other')),
  description TEXT NOT NULL CHECK (char_length(trim(description)) > 0),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'instapay', 'wallet', 'paymob', 'bank_transfer', 'card')),
  account_id UUID REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name TEXT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  operation_id UUID REFERENCES public.operations(id) ON DELETE SET NULL,
  doctor_name TEXT,
  service_name TEXT,
  booking_source TEXT,
  contracting_company_id INTEGER REFERENCES public.contracting_companies(id) ON DELETE SET NULL,
  responsible_staff_id UUID,
  responsible_staff_name TEXT,
  notes TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  reversal_reason TEXT,
  reversed_by UUID,
  reversed_by_name TEXT,
  reversed_at TIMESTAMPTZ,
  source_table TEXT,
  source_id TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_by_name TEXT,
  updated_by UUID DEFAULT auth.uid(),
  updated_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent double-counting any booking payment / operation / external payment source
CREATE UNIQUE INDEX IF NOT EXISTS accounting_revenues_source_unique_idx
  ON public.accounting_revenues (source_table, source_id)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL AND status = 'posted';

CREATE INDEX IF NOT EXISTS accounting_revenues_date_status_idx
  ON public.accounting_revenues (revenue_date DESC, status, account_id);

CREATE INDEX IF NOT EXISTS accounting_revenues_booking_idx
  ON public.accounting_revenues (booking_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_revenues TO authenticated;
GRANT ALL ON public.accounting_revenues TO service_role;
ALTER TABLE public.accounting_revenues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accounting users read revenues" ON public.accounting_revenues;
CREATE POLICY "Accounting users read revenues"
  ON public.accounting_revenues FOR SELECT TO authenticated
  USING (
    public.has_accounting_permission(auth.uid(), 'accounting_revenue_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_reports_view')
  );

DROP POLICY IF EXISTS "Accounting users insert revenues" ON public.accounting_revenues;
CREATE POLICY "Accounting users insert revenues"
  ON public.accounting_revenues FOR INSERT TO authenticated
  WITH CHECK (public.has_accounting_permission(auth.uid(), 'accounting_revenue_create'));

DROP POLICY IF EXISTS "Accounting users update revenues" ON public.accounting_revenues;
CREATE POLICY "Accounting users update revenues"
  ON public.accounting_revenues FOR UPDATE TO authenticated
  USING (
    public.has_accounting_permission(auth.uid(), 'accounting_revenue_edit')
    OR public.has_accounting_permission(auth.uid(), 'accounting_revenue_delete')
  )
  WITH CHECK (
    public.has_accounting_permission(auth.uid(), 'accounting_revenue_edit')
    OR public.has_accounting_permission(auth.uid(), 'accounting_revenue_delete')
  );

DROP POLICY IF EXISTS "Admins delete draft revenues" ON public.accounting_revenues;
CREATE POLICY "Admins delete draft revenues"
  ON public.accounting_revenues FOR DELETE TO authenticated
  USING (false); -- Posted revenues are reversed, never silently deleted

-- 6.5 Expenses & Expense Partial/Full Payments
CREATE TABLE IF NOT EXISTS public.accounting_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_number TEXT NOT NULL UNIQUE,
  expense_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Cairo')::date),
  category_id UUID REFERENCES public.accounting_categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL,
  description TEXT NOT NULL CHECK (char_length(trim(description)) > 0),
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount > 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  remaining_amount NUMERIC(14,2) GENERATED ALWAYS AS (GREATEST(total_amount - paid_amount, 0)) STORED,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'instapay', 'wallet', 'bank_transfer', 'card', 'other')),
  account_id UUID REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  beneficiary TEXT NOT NULL CHECK (char_length(trim(beneficiary)) > 0),
  invoice_number TEXT,
  responsible_staff_id UUID,
  responsible_staff_name TEXT,
  approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  reversal_reason TEXT,
  reversed_by UUID,
  reversed_by_name TEXT,
  reversed_at TIMESTAMPTZ,
  created_by UUID DEFAULT auth.uid(),
  created_by_name TEXT,
  updated_by UUID DEFAULT auth.uid(),
  updated_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT accounting_expenses_paid_le_total_chk CHECK (paid_amount <= total_amount)
);

CREATE INDEX IF NOT EXISTS accounting_expenses_date_status_idx
  ON public.accounting_expenses (expense_date DESC, status, payment_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_expenses TO authenticated;
GRANT ALL ON public.accounting_expenses TO service_role;
ALTER TABLE public.accounting_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accounting users read expenses" ON public.accounting_expenses;
CREATE POLICY "Accounting users read expenses"
  ON public.accounting_expenses FOR SELECT TO authenticated
  USING (
    public.has_accounting_permission(auth.uid(), 'accounting_expenses_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_reports_view')
  );

DROP POLICY IF EXISTS "Accounting users insert expenses" ON public.accounting_expenses;
CREATE POLICY "Accounting users insert expenses"
  ON public.accounting_expenses FOR INSERT TO authenticated
  WITH CHECK (public.has_accounting_permission(auth.uid(), 'accounting_expenses_create'));

DROP POLICY IF EXISTS "Accounting users update expenses" ON public.accounting_expenses;
CREATE POLICY "Accounting users update expenses"
  ON public.accounting_expenses FOR UPDATE TO authenticated
  USING (
    public.has_accounting_permission(auth.uid(), 'accounting_expenses_edit')
    OR public.has_accounting_permission(auth.uid(), 'accounting_expenses_pay')
    OR public.has_accounting_permission(auth.uid(), 'accounting_expenses_delete')
  )
  WITH CHECK (
    public.has_accounting_permission(auth.uid(), 'accounting_expenses_edit')
    OR public.has_accounting_permission(auth.uid(), 'accounting_expenses_pay')
    OR public.has_accounting_permission(auth.uid(), 'accounting_expenses_delete')
  );

DROP POLICY IF EXISTS "Accounting expenses never silently deleted" ON public.accounting_expenses;
CREATE POLICY "Accounting expenses never silently deleted"
  ON public.accounting_expenses FOR DELETE TO authenticated
  USING (false);

CREATE TABLE IF NOT EXISTS public.accounting_expense_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.accounting_expenses(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Cairo')::date),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'instapay', 'wallet', 'bank_transfer', 'card', 'other')),
  account_id UUID NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  created_by UUID DEFAULT auth.uid(),
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.accounting_expense_payments TO authenticated;
GRANT ALL ON public.accounting_expense_payments TO service_role;
ALTER TABLE public.accounting_expense_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accounting users read expense payments" ON public.accounting_expense_payments;
CREATE POLICY "Accounting users read expense payments"
  ON public.accounting_expense_payments FOR SELECT TO authenticated
  USING (
    public.has_accounting_permission(auth.uid(), 'accounting_expenses_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_reports_view')
  );

DROP POLICY IF EXISTS "Accounting users insert expense payments" ON public.accounting_expense_payments;
CREATE POLICY "Accounting users insert expense payments"
  ON public.accounting_expense_payments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_accounting_permission(auth.uid(), 'accounting_expenses_pay')
    OR public.has_accounting_permission(auth.uid(), 'accounting_expenses_create')
  );

DROP POLICY IF EXISTS "Accounting users reverse expense payments" ON public.accounting_expense_payments;
CREATE POLICY "Accounting users reverse expense payments"
  ON public.accounting_expense_payments FOR UPDATE TO authenticated
  USING (public.has_accounting_permission(auth.uid(), 'accounting_expenses_delete'))
  WITH CHECK (public.has_accounting_permission(auth.uid(), 'accounting_expenses_delete'));

-- 6.6 Transfers Between Accounts (Not Revenue, Not Expense)
CREATE TABLE IF NOT EXISTS public.accounting_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number TEXT NOT NULL UNIQUE,
  transfer_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Cairo')::date),
  from_account_id UUID NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  to_account_id UUID NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  reversal_reason TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT accounting_transfers_distinct_accounts_chk CHECK (from_account_id <> to_account_id)
);

GRANT SELECT, INSERT, UPDATE ON public.accounting_transfers TO authenticated;
GRANT ALL ON public.accounting_transfers TO service_role;
ALTER TABLE public.accounting_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accounting users read transfers" ON public.accounting_transfers;
CREATE POLICY "Accounting users read transfers"
  ON public.accounting_transfers FOR SELECT TO authenticated
  USING (
    public.has_accounting_permission(auth.uid(), 'accounting_accounts_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_reports_view')
  );

DROP POLICY IF EXISTS "Accounting users create transfers" ON public.accounting_transfers;
CREATE POLICY "Accounting users create transfers"
  ON public.accounting_transfers FOR INSERT TO authenticated
  WITH CHECK (public.has_accounting_permission(auth.uid(), 'accounting_transfers_create'));

DROP POLICY IF EXISTS "Accounting users reverse transfers" ON public.accounting_transfers;
CREATE POLICY "Accounting users reverse transfers"
  ON public.accounting_transfers FOR UPDATE TO authenticated
  USING (public.has_accounting_permission(auth.uid(), 'accounting_accounts_manage'))
  WITH CHECK (public.has_accounting_permission(auth.uid(), 'accounting_accounts_manage'));

-- 6.7 Receipt & Disbursement Vouchers (سند قبض / سند صرف)
CREATE TABLE IF NOT EXISTS public.accounting_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_kind TEXT NOT NULL CHECK (voucher_kind IN ('receipt', 'disbursement')),
  voucher_number TEXT NOT NULL UNIQUE,
  voucher_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Cairo')::date),
  party_name TEXT NOT NULL CHECK (char_length(trim(party_name)) > 0),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'instapay', 'wallet', 'paymob', 'bank_transfer', 'card', 'other')),
  account_id UUID REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  affects_account BOOLEAN NOT NULL DEFAULT false,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  revenue_id UUID REFERENCES public.accounting_revenues(id) ON DELETE SET NULL,
  expense_id UUID REFERENCES public.accounting_expenses(id) ON DELETE SET NULL,
  responsible_staff_id UUID,
  responsible_staff_name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  reversal_reason TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounting_vouchers_kind_date_idx
  ON public.accounting_vouchers (voucher_kind, voucher_date DESC);

GRANT SELECT, INSERT, UPDATE ON public.accounting_vouchers TO authenticated;
GRANT ALL ON public.accounting_vouchers TO service_role;
ALTER TABLE public.accounting_vouchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accounting users read vouchers" ON public.accounting_vouchers;
CREATE POLICY "Accounting users read vouchers"
  ON public.accounting_vouchers FOR SELECT TO authenticated
  USING (
    public.has_accounting_permission(auth.uid(), 'accounting_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_reports_view')
    OR (voucher_kind = 'receipt' AND public.has_accounting_permission(auth.uid(), 'accounting_receipts_view'))
    OR (voucher_kind = 'disbursement' AND public.has_accounting_permission(auth.uid(), 'accounting_disbursements_view'))
  );

DROP POLICY IF EXISTS "Accounting users create vouchers" ON public.accounting_vouchers;
CREATE POLICY "Accounting users create vouchers"
  ON public.accounting_vouchers FOR INSERT TO authenticated
  WITH CHECK (
    (voucher_kind = 'receipt' AND public.has_accounting_permission(auth.uid(), 'accounting_receipts_create'))
    OR (voucher_kind = 'disbursement' AND public.has_accounting_permission(auth.uid(), 'accounting_disbursements_create'))
  );

DROP POLICY IF EXISTS "Accounting users reverse vouchers" ON public.accounting_vouchers;
CREATE POLICY "Accounting users reverse vouchers"
  ON public.accounting_vouchers FOR UPDATE TO authenticated
  USING (
    (voucher_kind = 'receipt' AND public.has_accounting_permission(auth.uid(), 'accounting_revenue_delete'))
    OR (voucher_kind = 'disbursement' AND public.has_accounting_permission(auth.uid(), 'accounting_expenses_delete'))
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    (voucher_kind = 'receipt' AND public.has_accounting_permission(auth.uid(), 'accounting_revenue_delete'))
    OR (voucher_kind = 'disbursement' AND public.has_accounting_permission(auth.uid(), 'accounting_expenses_delete'))
    OR public.has_role(auth.uid(), 'admin')
  );

-- 6.8 Account Transaction Ledger (Single Source of Truth for Cashbox/Bank Balances)
CREATE TABLE IF NOT EXISTS public.accounting_account_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  transaction_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Cairo')::date),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'revenue',
      'revenue_reversal',
      'expense_payment',
      'expense_reversal',
      'transfer_in',
      'transfer_out',
      'transfer_reversal',
      'voucher_receipt',
      'voucher_disbursement',
      'voucher_reversal',
      'opening_adjustment'
    )
  ),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference_table TEXT,
  reference_id UUID,
  description TEXT NOT NULL,
  created_by UUID DEFAULT auth.uid(),
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounting_account_txns_acc_date_idx
  ON public.accounting_account_transactions (account_id, transaction_date DESC, created_at DESC);

GRANT SELECT, INSERT ON public.accounting_account_transactions TO authenticated;
GRANT ALL ON public.accounting_account_transactions TO service_role;
ALTER TABLE public.accounting_account_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accounting users read account transactions" ON public.accounting_account_transactions;
CREATE POLICY "Accounting users read account transactions"
  ON public.accounting_account_transactions FOR SELECT TO authenticated
  USING (
    public.has_accounting_permission(auth.uid(), 'accounting_accounts_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_view')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_reports_view')
  );

DROP POLICY IF EXISTS "Accounting users insert account transactions" ON public.accounting_account_transactions;
CREATE POLICY "Accounting users insert account transactions"
  ON public.accounting_account_transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_accounting_permission(auth.uid(), 'accounting_revenue_create')
    OR public.has_accounting_permission(auth.uid(), 'accounting_revenue_delete')
    OR public.has_accounting_permission(auth.uid(), 'accounting_expenses_create')
    OR public.has_accounting_permission(auth.uid(), 'accounting_expenses_pay')
    OR public.has_accounting_permission(auth.uid(), 'accounting_expenses_delete')
    OR public.has_accounting_permission(auth.uid(), 'accounting_transfers_create')
    OR public.has_accounting_permission(auth.uid(), 'accounting_accounts_manage')
    OR public.has_accounting_permission(auth.uid(), 'accounting_receipts_create')
    OR public.has_accounting_permission(auth.uid(), 'accounting_disbursements_create')
    OR public.has_accounting_permission(auth.uid(), 'accounting_manage_opening_balances')
  );

-- ---------------------------------------------------------------------------
-- 7. Realtime & Migration Tracking
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patients',
    'clinic_audit_logs',
    'accounting_categories',
    'accounting_settings',
    'accounting_accounts',
    'accounting_revenues',
    'accounting_expenses',
    'accounting_expense_payments',
    'accounting_transfers',
    'accounting_vouchers',
    'accounting_account_transactions'
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
    VALUES ('0023_staff_bookings_patients_accounting.sql')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
