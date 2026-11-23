const PARTNERS_MIGRATION_SQL = `
ALTER TABLE public.contracting_companies
  ADD COLUMN IF NOT EXISTS org_type TEXT DEFAULT 'شركة تأمين',
  ADD COLUMN IF NOT EXISTS sector TEXT,
  ADD COLUMN IF NOT EXISTS governorate TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS contact_title TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS cooperation_start_date DATE,
  ADD COLUMN IF NOT EXISTS relationship_status TEXT NOT NULL DEFAULT 'نشط',
  ADD COLUMN IF NOT EXISTS assigned_staff_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_staff_name TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contracting_companies_relationship_status_chk'
  ) THEN
    ALTER TABLE public.contracting_companies
      ADD CONSTRAINT contracting_companies_relationship_status_chk
      CHECK (relationship_status IN ('نشط', 'قيد التفاوض', 'معلق', 'منتهي'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS contracting_companies_status_idx
  ON public.contracting_companies (relationship_status, is_active, governorate);

CREATE INDEX IF NOT EXISTS contracting_companies_assigned_idx
  ON public.contracting_companies (assigned_staff_id);

CREATE OR REPLACE FUNCTION public.has_partner_permission(_uid uuid, _perm text)
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
          COALESCE(p.permissions, '[]'::jsonb) ? 'manage_partners'
          AND _perm IN (
            'partners_view',
            'partners_view_dashboard',
            'partners_view_organizations',
            'partners_create_organizations',
            'partners_edit_organizations',
            'partners_delete_organizations'
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_partner_company_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(v_uid, 'admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := COALESCE(NEW.created_by, v_uid);
      NEW.updated_by := v_uid;
      NEW.updated_at := now();
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.updated_by := v_uid;
      NEW.updated_at := now();
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT (public.has_partner_permission(v_uid, 'partners_create_organizations') OR public.has_partner_permission(v_uid, 'partners_create')) THEN
      RAISE EXCEPTION 'permission denied: partners_create_organizations required' USING ERRCODE = '42501';
    END IF;
    NEW.created_by := COALESCE(NEW.created_by, v_uid);
    NEW.updated_by := v_uid;
    NEW.updated_at := now();
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT (public.has_partner_permission(v_uid, 'partners_edit_organizations') OR public.has_partner_permission(v_uid, 'partners_edit')) THEN
      RAISE EXCEPTION 'permission denied: partners_edit_organizations required' USING ERRCODE = '42501';
    END IF;
    NEW.updated_by := v_uid;
    NEW.updated_at := now();
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT (public.has_partner_permission(v_uid, 'partners_delete_organizations') OR public.has_partner_permission(v_uid, 'partners_delete')) THEN
      RAISE EXCEPTION 'permission denied: partners_delete_organizations required' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_partner_company_permissions ON public.contracting_companies;
CREATE TRIGGER trg_enforce_partner_company_permissions
  BEFORE INSERT OR UPDATE OR DELETE ON public.contracting_companies
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_partner_company_permissions();

DROP POLICY IF EXISTS "Staff manage contracting_companies" ON public.contracting_companies;
DROP POLICY IF EXISTS "Staff read contracting_companies" ON public.contracting_companies;
CREATE POLICY "Staff read contracting_companies"
  ON public.contracting_companies
  FOR SELECT
  TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Authorized staff insert contracting_companies" ON public.contracting_companies;
CREATE POLICY "Authorized staff insert contracting_companies"
  ON public.contracting_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_partner_permission(auth.uid(), 'partners_create_organizations')
    OR public.has_partner_permission(auth.uid(), 'partners_create')
  );

DROP POLICY IF EXISTS "Authorized staff update contracting_companies" ON public.contracting_companies;
CREATE POLICY "Authorized staff update contracting_companies"
  ON public.contracting_companies
  FOR UPDATE
  TO authenticated
  USING (
    public.has_partner_permission(auth.uid(), 'partners_edit_organizations')
    OR public.has_partner_permission(auth.uid(), 'partners_edit')
  )
  WITH CHECK (
    public.has_partner_permission(auth.uid(), 'partners_edit_organizations')
    OR public.has_partner_permission(auth.uid(), 'partners_edit')
  );

DROP POLICY IF EXISTS "Authorized staff delete contracting_companies" ON public.contracting_companies;
CREATE POLICY "Authorized staff delete contracting_companies"
  ON public.contracting_companies
  FOR DELETE
  TO authenticated
  USING (
    public.has_partner_permission(auth.uid(), 'partners_delete_organizations')
    OR public.has_partner_permission(auth.uid(), 'partners_delete')
  );

CREATE TABLE IF NOT EXISTS public.partner_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES public.contracting_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  job_title TEXT,
  phone TEXT,
  email TEXT,
  department TEXT,
  importance_level TEXT NOT NULL DEFAULT 'normal' CHECK (importance_level IN ('high', 'normal', 'low')),
  communication_status TEXT NOT NULL DEFAULT 'active' CHECK (communication_status IN ('active', 'needs_followup', 'inactive')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  last_contact_at TIMESTAMPTZ,
  notes TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID DEFAULT auth.uid(),
  updated_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_contacts_company_idx
  ON public.partner_contacts (company_id, is_primary, is_archived);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_contacts TO authenticated;
GRANT ALL ON public.partner_contacts TO service_role;
ALTER TABLE public.partner_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff read partner_contacts" ON public.partner_contacts;
CREATE POLICY "Authorized staff read partner_contacts"
  ON public.partner_contacts FOR SELECT TO authenticated
  USING (
    public.has_partner_permission(auth.uid(), 'partners_manage_contacts')
    OR public.has_partner_permission(auth.uid(), 'partners_view_organizations')
    OR public.has_partner_permission(auth.uid(), 'partners_view')
  );

DROP POLICY IF EXISTS "Authorized staff write partner_contacts" ON public.partner_contacts;
CREATE POLICY "Authorized staff write partner_contacts"
  ON public.partner_contacts FOR ALL TO authenticated
  USING (public.has_partner_permission(auth.uid(), 'partners_manage_contacts'))
  WITH CHECK (public.has_partner_permission(auth.uid(), 'partners_manage_contacts'));

CREATE TABLE IF NOT EXISTS public.partner_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES public.contracting_companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.partner_contacts(id) ON DELETE SET NULL,
  contact_name TEXT,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('visit', 'meeting', 'call', 'followup', 'message')),
  activity_date DATE NOT NULL,
  activity_time TEXT,
  staff_user_id UUID,
  staff_name TEXT NOT NULL,
  goal TEXT NOT NULL CHECK (char_length(trim(goal)) > 0),
  summary TEXT,
  outcomes TEXT,
  agreements TEXT,
  next_steps TEXT,
  next_followup_date DATE,
  followup_status TEXT NOT NULL DEFAULT 'pending' CHECK (followup_status IN ('pending', 'scheduled', 'completed', 'cancelled')),
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID DEFAULT auth.uid(),
  updated_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_activities_company_date_idx
  ON public.partner_activities (company_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS partner_activities_staff_idx
  ON public.partner_activities (staff_user_id, activity_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_activities TO authenticated;
GRANT ALL ON public.partner_activities TO service_role;
ALTER TABLE public.partner_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff read partner_activities" ON public.partner_activities;
CREATE POLICY "Authorized staff read partner_activities"
  ON public.partner_activities FOR SELECT TO authenticated
  USING (public.has_partner_permission(auth.uid(), 'partners_view_activities'));

DROP POLICY IF EXISTS "Authorized staff insert partner_activities" ON public.partner_activities;
CREATE POLICY "Authorized staff insert partner_activities"
  ON public.partner_activities FOR INSERT TO authenticated
  WITH CHECK (public.has_partner_permission(auth.uid(), 'partners_create_activities'));

DROP POLICY IF EXISTS "Authorized staff update partner_activities" ON public.partner_activities;
CREATE POLICY "Authorized staff update partner_activities"
  ON public.partner_activities FOR UPDATE TO authenticated
  USING (public.has_partner_permission(auth.uid(), 'partners_edit_activities'))
  WITH CHECK (public.has_partner_permission(auth.uid(), 'partners_edit_activities'));

DROP POLICY IF EXISTS "Authorized staff delete partner_activities" ON public.partner_activities;
CREATE POLICY "Authorized staff delete partner_activities"
  ON public.partner_activities FOR DELETE TO authenticated
  USING (public.has_partner_permission(auth.uid(), 'partners_delete_activities'));

CREATE OR REPLACE FUNCTION public.sync_partner_contact_last_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE public.partner_contacts
    SET last_contact_at = GREATEST(COALESCE(last_contact_at, '-infinity'::timestamptz), now()),
        updated_at = now()
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_partner_contact_last_contact ON public.partner_activities;
CREATE TRIGGER trg_sync_partner_contact_last_contact
  AFTER INSERT OR UPDATE ON public.partner_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_partner_contact_last_contact();

CREATE TABLE IF NOT EXISTS public.partner_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES public.contracting_companies(id) ON DELETE CASCADE,
  contract_number TEXT NOT NULL CHECK (char_length(trim(contract_number)) > 0),
  contract_type TEXT NOT NULL DEFAULT 'سنوي',
  signed_date DATE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  duration_months INTEGER,
  status TEXT NOT NULL DEFAULT 'نشط' CHECK (
    status IN ('مسودة', 'تحت المراجعة', 'بانتظار التوقيع', 'نشط', 'قريب الانتهاء', 'منتهي', 'مجدد', 'ملغي')
  ),
  terms TEXT,
  discount_terms TEXT,
  responsible_staff_id UUID,
  responsible_staff_name TEXT,
  last_renewal_date DATE,
  next_renewal_date DATE,
  notes TEXT,
  attachment_path TEXT,
  attachment_name TEXT,
  parent_contract_id UUID REFERENCES public.partner_contracts(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  is_current_version BOOLEAN NOT NULL DEFAULT true,
  created_by UUID DEFAULT auth.uid(),
  updated_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_contracts_company_idx
  ON public.partner_contracts (company_id, is_current_version, end_date);
CREATE INDEX IF NOT EXISTS partner_contracts_status_end_idx
  ON public.partner_contracts (status, end_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_contracts TO authenticated;
GRANT ALL ON public.partner_contracts TO service_role;
ALTER TABLE public.partner_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff read partner_contracts" ON public.partner_contracts;
CREATE POLICY "Authorized staff read partner_contracts"
  ON public.partner_contracts FOR SELECT TO authenticated
  USING (public.has_partner_permission(auth.uid(), 'partners_view_contracts'));

DROP POLICY IF EXISTS "Authorized staff insert partner_contracts" ON public.partner_contracts;
CREATE POLICY "Authorized staff insert partner_contracts"
  ON public.partner_contracts FOR INSERT TO authenticated
  WITH CHECK (
    public.has_partner_permission(auth.uid(), 'partners_create_contracts')
    OR public.has_partner_permission(auth.uid(), 'partners_renew_contracts')
  );

DROP POLICY IF EXISTS "Authorized staff update partner_contracts" ON public.partner_contracts;
CREATE POLICY "Authorized staff update partner_contracts"
  ON public.partner_contracts FOR UPDATE TO authenticated
  USING (
    public.has_partner_permission(auth.uid(), 'partners_edit_contracts')
    OR public.has_partner_permission(auth.uid(), 'partners_renew_contracts')
    OR public.has_partner_permission(auth.uid(), 'partners_manage_contract_documents')
  )
  WITH CHECK (
    public.has_partner_permission(auth.uid(), 'partners_edit_contracts')
    OR public.has_partner_permission(auth.uid(), 'partners_renew_contracts')
    OR public.has_partner_permission(auth.uid(), 'partners_manage_contract_documents')
  );

DROP POLICY IF EXISTS "Authorized staff delete partner_contracts" ON public.partner_contracts;
CREATE POLICY "Authorized staff delete partner_contracts"
  ON public.partner_contracts FOR DELETE TO authenticated
  USING (public.has_partner_permission(auth.uid(), 'partners_delete_contracts'));

CREATE OR REPLACE FUNCTION public.enforce_partner_contract_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(v_uid, 'admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := COALESCE(NEW.created_by, v_uid);
      NEW.updated_by := v_uid;
      NEW.updated_at := now();
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.updated_by := v_uid;
      NEW.updated_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_contract_id IS NOT NULL THEN
      IF NOT public.has_partner_permission(v_uid, 'partners_renew_contracts') THEN
        RAISE EXCEPTION 'permission denied: partners_renew_contracts required' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT public.has_partner_permission(v_uid, 'partners_create_contracts') THEN
      RAISE EXCEPTION 'permission denied: partners_create_contracts required' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(trim(NEW.attachment_path), '') <> '' AND NOT public.has_partner_permission(v_uid, 'partners_manage_contract_documents') THEN
      RAISE EXCEPTION 'permission denied: partners_manage_contract_documents required' USING ERRCODE = '42501';
    END IF;
    NEW.created_by := COALESCE(NEW.created_by, v_uid);
    NEW.updated_by := v_uid;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.attachment_path IS DISTINCT FROM OLD.attachment_path OR NEW.attachment_name IS DISTINCT FROM OLD.attachment_name)
       AND NOT public.has_partner_permission(v_uid, 'partners_manage_contract_documents') THEN
      RAISE EXCEPTION 'permission denied: partners_manage_contract_documents required' USING ERRCODE = '42501';
    END IF;

    IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'مجدد' AND NEW.is_current_version = false) THEN
      IF NOT (public.has_partner_permission(v_uid, 'partners_renew_contracts') OR public.has_partner_permission(v_uid, 'partners_edit_contracts')) THEN
        RAISE EXCEPTION 'permission denied: partners_renew_contracts required' USING ERRCODE = '42501';
      END IF;
    ELSIF (NEW.contract_number IS DISTINCT FROM OLD.contract_number
        OR NEW.contract_type IS DISTINCT FROM OLD.contract_type
        OR NEW.signed_date IS DISTINCT FROM OLD.signed_date
        OR NEW.start_date IS DISTINCT FROM OLD.start_date
        OR NEW.end_date IS DISTINCT FROM OLD.end_date
        OR NEW.duration_months IS DISTINCT FROM OLD.duration_months
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.terms IS DISTINCT FROM OLD.terms
        OR NEW.discount_terms IS DISTINCT FROM OLD.discount_terms
        OR NEW.responsible_staff_id IS DISTINCT FROM OLD.responsible_staff_id
        OR NEW.responsible_staff_name IS DISTINCT FROM OLD.responsible_staff_name
        OR NEW.last_renewal_date IS DISTINCT FROM OLD.last_renewal_date
        OR NEW.next_renewal_date IS DISTINCT FROM OLD.next_renewal_date
        OR NEW.notes IS DISTINCT FROM OLD.notes)
       AND NOT public.has_partner_permission(v_uid, 'partners_edit_contracts') THEN
      RAISE EXCEPTION 'permission denied: partners_edit_contracts required' USING ERRCODE = '42501';
    END IF;

    NEW.updated_by := v_uid;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_partner_contract_permissions ON public.partner_contracts;
CREATE TRIGGER trg_enforce_partner_contract_permissions
  BEFORE INSERT OR UPDATE ON public.partner_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_partner_contract_permissions();

CREATE TABLE IF NOT EXISTS public.partner_contract_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES public.contracting_companies(id) ON DELETE CASCADE,
  previous_contract_id UUID NOT NULL REFERENCES public.partner_contracts(id) ON DELETE CASCADE,
  renewed_contract_id UUID NOT NULL REFERENCES public.partner_contracts(id) ON DELETE CASCADE,
  renewal_date DATE NOT NULL,
  new_start_date DATE NOT NULL,
  new_end_date DATE NOT NULL,
  next_renewal_date DATE,
  renewal_notes TEXT,
  renewed_by UUID DEFAULT auth.uid(),
  renewed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_contract_renewals_company_idx
  ON public.partner_contract_renewals (company_id, renewal_date DESC);

GRANT SELECT, INSERT ON public.partner_contract_renewals TO authenticated;
GRANT ALL ON public.partner_contract_renewals TO service_role;
ALTER TABLE public.partner_contract_renewals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff read partner_contract_renewals" ON public.partner_contract_renewals;
CREATE POLICY "Authorized staff read partner_contract_renewals"
  ON public.partner_contract_renewals FOR SELECT TO authenticated
  USING (public.has_partner_permission(auth.uid(), 'partners_view_contracts'));

DROP POLICY IF EXISTS "Authorized staff insert partner_contract_renewals" ON public.partner_contract_renewals;
CREATE POLICY "Authorized staff insert partner_contract_renewals"
  ON public.partner_contract_renewals FOR INSERT TO authenticated
  WITH CHECK (public.has_partner_permission(auth.uid(), 'partners_renew_contracts'));

CREATE TABLE IF NOT EXISTS public.partner_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES public.contracting_companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.partner_contacts(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.partner_contracts(id) ON DELETE SET NULL,
  activity_id UUID REFERENCES public.partner_activities(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  assignee_user_id UUID,
  assignee_name TEXT,
  created_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Cairo')::date),
  due_date DATE NOT NULL,
  followup_type TEXT NOT NULL DEFAULT 'متابعة عامة',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'جديدة' CHECK (
    status IN ('جديدة', 'قيد التنفيذ', 'بانتظار الرد', 'مكتملة', 'متأخرة', 'ملغاة')
  ),
  outcome TEXT,
  closed_at TIMESTAMPTZ,
  created_by UUID DEFAULT auth.uid(),
  updated_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_followups_company_due_idx
  ON public.partner_followups (company_id, status, due_date);
CREATE INDEX IF NOT EXISTS partner_followups_assignee_idx
  ON public.partner_followups (assignee_user_id, status, due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_followups TO authenticated;
GRANT ALL ON public.partner_followups TO service_role;
ALTER TABLE public.partner_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff read partner_followups" ON public.partner_followups;
CREATE POLICY "Authorized staff read partner_followups"
  ON public.partner_followups FOR SELECT TO authenticated
  USING (
    public.has_partner_permission(auth.uid(), 'partners_view_followups')
    OR public.has_partner_permission(auth.uid(), 'partners_manage_renewal_alerts')
  );

DROP POLICY IF EXISTS "Authorized staff insert partner_followups" ON public.partner_followups;
CREATE POLICY "Authorized staff insert partner_followups"
  ON public.partner_followups FOR INSERT TO authenticated
  WITH CHECK (public.has_partner_permission(auth.uid(), 'partners_create_followups'));

DROP POLICY IF EXISTS "Authorized staff update partner_followups" ON public.partner_followups;
CREATE POLICY "Authorized staff update partner_followups"
  ON public.partner_followups FOR UPDATE TO authenticated
  USING (
    public.has_partner_permission(auth.uid(), 'partners_edit_followups')
    OR public.has_partner_permission(auth.uid(), 'partners_assign_followups')
  )
  WITH CHECK (
    public.has_partner_permission(auth.uid(), 'partners_edit_followups')
    OR public.has_partner_permission(auth.uid(), 'partners_assign_followups')
  );

DROP POLICY IF EXISTS "Authorized staff delete partner_followups" ON public.partner_followups;
CREATE POLICY "Authorized staff delete partner_followups"
  ON public.partner_followups FOR DELETE TO authenticated
  USING (public.has_partner_permission(auth.uid(), 'partners_edit_followups'));

CREATE TABLE IF NOT EXISTS public.partner_alert_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  alert_days INTEGER[] NOT NULL DEFAULT ARRAY[90, 60, 30, 15, 7, 0],
  notify_overdue BOOLEAN NOT NULL DEFAULT true,
  auto_mark_expiring_days INTEGER NOT NULL DEFAULT 30,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.partner_alert_settings (id, alert_days, notify_overdue, auto_mark_expiring_days)
VALUES (1, ARRAY[90, 60, 30, 15, 7, 0], true, 30)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.partner_alert_settings TO authenticated;
GRANT ALL ON public.partner_alert_settings TO service_role;
ALTER TABLE public.partner_alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff read partner_alert_settings" ON public.partner_alert_settings;
CREATE POLICY "Authorized staff read partner_alert_settings"
  ON public.partner_alert_settings FOR SELECT TO authenticated
  USING (
    public.has_partner_permission(auth.uid(), 'partners_view')
    OR public.has_partner_permission(auth.uid(), 'partners_view_contracts')
    OR public.has_partner_permission(auth.uid(), 'partners_manage_renewal_alerts')
    OR public.has_partner_permission(auth.uid(), 'partners_manage_settings')
  );

DROP POLICY IF EXISTS "Authorized staff insert partner_alert_settings" ON public.partner_alert_settings;
CREATE POLICY "Authorized staff insert partner_alert_settings"
  ON public.partner_alert_settings FOR INSERT TO authenticated
  WITH CHECK (
    id = 1
    AND (
      public.has_partner_permission(auth.uid(), 'partners_manage_renewal_alerts')
      OR public.has_partner_permission(auth.uid(), 'partners_manage_settings')
    )
  );

DROP POLICY IF EXISTS "Authorized staff update partner_alert_settings" ON public.partner_alert_settings;
CREATE POLICY "Authorized staff update partner_alert_settings"
  ON public.partner_alert_settings FOR UPDATE TO authenticated
  USING (
    public.has_partner_permission(auth.uid(), 'partners_manage_renewal_alerts')
    OR public.has_partner_permission(auth.uid(), 'partners_manage_settings')
  )
  WITH CHECK (
    public.has_partner_permission(auth.uid(), 'partners_manage_renewal_alerts')
    OR public.has_partner_permission(auth.uid(), 'partners_manage_settings')
  );

CREATE TABLE IF NOT EXISTS public.partner_renewal_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.partner_contracts(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES public.contracting_companies(id) ON DELETE CASCADE,
  threshold_days INTEGER NOT NULL,
  alert_date DATE NOT NULL,
  notification_id UUID REFERENCES public.app_notifications(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT partner_renewal_alert_unique UNIQUE (contract_id, threshold_days, alert_date)
);

CREATE INDEX IF NOT EXISTS partner_renewal_alert_logs_date_idx
  ON public.partner_renewal_alert_logs (alert_date DESC, company_id);

GRANT SELECT, INSERT ON public.partner_renewal_alert_logs TO authenticated;
GRANT ALL ON public.partner_renewal_alert_logs TO service_role;
ALTER TABLE public.partner_renewal_alert_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff read partner_renewal_alert_logs" ON public.partner_renewal_alert_logs;
CREATE POLICY "Authorized staff read partner_renewal_alert_logs"
  ON public.partner_renewal_alert_logs FOR SELECT TO authenticated
  USING (
    public.has_partner_permission(auth.uid(), 'partners_view_contracts')
    OR public.has_partner_permission(auth.uid(), 'partners_manage_renewal_alerts')
    OR public.has_partner_permission(auth.uid(), 'partners_view_followups')
  );

DROP POLICY IF EXISTS "Authorized staff insert partner_renewal_alert_logs" ON public.partner_renewal_alert_logs;
CREATE POLICY "Authorized staff insert partner_renewal_alert_logs"
  ON public.partner_renewal_alert_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.has_partner_permission(auth.uid(), 'partners_view')
    OR public.has_partner_permission(auth.uid(), 'partners_manage_renewal_alerts')
    OR public.has_partner_permission(auth.uid(), 'partners_view_contracts')
  );

CREATE TABLE IF NOT EXISTS public.partner_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID DEFAULT auth.uid(),
  actor_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  company_id INTEGER,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_audit_logs_created_idx
  ON public.partner_audit_logs (created_at DESC, company_id);

GRANT SELECT, INSERT ON public.partner_audit_logs TO authenticated;
GRANT ALL ON public.partner_audit_logs TO service_role;
ALTER TABLE public.partner_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized staff read partner_audit_logs" ON public.partner_audit_logs;
CREATE POLICY "Authorized staff read partner_audit_logs"
  ON public.partner_audit_logs FOR SELECT TO authenticated
  USING (
    public.has_partner_permission(auth.uid(), 'partners_view')
    OR public.has_partner_permission(auth.uid(), 'partners_view_dashboard')
  );

DROP POLICY IF EXISTS "Authorized staff insert partner_audit_logs" ON public.partner_audit_logs;
CREATE POLICY "Authorized staff insert partner_audit_logs"
  ON public.partner_audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff_or_admin(auth.uid())
    AND actor_user_id = auth.uid()
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'partner-contract-documents',
  'partner-contract-documents',
  false,
  15728640,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Authorized staff read partner documents" ON storage.objects;
CREATE POLICY "Authorized staff read partner documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'partner-contract-documents'
    AND (
      public.has_partner_permission(auth.uid(), 'partners_view_contracts')
      OR public.has_partner_permission(auth.uid(), 'partners_manage_contract_documents')
      OR public.has_partner_permission(auth.uid(), 'partners_view_activities')
    )
  );

DROP POLICY IF EXISTS "Authorized staff upload partner documents" ON storage.objects;
CREATE POLICY "Authorized staff upload partner documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'partner-contract-documents'
    AND lower(storage.extension(name)) IN ('pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx')
    AND (
      public.has_partner_permission(auth.uid(), 'partners_manage_contract_documents')
      OR public.has_partner_permission(auth.uid(), 'partners_create_activities')
      OR public.has_partner_permission(auth.uid(), 'partners_edit_activities')
    )
  );

DROP POLICY IF EXISTS "Authorized staff update partner documents" ON storage.objects;
CREATE POLICY "Authorized staff update partner documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'partner-contract-documents'
    AND (
      public.has_partner_permission(auth.uid(), 'partners_manage_contract_documents')
      OR public.has_partner_permission(auth.uid(), 'partners_edit_activities')
    )
  )
  WITH CHECK (
    bucket_id = 'partner-contract-documents'
    AND lower(storage.extension(name)) IN ('pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx')
  );

DROP POLICY IF EXISTS "Authorized staff delete partner documents" ON storage.objects;
CREATE POLICY "Authorized staff delete partner documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'partner-contract-documents'
    AND (
      public.has_partner_permission(auth.uid(), 'partners_manage_contract_documents')
      OR public.has_partner_permission(auth.uid(), 'partners_delete_contracts')
      OR public.has_partner_permission(auth.uid(), 'partners_delete_activities')
    )
  );

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'partner_contacts',
    'partner_activities',
    'partner_contracts',
    'partner_contract_renewals',
    'partner_followups',
    'partner_alert_settings',
    'partner_renewal_alert_logs',
    'partner_audit_logs'
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
    VALUES ('0021_partners_of_success_system.sql')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
`;

let migrationInFlight: Promise<{ ok: boolean; migrated: boolean }> | null = null;

export async function tryApplyPartnersMigration(): Promise<{ ok: boolean; migrated: boolean }> {
  if (migrationInFlight) return migrationInFlight;

  migrationInFlight = (async () => {
    const dbUrl =
      process.env["LOVABLE_DB_MIGRATION_URL"] ||
      process.env["PROD_DATABASE_URL"] ||
      process.env["DATABASE_URL"];

    if (!dbUrl) {
      return { ok: true, migrated: false };
    }

    const { default: postgres } = await import("postgres");
    const sql = postgres(dbUrl, { max: 1, connect_timeout: 5, idle_timeout: 5 });
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(PARTNERS_MIGRATION_SQL);
      });
      return { ok: true, migrated: true };
    } catch (err) {
      console.warn("Auto-applying partners migration failed:", err instanceof Error ? err.message : err);
      return { ok: false, migrated: false };
    } finally {
      await sql.end({ timeout: 3 }).catch(() => undefined);
    }
  })();

  try {
    return await migrationInFlight;
  } finally {
    migrationInFlight = null;
  }
}

export async function getSignedPartnerDocumentUrlServer(
  storagePath: string,
  userId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const cleanPath = (storagePath || "").trim().replace(/^\/+/, "");
  if (!cleanPath || cleanPath.includes("..")) {
    return { status: 400, body: { error: "Invalid document path" } };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: roleRows }, { data: profileRow }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin
      .from("profiles")
      .select("permissions, is_active")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const isAdmin = Array.isArray(roleRows) && roleRows.some((r) => r.role === "admin");
  const perms = Array.isArray(profileRow?.permissions) ? (profileRow?.permissions as string[]) : [];
  const allowed =
    isAdmin ||
    (profileRow?.is_active !== false &&
      (perms.includes("partners_view_contracts") ||
        perms.includes("partners_manage_contract_documents") ||
        perms.includes("partners_view_activities")));

  if (!allowed) {
    return { status: 403, body: { error: "Forbidden" } };
  }

  const { data: signed, error } = await supabaseAdmin.storage
    .from("partner-contract-documents")
    .createSignedUrl(cleanPath, 300);

  if (error || !signed?.signedUrl) {
    return { status: 500, body: { error: error?.message || "Failed to generate document URL" } };
  }

  return { status: 200, body: { url: signed.signedUrl } };
}
