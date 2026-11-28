-- ============================================================================
-- Migration 0026: Patient Experience & General Evaluation System (التقييم العام)
-- Additive, non-destructive migration integrating with existing complaints,
-- patients, bookings, doctors, profiles, and realtime publications.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Granular Permission Helper for التقييم العام
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_general_evaluation_permission(_uid uuid, _perm text)
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

REVOKE ALL ON FUNCTION public.has_general_evaluation_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_general_evaluation_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_general_evaluation_permission(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.has_any_general_evaluation_permission(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN _uid IS NULL THEN false
      WHEN public.has_role(_uid, 'admin') THEN true
      ELSE EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.user_id
        WHERE p.user_id = _uid
          AND COALESCE(p.is_active, true) = true
          AND p.permissions IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(p.permissions) perm
            WHERE perm IN (
              'general_evaluation_view',
              'general_evaluation_manage',
              'general_evaluation_view_reports',
              'general_evaluation_export',
              'general_evaluation_manage_settings',
              'general_evaluation_view_patient_details',
              'general_evaluation_manage_complaints',
              'general_evaluation_assign_complaints',
              'general_evaluation_resolve_complaints',
              'general_evaluation_manage_followups',
              'general_evaluation_view_doctor_ratings'
            )
          )
      )
    END;
$$;

REVOKE ALL ON FUNCTION public.has_any_general_evaluation_permission(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_any_general_evaluation_permission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_general_evaluation_permission(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Evaluation Settings (Singleton Row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_experience_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_form_enabled BOOLEAN NOT NULL DEFAULT true,
  allow_anonymous_submission BOOLEAN NOT NULL DEFAULT true,
  require_phone_for_complaint BOOLEAN NOT NULL DEFAULT true,
  rate_limit_minutes INTEGER NOT NULL DEFAULT 10,
  show_non_return_question BOOLEAN NOT NULL DEFAULT true,
  show_waiting_time_section BOOLEAN NOT NULL DEFAULT true,
  auto_create_complaint_on_low_rating BOOLEAN NOT NULL DEFAULT false,
  low_rating_threshold SMALLINT NOT NULL DEFAULT 2 CHECK (low_rating_threshold BETWEEN 1 AND 5),
  welcome_message_ar TEXT NOT NULL DEFAULT 'رأيك يهمنا لتطوير جودة الرعاية الطبية والخدمات المقدمة في مركز برادة للعيون',
  welcome_message_en TEXT NOT NULL DEFAULT 'Your feedback helps us improve medical care and patient experience at Barada Eye Center',
  thank_you_message_ar TEXT NOT NULL DEFAULT 'شكراً لمشاركتنا تقييمك. ملاحظاتك محل تقدير واهتمام إدارة المركز.',
  thank_you_message_en TEXT NOT NULL DEFAULT 'Thank you for sharing your evaluation with Barada Eye Center.',
  updated_by_staff_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.patient_experience_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Additive Upgrade to Existing public.complaints (Single Source of Truth)
-- ---------------------------------------------------------------------------
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'contact_form',
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'أخرى',
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'جديدة',
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evaluation_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_staff_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_staff_name TEXT,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS patient_contacted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS patient_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS patient_resolution_satisfaction SMALLINT CHECK (patient_resolution_satisfaction IS NULL OR patient_resolution_satisfaction BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS followup_date DATE,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

UPDATE public.complaints
SET reference_number = 'CMP-' || to_char(created_at, 'YYYYMMDD') || '-' || upper(right(replace(id::text, '-', ''), 4))
WHERE reference_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_complaints_reference_number_unique
  ON public.complaints (reference_number)
  WHERE reference_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_complaints_idempotency_key_unique
  ON public.complaints (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_status ON public.complaints (status);
CREATE INDEX IF NOT EXISTS idx_complaints_category ON public.complaints (category);
CREATE INDEX IF NOT EXISTS idx_complaints_assigned_staff ON public.complaints (assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_complaints_evaluation_id ON public.complaints (evaluation_id);

CREATE OR REPLACE FUNCTION public.complaints_defaults_and_validation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_number IS NULL OR btrim(NEW.reference_number) = '' THEN
    NEW.reference_number := 'CMP-' || to_char(COALESCE(NEW.created_at, now()), 'YYYYMMDD') || '-' || upper(right(replace(COALESCE(NEW.id, gen_random_uuid())::text, '-', ''), 4));
  END IF;

  IF NEW.status IS NULL OR btrim(NEW.status) = '' THEN
    NEW.status := 'جديدة';
  END IF;

  IF NEW.priority IS NULL OR btrim(NEW.priority) = '' THEN
    NEW.priority := 'medium';
  END IF;

  IF NEW.category IS NULL OR btrim(NEW.category) = '' THEN
    NEW.category := 'أخرى';
  END IF;

  IF NEW.status = 'تم الحل' AND (NEW.resolution_note IS NULL OR btrim(NEW.resolution_note) = '') THEN
    RAISE EXCEPTION 'يجب كتابة تفاصيل الحل قبل تغيير حالة الشكوى إلى تم الحل';
  END IF;

  IF NEW.status = 'مرفوضة مع توضيح السبب'
     AND (NEW.rejection_reason IS NULL OR btrim(NEW.rejection_reason) = '')
     AND (NEW.resolution_note IS NULL OR btrim(NEW.resolution_note) = '') THEN
    RAISE EXCEPTION 'يجب توضيح سبب رفض الشكوى';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF NEW.status IN ('تم الحل', 'مغلقة') AND OLD.status NOT IN ('تم الحل', 'مغلقة') AND NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
    IF NEW.patient_contacted = true AND COALESCE(OLD.patient_contacted, false) = false AND NEW.patient_contacted_at IS NULL THEN
      NEW.patient_contacted_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complaints_defaults_and_validation ON public.complaints;
CREATE TRIGGER trg_complaints_defaults_and_validation
  BEFORE INSERT OR UPDATE ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.complaints_defaults_and_validation();

-- ---------------------------------------------------------------------------
-- 4. Core Evaluations Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_experience_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_code TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  submission_channel TEXT NOT NULL DEFAULT 'public_nav',
  feedback_type TEXT NOT NULL DEFAULT 'evaluation',
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  patient_file_number TEXT,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  doctor_name TEXT,
  service_name TEXT,
  visit_date TEXT,
  appointment_ref TEXT,
  -- Doctor evaluation (1-5)
  doctor_treatment_rating SMALLINT CHECK (doctor_treatment_rating IS NULL OR doctor_treatment_rating BETWEEN 1 AND 5),
  doctor_explanation_rating SMALLINT CHECK (doctor_explanation_rating IS NULL OR doctor_explanation_rating BETWEEN 1 AND 5),
  doctor_attention_rating SMALLINT CHECK (doctor_attention_rating IS NULL OR doctor_attention_rating BETWEEN 1 AND 5),
  doctor_clarity_rating SMALLINT CHECK (doctor_clarity_rating IS NULL OR doctor_clarity_rating BETWEEN 1 AND 5),
  doctor_overall_rating NUMERIC(3,2),
  doctor_comment TEXT,
  -- Service evaluation (1-5)
  service_quality_rating SMALLINT CHECK (service_quality_rating IS NULL OR service_quality_rating BETWEEN 1 AND 5),
  staff_cooperation_rating SMALLINT CHECK (staff_cooperation_rating IS NULL OR staff_cooperation_rating BETWEEN 1 AND 5),
  procedures_ease_rating SMALLINT CHECK (procedures_ease_rating IS NULL OR procedures_ease_rating BETWEEN 1 AND 5),
  service_overall_rating NUMERIC(3,2),
  -- Reception evaluation (1-5)
  reception_treatment_rating SMALLINT CHECK (reception_treatment_rating IS NULL OR reception_treatment_rating BETWEEN 1 AND 5),
  reception_respect_rating SMALLINT CHECK (reception_respect_rating IS NULL OR reception_respect_rating BETWEEN 1 AND 5),
  reception_speed_rating SMALLINT CHECK (reception_speed_rating IS NULL OR reception_speed_rating BETWEEN 1 AND 5),
  reception_helpfulness_rating SMALLINT CHECK (reception_helpfulness_rating IS NULL OR reception_helpfulness_rating BETWEEN 1 AND 5),
  reception_overall_rating NUMERIC(3,2),
  -- Waiting time evaluation
  waiting_time_range TEXT,
  actual_wait_minutes INTEGER CHECK (actual_wait_minutes IS NULL OR actual_wait_minutes >= 0),
  waiting_time_satisfied BOOLEAN,
  waiting_time_rating SMALLINT CHECK (waiting_time_rating IS NULL OR waiting_time_rating BETWEEN 1 AND 5),
  waiting_time_comment TEXT,
  -- Overall satisfaction & recommendation
  overall_satisfaction SMALLINT NOT NULL CHECK (overall_satisfaction BETWEEN 1 AND 5),
  overall_comment TEXT,
  recommendation_choice TEXT NOT NULL,
  -- Non-return reasons
  non_return_reason TEXT,
  non_return_explanation TEXT,
  -- Synchronized complaint linkage
  complaint_id UUID REFERENCES public.complaints(id) ON DELETE SET NULL,
  complaint_category TEXT,
  complaint_priority TEXT,
  feedback_message TEXT,
  -- Privacy & management
  contact_consent BOOLEAN NOT NULL DEFAULT true,
  is_anonymous_public BOOLEAN NOT NULL DEFAULT true,
  client_fingerprint_hash TEXT,
  review_status TEXT NOT NULL DEFAULT 'جديد',
  internal_notes TEXT,
  created_by_staff_id UUID,
  created_by_staff_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_code_unique
  ON public.patient_experience_evaluations (evaluation_code);
CREATE INDEX IF NOT EXISTS idx_eval_created_at
  ON public.patient_experience_evaluations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_doctor_name
  ON public.patient_experience_evaluations (doctor_name);
CREATE INDEX IF NOT EXISTS idx_eval_patient_id
  ON public.patient_experience_evaluations (patient_id);
CREATE INDEX IF NOT EXISTS idx_eval_booking_id
  ON public.patient_experience_evaluations (booking_id);
CREATE INDEX IF NOT EXISTS idx_eval_complaint_id
  ON public.patient_experience_evaluations (complaint_id);
CREATE INDEX IF NOT EXISTS idx_eval_phone_created
  ON public.patient_experience_evaluations (patient_phone, created_at DESC);

-- Link complaints.evaluation_id cleanly after table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'complaints'
      AND constraint_name = 'complaints_evaluation_id_fkey'
  ) THEN
    ALTER TABLE public.complaints
      ADD CONSTRAINT complaints_evaluation_id_fkey
      FOREIGN KEY (evaluation_id)
      REFERENCES public.patient_experience_evaluations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Itemized Rating Details
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_experience_rating_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.patient_experience_evaluations(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  criterion_key TEXT NOT NULL,
  criterion_label TEXT NOT NULL,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_rating_details_eval_id
  ON public.patient_experience_rating_details (evaluation_id);
CREATE INDEX IF NOT EXISTS idx_eval_rating_details_section
  ON public.patient_experience_rating_details (section_key, criterion_key);

-- ---------------------------------------------------------------------------
-- 6. Non-Return Reasons (Confirmed Patient Responses vs Follow-up Calls)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_non_return_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID REFERENCES public.patient_experience_evaluations(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  doctor_name TEXT,
  reason_code TEXT NOT NULL,
  explanation TEXT,
  source TEXT NOT NULL DEFAULT 'patient_evaluation' CHECK (source IN ('patient_evaluation', 'followup_call')),
  recorded_by_staff_id UUID,
  recorded_by_staff_name TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_non_return_reason_code
  ON public.patient_non_return_reasons (reason_code);
CREATE INDEX IF NOT EXISTS idx_non_return_recorded_at
  ON public.patient_non_return_reasons (recorded_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Complaint & Experience Follow-ups Log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_experience_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID REFERENCES public.complaints(id) ON DELETE CASCADE,
  evaluation_id UUID REFERENCES public.patient_experience_evaluations(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL DEFAULT 'followup',
  status_after TEXT,
  assigned_staff_id UUID,
  assigned_staff_name TEXT,
  followup_date DATE,
  action_taken TEXT,
  note TEXT,
  patient_contacted BOOLEAN NOT NULL DEFAULT false,
  patient_satisfaction SMALLINT CHECK (patient_satisfaction IS NULL OR patient_satisfaction BETWEEN 1 AND 5),
  created_by_staff_id UUID,
  created_by_staff_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_followups_complaint_id
  ON public.patient_experience_followups (complaint_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. Row Level Security & Strict Access Policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.patient_experience_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_experience_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_experience_rating_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_non_return_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_experience_followups ENABLE ROW LEVEL SECURITY;

-- Settings policies
DROP POLICY IF EXISTS "Authorized staff read eval settings" ON public.patient_experience_settings;
CREATE POLICY "Authorized staff read eval settings"
  ON public.patient_experience_settings FOR SELECT TO authenticated
  USING (public.has_any_general_evaluation_permission(auth.uid()));

DROP POLICY IF EXISTS "Authorized staff update eval settings" ON public.patient_experience_settings;
CREATE POLICY "Authorized staff update eval settings"
  ON public.patient_experience_settings FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_settings')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_settings')
  );

-- Evaluations policies (public inserts ONLY through validated SECURITY DEFINER RPC)
DROP POLICY IF EXISTS "Authorized staff read evaluations" ON public.patient_experience_evaluations;
CREATE POLICY "Authorized staff read evaluations"
  ON public.patient_experience_evaluations FOR SELECT TO authenticated
  USING (public.has_any_general_evaluation_permission(auth.uid()));

DROP POLICY IF EXISTS "Authorized staff update evaluations" ON public.patient_experience_evaluations;
CREATE POLICY "Authorized staff update evaluations"
  ON public.patient_experience_evaluations FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_followups')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_followups')
  );

-- Rating details policies
DROP POLICY IF EXISTS "Authorized staff read rating details" ON public.patient_experience_rating_details;
CREATE POLICY "Authorized staff read rating details"
  ON public.patient_experience_rating_details FOR SELECT TO authenticated
  USING (public.has_any_general_evaluation_permission(auth.uid()));

-- Non-return reasons policies
DROP POLICY IF EXISTS "Authorized staff read non return reasons" ON public.patient_non_return_reasons;
CREATE POLICY "Authorized staff read non return reasons"
  ON public.patient_non_return_reasons FOR SELECT TO authenticated
  USING (public.has_any_general_evaluation_permission(auth.uid()));

DROP POLICY IF EXISTS "Authorized staff insert non return reasons" ON public.patient_non_return_reasons;
CREATE POLICY "Authorized staff insert non return reasons"
  ON public.patient_non_return_reasons FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_followups')
  );

-- Followups policies
DROP POLICY IF EXISTS "Authorized staff read followups" ON public.patient_experience_followups;
CREATE POLICY "Authorized staff read followups"
  ON public.patient_experience_followups FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_complaints')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_assign_complaints')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_resolve_complaints')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_followups')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_view_reports')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_view')
  );

DROP POLICY IF EXISTS "Authorized staff insert followups" ON public.patient_experience_followups;
CREATE POLICY "Authorized staff insert followups"
  ON public.patient_experience_followups FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_complaints')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_assign_complaints')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_resolve_complaints')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_followups')
  );

-- Extend complaints policies safely without breaking existing Contact Us & الشكاوى workflows
DROP POLICY IF EXISTS "Staff can read complaints" ON public.complaints;
CREATE POLICY "Staff can read complaints"
  ON public.complaints FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND COALESCE(p.is_active, true) = true
        AND p.permissions IS NOT NULL
        AND 'manage_complaints' = ANY (ARRAY(SELECT jsonb_array_elements_text(p.permissions)))
    )
    OR public.has_any_general_evaluation_permission(auth.uid())
  );

DROP POLICY IF EXISTS "Authorized staff update complaints" ON public.complaints;
CREATE POLICY "Authorized staff update complaints"
  ON public.complaints FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND COALESCE(p.is_active, true) = true
        AND p.permissions IS NOT NULL
        AND 'manage_complaints' = ANY (ARRAY(SELECT jsonb_array_elements_text(p.permissions)))
    )
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_complaints')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_assign_complaints')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_resolve_complaints')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_followups')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND COALESCE(p.is_active, true) = true
        AND p.permissions IS NOT NULL
        AND 'manage_complaints' = ANY (ARRAY(SELECT jsonb_array_elements_text(p.permissions)))
    )
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_complaints')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_assign_complaints')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_resolve_complaints')
    OR public.has_general_evaluation_permission(auth.uid(), 'general_evaluation_manage_followups')
  );

-- ---------------------------------------------------------------------------
-- 9. Public & Staff SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_evaluation_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'public_form_enabled', public_form_enabled,
        'allow_anonymous_submission', allow_anonymous_submission,
        'require_phone_for_complaint', require_phone_for_complaint,
        'show_non_return_question', show_non_return_question,
        'show_waiting_time_section', show_waiting_time_section,
        'welcome_message_ar', welcome_message_ar,
        'welcome_message_en', welcome_message_en,
        'thank_you_message_ar', thank_you_message_ar,
        'thank_you_message_en', thank_you_message_en
      )
      FROM public.patient_experience_settings
      WHERE id = 1
      LIMIT 1
    ),
    jsonb_build_object(
      'public_form_enabled', true,
      'allow_anonymous_submission', true,
      'require_phone_for_complaint', true,
      'show_non_return_question', true,
      'show_waiting_time_section', true,
      'welcome_message_ar', 'رأيك يهمنا لتطوير جودة الرعاية الطبية والخدمات المقدمة في مركز برادة للعيون',
      'welcome_message_en', 'Your feedback helps us improve medical care and patient experience at Barada Eye Center',
      'thank_you_message_ar', 'شكراً لمشاركتنا تقييمك. ملاحظاتك محل تقدير واهتمام إدارة المركز.',
      'thank_you_message_en', 'Thank you for sharing your evaluation with Barada Eye Center.'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_public_evaluation_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_evaluation_config() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_evaluation_booking_context(
  _booking_id uuid,
  _token text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'valid', true,
        'booking_id', b.id,
        'patient_name', b.patient_name,
        'doctor_name', b.doctor_name,
        'service_name', b.service,
        'visit_date', b.date
      )
      FROM public.bookings b
      WHERE b.id = _booking_id
        AND b.cancellation_token IS NOT NULL
        AND btrim(COALESCE(_token, '')) = b.cancellation_token::text
      LIMIT 1
    ),
    jsonb_build_object('valid', false)
  );
$$;

REVOKE ALL ON FUNCTION public.get_evaluation_booking_context(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_evaluation_booking_context(uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_patient_experience_evaluation(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.patient_experience_settings%ROWTYPE;
  v_idem text := NULLIF(btrim(COALESCE(_payload->>'idempotency_key', '')), '');
  v_existing public.patient_experience_evaluations%ROWTYPE;
  v_existing_cmp public.complaints%ROWTYPE;
  v_channel text := COALESCE(NULLIF(btrim(_payload->>'submission_channel'), ''), 'public_nav');
  v_feedback_type text := COALESCE(NULLIF(btrim(_payload->>'feedback_type'), ''), 'evaluation');
  v_patient_name text := left(btrim(COALESCE(_payload->>'patient_name', '')), 200);
  v_raw_phone text := left(btrim(COALESCE(_payload->>'patient_phone', '')), 30);
  v_norm_phone text := regexp_replace(
    translate(v_raw_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'),
    '[^0-9]',
    '',
    'g'
  );
  v_file_number text := NULLIF(left(btrim(COALESCE(_payload->>'patient_file_number', '')), 60), '');
  v_doctor_name text := NULLIF(left(btrim(COALESCE(_payload->>'doctor_name', '')), 200), '');
  v_service_name text := NULLIF(left(btrim(COALESCE(_payload->>'service_name', '')), 200), '');
  v_visit_date text := NULLIF(left(btrim(COALESCE(_payload->>'visit_date', '')), 30), '');
  v_appointment_ref text := NULLIF(left(btrim(COALESCE(_payload->>'appointment_ref', '')), 100), '');
  v_booking_id uuid := NULL;
  v_booking_token text := NULLIF(btrim(COALESCE(_payload->>'booking_token', '')), '');
  v_patient_id uuid := NULL;
  v_doctor_id uuid := NULL;

  v_doc_t smallint := NULLIF((_payload->>'doctor_treatment_rating'), '')::smallint;
  v_doc_e smallint := NULLIF((_payload->>'doctor_explanation_rating'), '')::smallint;
  v_doc_a smallint := NULLIF((_payload->>'doctor_attention_rating'), '')::smallint;
  v_doc_c smallint := NULLIF((_payload->>'doctor_clarity_rating'), '')::smallint;
  v_doc_avg numeric(3,2) := NULL;

  v_srv_q smallint := NULLIF((_payload->>'service_quality_rating'), '')::smallint;
  v_srv_coop smallint := NULLIF((_payload->>'staff_cooperation_rating'), '')::smallint;
  v_srv_ease smallint := NULLIF((_payload->>'procedures_ease_rating'), '')::smallint;
  v_srv_avg numeric(3,2) := NULL;

  v_rec_t smallint := NULLIF((_payload->>'reception_treatment_rating'), '')::smallint;
  v_rec_r smallint := NULLIF((_payload->>'reception_respect_rating'), '')::smallint;
  v_rec_s smallint := NULLIF((_payload->>'reception_speed_rating'), '')::smallint;
  v_rec_h smallint := NULLIF((_payload->>'reception_helpfulness_rating'), '')::smallint;
  v_rec_avg numeric(3,2) := NULL;

  v_wait_range text := NULLIF(left(btrim(COALESCE(_payload->>'waiting_time_range', '')), 40), '');
  v_wait_mins integer := NULLIF((_payload->>'actual_wait_minutes'), '')::integer;
  v_wait_sat boolean := CASE
    WHEN _payload ? 'waiting_time_satisfied' AND _payload->>'waiting_time_satisfied' IN ('true', 'false')
    THEN (_payload->>'waiting_time_satisfied')::boolean
    ELSE NULL
  END;
  v_wait_rating smallint := NULLIF((_payload->>'waiting_time_rating'), '')::smallint;

  v_overall smallint := NULLIF((_payload->>'overall_satisfaction'), '')::smallint;
  v_recommend text := NULLIF(btrim(COALESCE(_payload->>'recommendation_choice', '')), '');
  v_non_return_reason text := NULLIF(left(btrim(COALESCE(_payload->>'non_return_reason', '')), 200), '');
  v_non_return_expl text := NULLIF(left(btrim(COALESCE(_payload->>'non_return_explanation', '')), 2000), '');

  v_cmp_category text := COALESCE(NULLIF(left(btrim(COALESCE(_payload->>'complaint_category', '')), 100), ''), 'أخرى');
  v_cmp_priority text := NULLIF(btrim(COALESCE(_payload->>'complaint_priority', '')), '');
  v_feedback_msg text := NULLIF(left(btrim(COALESCE(_payload->>'feedback_message', '')), 5000), '');
  v_contact_consent boolean := COALESCE((_payload->>'contact_consent')::boolean, true);
  v_fingerprint text := NULLIF(left(btrim(COALESCE(_payload->>'client_fingerprint_hash', '')), 120), '');

  v_eval_id uuid;
  v_eval_code text;
  v_complaint_id uuid := NULL;
  v_complaint_ref text := NULL;
  v_should_create_complaint boolean := false;
  v_cmp_idem text;
  v_staff_uid uuid := auth.uid();
  v_staff_name text := NULL;
BEGIN
  SELECT * INTO v_settings FROM public.patient_experience_settings WHERE id = 1 LIMIT 1;

  IF v_channel <> 'staff_entry' AND COALESCE(v_settings.public_form_enabled, true) = false THEN
    RAISE EXCEPTION 'نموذج التقييم العام متوقف مؤقتاً من إعدادات الإدارة';
  END IF;

  IF v_channel = 'staff_entry' THEN
    IF NOT (
      public.has_role(v_staff_uid, 'admin')
      OR public.has_general_evaluation_permission(v_staff_uid, 'general_evaluation_manage')
      OR public.has_general_evaluation_permission(v_staff_uid, 'general_evaluation_manage_followups')
    ) THEN
      RAISE EXCEPTION 'غير مصرح بإدخال تقييم موظف';
    END IF;
    SELECT name INTO v_staff_name FROM public.profiles WHERE user_id = v_staff_uid LIMIT 1;
  END IF;

  -- Idempotency check
  IF v_idem IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.patient_experience_evaluations
    WHERE idempotency_key = v_idem
    LIMIT 1;
    IF FOUND THEN
      IF v_existing.complaint_id IS NOT NULL THEN
        SELECT reference_number INTO v_complaint_ref
        FROM public.complaints
        WHERE id = v_existing.complaint_id;
      END IF;
      RETURN jsonb_build_object(
        'ok', true,
        'deduplicated', true,
        'evaluation_id', v_existing.id,
        'evaluation_code', v_existing.evaluation_code,
        'complaint_id', v_existing.complaint_id,
        'complaint_reference', v_complaint_ref
      );
    END IF;
  END IF;

  -- Basic validation
  IF v_overall IS NULL OR v_overall < 1 OR v_overall > 5 THEN
    RAISE EXCEPTION 'يجب اختيار التقييم العام من 1 إلى 5';
  END IF;

  IF v_recommend IS NULL OR v_recommend NOT IN ('definitely_yes', 'probably_yes', 'not_sure', 'probably_no', 'definitely_no') THEN
    RAISE EXCEPTION 'يجب اختيار إجابة سؤال الترشيح';
  END IF;

  IF v_feedback_type IN ('complaint', 'suggestion') AND COALESCE(v_settings.require_phone_for_complaint, true) AND length(v_norm_phone) < 8 THEN
    RAISE EXCEPTION 'يرجى إدخال رقم هاتف صحيح للتواصل بخصوص الشكوى أو الاقتراح';
  END IF;

  IF v_patient_name = '' THEN
    IF COALESCE(v_settings.allow_anonymous_submission, true) AND v_feedback_type NOT IN ('complaint', 'suggestion') THEN
      v_patient_name := 'مريض زائر';
    ELSE
      RAISE EXCEPTION 'يرجى إدخال الاسم';
    END IF;
  END IF;

  IF v_norm_phone = '' THEN
    IF COALESCE(v_settings.allow_anonymous_submission, true) AND v_feedback_type NOT IN ('complaint', 'suggestion') THEN
      v_raw_phone := 'غير مسجل';
    ELSE
      RAISE EXCEPTION 'يرجى إدخال رقم الهاتف';
    END IF;
  ELSE
    v_raw_phone := v_norm_phone;
  END IF;

  -- Rate limit check for public submissions
  IF v_channel <> 'staff_entry' AND COALESCE(v_settings.rate_limit_minutes, 10) > 0 THEN
    IF v_norm_phone <> '' AND EXISTS (
      SELECT 1 FROM public.patient_experience_evaluations e
      WHERE e.patient_phone = v_norm_phone
        AND e.created_at > now() - make_interval(mins => v_settings.rate_limit_minutes)
    ) THEN
      RAISE EXCEPTION 'تم استلام تقييمك مؤخراً. يمكنك إرسال تقييم جديد بعد بضع دقائق.';
    END IF;
  END IF;

  -- Verified booking linkage if booking_id + token OR explicit staff booking_id
  IF NULLIF(btrim(COALESCE(_payload->>'booking_id', '')), '') IS NOT NULL THEN
    BEGIN
      v_booking_id := (_payload->>'booking_id')::uuid;
      IF v_channel <> 'staff_entry' THEN
        SELECT b.id, b.patient_id INTO v_booking_id, v_patient_id
        FROM public.bookings b
        WHERE b.id = v_booking_id
          AND b.cancellation_token IS NOT NULL
          AND b.cancellation_token::text = COALESCE(v_booking_token, '')
        LIMIT 1;
      ELSE
        SELECT b.id, b.patient_id INTO v_booking_id, v_patient_id
        FROM public.bookings b
        WHERE b.id = v_booking_id
        LIMIT 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_booking_id := NULL;
    END;
  END IF;

  -- Safe linking to existing patient (never creates a duplicate patient row!)
  IF v_patient_id IS NULL AND (v_norm_phone <> '' OR v_file_number IS NOT NULL) THEN
    SELECT p.id INTO v_patient_id
    FROM public.patients p
    WHERE (
      v_file_number IS NOT NULL AND p.file_number = v_file_number
    ) OR (
      v_norm_phone <> '' AND (
        regexp_replace(translate(COALESCE(p.phone, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g') = v_norm_phone
        OR regexp_replace(translate(COALESCE(p.phone2, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g') = v_norm_phone
      )
    )
    ORDER BY p.created_at ASC
    LIMIT 1;
  END IF;

  -- Safe doctor lookup
  IF v_doctor_name IS NOT NULL THEN
    SELECT d.id INTO v_doctor_id
    FROM public.doctors d
    WHERE d.name = v_doctor_name
    LIMIT 1;
  END IF;

  -- Compute clean section averages
  SELECT ROUND(AVG(val)::numeric, 2) INTO v_doc_avg
  FROM unnest(ARRAY[v_doc_t, v_doc_e, v_doc_a, v_doc_c]) AS val
  WHERE val IS NOT NULL;

  SELECT ROUND(AVG(val)::numeric, 2) INTO v_srv_avg
  FROM unnest(ARRAY[v_srv_q, v_srv_coop, v_srv_ease]) AS val
  WHERE val IS NOT NULL;

  SELECT ROUND(AVG(val)::numeric, 2) INTO v_rec_avg
  FROM unnest(ARRAY[v_rec_t, v_rec_r, v_rec_s, v_rec_h]) AS val
  WHERE val IS NOT NULL;

  v_eval_id := gen_random_uuid();
  v_eval_code := 'EVL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(right(replace(v_eval_id::text, '-', ''), 4));

  INSERT INTO public.patient_experience_evaluations (
    id, evaluation_code, idempotency_key, submission_channel, feedback_type,
    patient_id, booking_id, patient_name, patient_phone, patient_file_number,
    doctor_id, doctor_name, service_name, visit_date, appointment_ref,
    doctor_treatment_rating, doctor_explanation_rating, doctor_attention_rating, doctor_clarity_rating, doctor_overall_rating, doctor_comment,
    service_quality_rating, staff_cooperation_rating, procedures_ease_rating, service_overall_rating,
    reception_treatment_rating, reception_respect_rating, reception_speed_rating, reception_helpfulness_rating, reception_overall_rating,
    waiting_time_range, actual_wait_minutes, waiting_time_satisfied, waiting_time_rating, waiting_time_comment,
    overall_satisfaction, overall_comment, recommendation_choice,
    non_return_reason, non_return_explanation,
    complaint_category, complaint_priority, feedback_message,
    contact_consent, is_anonymous_public, client_fingerprint_hash,
    created_by_staff_id, created_by_staff_name
  ) VALUES (
    v_eval_id, v_eval_code, v_idem, v_channel, v_feedback_type,
    v_patient_id, v_booking_id, v_patient_name, v_raw_phone, v_file_number,
    v_doctor_id, v_doctor_name, v_service_name, v_visit_date, v_appointment_ref,
    v_doc_t, v_doc_e, v_doc_a, v_doc_c, v_doc_avg, NULLIF(left(btrim(COALESCE(_payload->>'doctor_comment', '')), 2000), ''),
    v_srv_q, v_srv_coop, v_srv_ease, v_srv_avg,
    v_rec_t, v_rec_r, v_rec_s, v_rec_h, v_rec_avg,
    v_wait_range, v_wait_mins, v_wait_sat, v_wait_rating, NULLIF(left(btrim(COALESCE(_payload->>'waiting_time_comment', '')), 2000), ''),
    v_overall, NULLIF(left(btrim(COALESCE(_payload->>'overall_comment', '')), 3000), ''), v_recommend,
    v_non_return_reason, v_non_return_expl,
    v_cmp_category, COALESCE(v_cmp_priority, CASE WHEN v_feedback_type = 'complaint' AND v_overall <= 2 THEN 'high' ELSE 'medium' END), v_feedback_msg,
    v_contact_consent, true, v_fingerprint,
    v_staff_uid, v_staff_name
  );

  -- Populate normalized rating details
  INSERT INTO public.patient_experience_rating_details (evaluation_id, section_key, criterion_key, criterion_label, score)
  SELECT v_eval_id, t.section_key, t.criterion_key, t.criterion_label, t.score
  FROM (VALUES
    ('doctor', 'doctor_treatment', 'التعامل المهني للطبيب', v_doc_t),
    ('doctor', 'doctor_explanation', 'الشرح والتواصل', v_doc_e),
    ('doctor', 'doctor_attention', 'الاهتمام باستفسارات المريض', v_doc_a),
    ('doctor', 'doctor_clarity', 'وضوح التعليمات الطبية', v_doc_c),
    ('service', 'service_quality', 'جودة الخدمة', v_srv_q),
    ('service', 'staff_cooperation', 'تعاون فريق العمل', v_srv_coop),
    ('service', 'procedures_ease', 'سهولة الإجراءات', v_srv_ease),
    ('reception', 'reception_treatment', 'تعامل موظفي الاستقبال', v_rec_t),
    ('reception', 'reception_respect', 'الاحترام والمهنية', v_rec_r),
    ('reception', 'reception_speed', 'سرعة التسجيل', v_rec_s),
    ('reception', 'reception_helpfulness', 'المساعدة والتواصل', v_rec_h),
    ('waiting', 'waiting_time', 'وقت الانتظار', v_wait_rating),
    ('overall', 'overall_satisfaction', 'الرضا العام', v_overall)
  ) AS t(section_key, criterion_key, criterion_label, score)
  WHERE t.score IS NOT NULL;

  -- Record confirmed non-return reason if provided
  IF v_non_return_reason IS NOT NULL THEN
    INSERT INTO public.patient_non_return_reasons (
      evaluation_id, patient_id, booking_id, doctor_name, reason_code, explanation, source, recorded_by_staff_id, recorded_by_staff_name
    ) VALUES (
      v_eval_id, v_patient_id, v_booking_id, v_doctor_name, v_non_return_reason, v_non_return_expl,
      CASE WHEN v_channel = 'staff_entry' THEN 'followup_call' ELSE 'patient_evaluation' END,
      v_staff_uid, v_staff_name
    );
  END IF;

  -- Single Integrated Complaint Creation Rule
  v_should_create_complaint :=
    (v_feedback_type IN ('complaint', 'suggestion'))
    OR (COALESCE(v_settings.auto_create_complaint_on_low_rating, false) AND v_overall <= COALESCE(v_settings.low_rating_threshold, 2));

  IF v_should_create_complaint THEN
    v_cmp_idem := CASE WHEN v_idem IS NOT NULL THEN 'eval_cmp:' || v_idem ELSE 'eval_cmp:' || v_eval_id::text END;
    SELECT * INTO v_existing_cmp FROM public.complaints WHERE idempotency_key = v_cmp_idem LIMIT 1;

    IF NOT FOUND THEN
      v_complaint_id := gen_random_uuid();
      v_complaint_ref := 'CMP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(right(replace(v_complaint_id::text, '-', ''), 4));

      INSERT INTO public.complaints (
        id, reference_number, name, phone, type, message, date,
        source, category, priority, status,
        patient_id, booking_id, evaluation_id, idempotency_key
      ) VALUES (
        v_complaint_id,
        v_complaint_ref,
        v_patient_name,
        v_raw_phone,
        CASE WHEN v_feedback_type = 'suggestion' THEN 'suggestion' ELSE 'complaint' END,
        COALESCE(
          v_feedback_msg,
          NULLIF(btrim(COALESCE(_payload->>'overall_comment', '')), ''),
          'تقييم منخفض (' || v_overall::text || '/5)' || COALESCE(' - ' || v_doctor_name, '')
        ),
        COALESCE(v_visit_date, to_char(now(), 'YYYY-MM-DD')),
        'evaluation',
        v_cmp_category,
        COALESCE(v_cmp_priority, CASE WHEN v_overall <= 2 THEN 'high' ELSE 'medium' END),
        'جديدة',
        v_patient_id,
        v_booking_id,
        v_eval_id,
        v_cmp_idem
      );
    ELSE
      v_complaint_id := v_existing_cmp.id;
      v_complaint_ref := v_existing_cmp.reference_number;
    END IF;

    UPDATE public.patient_experience_evaluations
    SET complaint_id = v_complaint_id
    WHERE id = v_eval_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'deduplicated', false,
    'evaluation_id', v_eval_id,
    'evaluation_code', v_eval_code,
    'complaint_id', v_complaint_id,
    'complaint_reference', v_complaint_ref
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_patient_experience_evaluation(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_patient_experience_evaluation(jsonb) TO anon, authenticated, service_role;

-- Unified Complaint Follow-up & Status Update RPC (Keeps complaints + followups 100% synced)
CREATE OR REPLACE FUNCTION public.update_complaint_workflow(
  _complaint_id uuid,
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_staff_name text;
  v_old public.complaints%ROWTYPE;
  v_new_status text := COALESCE(NULLIF(btrim(_payload->>'status'), ''), NULL);
  v_new_priority text := COALESCE(NULLIF(btrim(_payload->>'priority'), ''), NULL);
  v_new_category text := COALESCE(NULLIF(btrim(_payload->>'category'), ''), NULL);
  v_assigned_id uuid := NULLIF(btrim(COALESCE(_payload->>'assigned_staff_id', '')), '')::uuid;
  v_assigned_name text := NULLIF(btrim(COALESCE(_payload->>'assigned_staff_name', '')), '');
  v_resolution_note text := NULLIF(btrim(COALESCE(_payload->>'resolution_note', '')), '');
  v_rejection_reason text := NULLIF(btrim(COALESCE(_payload->>'rejection_reason', '')), '');
  v_internal_notes text := NULLIF(btrim(COALESCE(_payload->>'internal_notes', '')), '');
  v_followup_date date := NULLIF(btrim(COALESCE(_payload->>'followup_date', '')), '')::date;
  v_patient_contacted boolean := CASE
    WHEN _payload ? 'patient_contacted' THEN (_payload->>'patient_contacted')::boolean
    ELSE NULL
  END;
  v_patient_sat smallint := NULLIF((_payload->>'patient_resolution_satisfaction'), '')::smallint;
  v_action_taken text := NULLIF(btrim(COALESCE(_payload->>'action_taken', '')), '');
  v_followup_note text := NULLIF(btrim(COALESCE(_payload->>'followup_note', '')), '');
  v_non_return_reason text := NULLIF(btrim(COALESCE(_payload->>'non_return_reason', '')), '');
  v_non_return_expl text := NULLIF(btrim(COALESCE(_payload->>'non_return_explanation', '')), '');
  v_is_legacy_complaints_mgr boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = v_uid
      AND COALESCE(p.is_active, true) = true
      AND p.permissions IS NOT NULL
      AND 'manage_complaints' = ANY (ARRAY(SELECT jsonb_array_elements_text(p.permissions)))
  ) INTO v_is_legacy_complaints_mgr;

  IF NOT (
    public.has_role(v_uid, 'admin')
    OR v_is_legacy_complaints_mgr
    OR public.has_general_evaluation_permission(v_uid, 'general_evaluation_manage')
    OR public.has_general_evaluation_permission(v_uid, 'general_evaluation_manage_complaints')
    OR public.has_general_evaluation_permission(v_uid, 'general_evaluation_assign_complaints')
    OR public.has_general_evaluation_permission(v_uid, 'general_evaluation_resolve_complaints')
    OR public.has_general_evaluation_permission(v_uid, 'general_evaluation_manage_followups')
  ) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تحديث الشكوى أو متابعتها';
  END IF;

  SELECT * INTO v_old FROM public.complaints WHERE id = _complaint_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الشكوى غير موجودة';
  END IF;

  -- Check assign permission if assignment changes
  IF (_payload ? 'assigned_staff_id') AND (v_assigned_id IS DISTINCT FROM v_old.assigned_staff_id) THEN
    IF NOT (
      public.has_role(v_uid, 'admin')
      OR v_is_legacy_complaints_mgr
      OR public.has_general_evaluation_permission(v_uid, 'general_evaluation_manage')
      OR public.has_general_evaluation_permission(v_uid, 'general_evaluation_manage_complaints')
      OR public.has_general_evaluation_permission(v_uid, 'general_evaluation_assign_complaints')
    ) THEN
      RAISE EXCEPTION 'ليس لديك صلاحية تعيين مسؤول للشكوى';
    END IF;
  END IF;

  -- Check resolve permission when moving to terminal states
  IF v_new_status IN ('تم الحل', 'مغلقة', 'مرفوضة مع توضيح السبب') AND (v_new_status IS DISTINCT FROM v_old.status) THEN
    IF NOT (
      public.has_role(v_uid, 'admin')
      OR v_is_legacy_complaints_mgr
      OR public.has_general_evaluation_permission(v_uid, 'general_evaluation_manage')
      OR public.has_general_evaluation_permission(v_uid, 'general_evaluation_manage_complaints')
      OR public.has_general_evaluation_permission(v_uid, 'general_evaluation_resolve_complaints')
    ) THEN
      RAISE EXCEPTION 'ليس لديك صلاحية حل أو إغلاق الشكاوى';
    END IF;
  END IF;

  SELECT name INTO v_staff_name FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  UPDATE public.complaints
  SET
    status = COALESCE(v_new_status, v_old.status),
    priority = COALESCE(v_new_priority, v_old.priority),
    category = COALESCE(v_new_category, v_old.category),
    assigned_staff_id = CASE WHEN _payload ? 'assigned_staff_id' THEN v_assigned_id ELSE v_old.assigned_staff_id END,
    assigned_staff_name = CASE WHEN _payload ? 'assigned_staff_id' THEN v_assigned_name ELSE v_old.assigned_staff_name END,
    resolution_note = COALESCE(v_resolution_note, v_old.resolution_note),
    rejection_reason = COALESCE(v_rejection_reason, v_old.rejection_reason),
    internal_notes = CASE WHEN _payload ? 'internal_notes' THEN v_internal_notes ELSE v_old.internal_notes END,
    followup_date = CASE WHEN _payload ? 'followup_date' THEN v_followup_date ELSE v_old.followup_date END,
    patient_contacted = COALESCE(v_patient_contacted, v_old.patient_contacted),
    patient_resolution_satisfaction = COALESCE(v_patient_sat, v_old.patient_resolution_satisfaction)
  WHERE id = _complaint_id;

  -- Log follow-up activity
  IF v_action_taken IS NOT NULL OR v_followup_note IS NOT NULL OR (v_new_status IS DISTINCT FROM v_old.status) OR (_payload ? 'assigned_staff_id') THEN
    INSERT INTO public.patient_experience_followups (
      complaint_id, evaluation_id, action_type, status_after,
      assigned_staff_id, assigned_staff_name, followup_date,
      action_taken, note, patient_contacted, patient_satisfaction,
      created_by_staff_id, created_by_staff_name
    ) VALUES (
      _complaint_id,
      v_old.evaluation_id,
      CASE
        WHEN v_new_status IN ('تم الحل', 'مغلقة', 'مرفوضة مع توضيح السبب') THEN 'resolution'
        WHEN (_payload ? 'assigned_staff_id') AND (v_assigned_id IS DISTINCT FROM v_old.assigned_staff_id) THEN 'assignment'
        ELSE 'followup'
      END,
      COALESCE(v_new_status, v_old.status),
      CASE WHEN _payload ? 'assigned_staff_id' THEN v_assigned_id ELSE v_old.assigned_staff_id END,
      CASE WHEN _payload ? 'assigned_staff_id' THEN v_assigned_name ELSE v_old.assigned_staff_name END,
      COALESCE(v_followup_date, v_old.followup_date),
      v_action_taken,
      COALESCE(v_followup_note, v_resolution_note, v_rejection_reason),
      COALESCE(v_patient_contacted, v_old.patient_contacted, false),
      v_patient_sat,
      v_uid,
      COALESCE(v_staff_name, 'موظف')
    );
  END IF;

  -- Optional non-return reason recorded during follow-up call
  IF v_non_return_reason IS NOT NULL THEN
    INSERT INTO public.patient_non_return_reasons (
      evaluation_id, patient_id, booking_id, reason_code, explanation, source, recorded_by_staff_id, recorded_by_staff_name
    ) VALUES (
      v_old.evaluation_id, v_old.patient_id, v_old.booking_id, v_non_return_reason, v_non_return_expl,
      'followup_call', v_uid, COALESCE(v_staff_name, 'موظف')
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'complaint_id', _complaint_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_complaint_workflow(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_complaint_workflow(uuid, jsonb) TO authenticated, service_role;

-- Add new tables to Supabase realtime publication safely
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_experience_evaluations;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_experience_followups;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_non_return_reasons;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_experience_settings;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
