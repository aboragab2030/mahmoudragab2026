-- Offers Management System: table, indexes, RLS policies, action-level trigger,
-- realtime publication, and offer-images storage bucket + policies.

CREATE TABLE IF NOT EXISTS public.offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  description TEXT,
  offer_price NUMERIC(10, 2) NOT NULL CHECK (offer_price > 0),
  original_price NUMERIC(10, 2) CHECK (original_price IS NULL OR original_price > offer_price),
  discount_percentage INTEGER CHECK (discount_percentage IS NULL OR (discount_percentage >= 0 AND discount_percentage <= 100)),
  image_url TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  is_active BOOLEAN NOT NULL DEFAULT true,
  show_on_homepage BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  button_text TEXT NOT NULL DEFAULT 'احجز الآن',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS offers_homepage_idx
  ON public.offers (is_active, show_on_homepage, start_date, end_date, display_order);

CREATE INDEX IF NOT EXISTS offers_doctor_idx
  ON public.offers (doctor_id);

-- Grants
GRANT SELECT ON public.offers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers TO authenticated;
GRANT ALL ON public.offers TO service_role;

-- Permission helper aligned with existing staff profile permission pattern
CREATE OR REPLACE FUNCTION public.has_offer_permission(_uid uuid, _perm text)
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
      AND COALESCE(p.permissions, '[]'::jsonb) ? _perm
  );
$$;

-- Server-side per-action & per-column permission enforcement trigger
CREATE OR REPLACE FUNCTION public.enforce_offer_permissions()
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
      NEW.updated_at := now();
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.updated_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.has_offer_permission(v_uid, 'create_offers') THEN
      RAISE EXCEPTION 'permission denied: create_offers required' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(trim(NEW.image_url), '') <> '' AND NOT public.has_offer_permission(v_uid, 'upload_offer_images') THEN
      RAISE EXCEPTION 'permission denied: upload_offer_images required' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_offer_permission(v_uid, 'manage_offer_visibility') THEN
      NEW.is_active := false;
      NEW.show_on_homepage := false;
      NEW.display_order := 0;
    END IF;
    NEW.created_by := v_uid;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.is_active IS DISTINCT FROM OLD.is_active
        OR NEW.show_on_homepage IS DISTINCT FROM OLD.show_on_homepage
        OR NEW.display_order IS DISTINCT FROM OLD.display_order)
       AND NOT public.has_offer_permission(v_uid, 'manage_offer_visibility') THEN
      RAISE EXCEPTION 'permission denied: manage_offer_visibility required' USING ERRCODE = '42501';
    END IF;

    IF (NEW.image_url IS DISTINCT FROM OLD.image_url)
       AND NOT public.has_offer_permission(v_uid, 'upload_offer_images') THEN
      RAISE EXCEPTION 'permission denied: upload_offer_images required' USING ERRCODE = '42501';
    END IF;

    IF (NEW.title IS DISTINCT FROM OLD.title
        OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.offer_price IS DISTINCT FROM OLD.offer_price
        OR NEW.original_price IS DISTINCT FROM OLD.original_price
        OR NEW.discount_percentage IS DISTINCT FROM OLD.discount_percentage
        OR NEW.start_date IS DISTINCT FROM OLD.start_date
        OR NEW.end_date IS DISTINCT FROM OLD.end_date
        OR NEW.button_text IS DISTINCT FROM OLD.button_text)
       AND NOT public.has_offer_permission(v_uid, 'edit_offers') THEN
      RAISE EXCEPTION 'permission denied: edit_offers required' USING ERRCODE = '42501';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_offer_permissions ON public.offers;
CREATE TRIGGER trg_enforce_offer_permissions
  BEFORE INSERT OR UPDATE ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_offer_permissions();

-- Row Level Security
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active homepage offers" ON public.offers;
CREATE POLICY "Public read active homepage offers"
  ON public.offers
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND show_on_homepage = true
    AND ((now() AT TIME ZONE 'Africa/Cairo')::date BETWEEN start_date AND end_date)
    AND EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = doctor_id)
  );

DROP POLICY IF EXISTS "Staff read offers" ON public.offers;
CREATE POLICY "Staff read offers"
  ON public.offers
  FOR SELECT
  TO authenticated
  USING (public.has_offer_permission(auth.uid(), 'view_offers'));

DROP POLICY IF EXISTS "Staff insert offers" ON public.offers;
CREATE POLICY "Staff insert offers"
  ON public.offers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_offer_permission(auth.uid(), 'create_offers'));

DROP POLICY IF EXISTS "Staff update offers" ON public.offers;
CREATE POLICY "Staff update offers"
  ON public.offers
  FOR UPDATE
  TO authenticated
  USING (
    public.has_offer_permission(auth.uid(), 'edit_offers')
    OR public.has_offer_permission(auth.uid(), 'manage_offer_visibility')
    OR public.has_offer_permission(auth.uid(), 'upload_offer_images')
  )
  WITH CHECK (
    public.has_offer_permission(auth.uid(), 'edit_offers')
    OR public.has_offer_permission(auth.uid(), 'manage_offer_visibility')
    OR public.has_offer_permission(auth.uid(), 'upload_offer_images')
  );

DROP POLICY IF EXISTS "Staff delete offers" ON public.offers;
CREATE POLICY "Staff delete offers"
  ON public.offers
  FOR DELETE
  TO authenticated
  USING (public.has_offer_permission(auth.uid(), 'delete_offers'));

-- Realtime support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.offers;
  END IF;
END $$;

-- Dedicated storage bucket for offer images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'offer-images',
  'offer-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read offer images" ON storage.objects;
CREATE POLICY "Public read offer images"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'offer-images');

DROP POLICY IF EXISTS "Authorized staff upload offer images" ON storage.objects;
CREATE POLICY "Authorized staff upload offer images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'offer-images'
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
    AND public.has_offer_permission(auth.uid(), 'upload_offer_images')
  );

DROP POLICY IF EXISTS "Authorized staff update offer images" ON storage.objects;
CREATE POLICY "Authorized staff update offer images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'offer-images'
    AND public.has_offer_permission(auth.uid(), 'upload_offer_images')
  )
  WITH CHECK (
    bucket_id = 'offer-images'
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
    AND public.has_offer_permission(auth.uid(), 'upload_offer_images')
  );

DROP POLICY IF EXISTS "Authorized staff delete offer images" ON storage.objects;
CREATE POLICY "Authorized staff delete offer images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'offer-images'
    AND (
      public.has_offer_permission(auth.uid(), 'upload_offer_images')
      OR public.has_offer_permission(auth.uid(), 'delete_offers')
    )
  );
