const MEDICAL_VIDEOS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS public.medical_video_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name_ar TEXT NOT NULL CHECK (char_length(trim(name_ar)) > 0),
  name_en TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medical_video_categories_active_order_idx
  ON public.medical_video_categories (is_active, display_order, created_at);

CREATE TABLE IF NOT EXISTS public.medical_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title_ar TEXT NOT NULL CHECK (char_length(trim(title_ar)) > 0),
  title_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  thumbnail_url TEXT,
  video_source_type TEXT NOT NULL CHECK (video_source_type IN ('youtube', 'vimeo', 'mp4', 'upload')),
  video_url TEXT,
  storage_path TEXT,
  category_id UUID REFERENCES public.medical_video_categories(id) ON DELETE SET NULL,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  specialty TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_published BOOLEAN NOT NULL DEFAULT false,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_by UUID DEFAULT auth.uid(),
  updated_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT medical_videos_source_payload_chk CHECK (
    (video_source_type = 'upload' AND (COALESCE(trim(storage_path), '') <> '' OR COALESCE(trim(video_url), '') <> ''))
    OR (video_source_type IN ('youtube', 'vimeo', 'mp4') AND COALESCE(trim(video_url), '') <> '')
  )
);

CREATE INDEX IF NOT EXISTS medical_videos_public_idx
  ON public.medical_videos (is_active, is_published, is_featured, display_order, published_at DESC);

CREATE INDEX IF NOT EXISTS medical_videos_category_idx
  ON public.medical_videos (category_id);

CREATE INDEX IF NOT EXISTS medical_videos_doctor_idx
  ON public.medical_videos (doctor_id);

INSERT INTO public.medical_video_categories (name_ar, name_en, is_active, display_order)
SELECT v.name_ar, v.name_en, true, v.display_order
FROM (
  VALUES
    ('أمراض العيون', 'Eye Diseases', 1),
    ('المياه البيضاء', 'Cataract', 2),
    ('القرنية', 'Cornea', 3),
    ('الليزك وتصحيح الإبصار', 'LASIK & Vision Correction', 4),
    ('الشبكية والجسم الزجاجي', 'Retina & Vitreous', 5),
    ('الحول وعيون الأطفال', 'Strabismus & Pediatric Ophthalmology', 6),
    ('الجلوكوما والمياه الزرقاء', 'Glaucoma', 7),
    ('تجميل العيون', 'Oculoplastic Surgery', 8),
    ('الفحوصات الطبية', 'Medical Examinations', 9),
    ('نصائح وإرشادات طبية', 'Medical Advice & Guidelines', 10),
    ('فيديوهات الأطباء', 'Doctors Videos', 11),
    ('أخرى', 'Other', 12)
) AS v(name_ar, name_en, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.medical_video_categories LIMIT 1);

GRANT SELECT ON public.medical_video_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_video_categories TO authenticated;
GRANT ALL ON public.medical_video_categories TO service_role;

GRANT SELECT ON public.medical_videos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_videos TO authenticated;
GRANT ALL ON public.medical_videos TO service_role;

CREATE OR REPLACE FUNCTION public.has_medical_video_permission(_uid uuid, _perm text)
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

CREATE OR REPLACE FUNCTION public.enforce_medical_video_category_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(v_uid, 'admin') THEN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
      NEW.updated_at := now();
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF NOT public.has_medical_video_permission(v_uid, 'medical_videos_manage_categories') THEN
    RAISE EXCEPTION 'permission denied: medical_videos_manage_categories required' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_medical_video_category_permissions ON public.medical_video_categories;
CREATE TRIGGER trg_enforce_medical_video_category_permissions
  BEFORE INSERT OR UPDATE OR DELETE ON public.medical_video_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_medical_video_category_permissions();

CREATE OR REPLACE FUNCTION public.enforce_medical_video_permissions()
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
      IF NEW.is_published = true AND NEW.published_at IS NULL THEN
        NEW.published_at := now();
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.updated_by := v_uid;
      NEW.updated_at := now();
      IF NEW.is_published = true AND OLD.is_published IS DISTINCT FROM true AND NEW.published_at IS NULL THEN
        NEW.published_at := now();
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.has_medical_video_permission(v_uid, 'medical_videos_create') THEN
      RAISE EXCEPTION 'permission denied: medical_videos_create required' USING ERRCODE = '42501';
    END IF;
    IF (COALESCE(trim(NEW.thumbnail_url), '') <> '' OR COALESCE(trim(NEW.storage_path), '') <> '')
       AND NOT public.has_medical_video_permission(v_uid, 'medical_videos_upload') THEN
      RAISE EXCEPTION 'permission denied: medical_videos_upload required' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_medical_video_permission(v_uid, 'medical_videos_publish') THEN
      NEW.is_published := false;
      NEW.published_at := NULL;
    ELSIF NEW.is_published = true AND NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
    IF NOT public.has_medical_video_permission(v_uid, 'medical_videos_manage_featured') THEN
      NEW.is_featured := false;
    END IF;
    NEW.created_by := v_uid;
    NEW.updated_by := v_uid;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.is_published IS DISTINCT FROM OLD.is_published
        OR NEW.published_at IS DISTINCT FROM OLD.published_at)
       AND NOT public.has_medical_video_permission(v_uid, 'medical_videos_publish') THEN
      RAISE EXCEPTION 'permission denied: medical_videos_publish required' USING ERRCODE = '42501';
    END IF;

    IF (NEW.is_featured IS DISTINCT FROM OLD.is_featured)
       AND NOT public.has_medical_video_permission(v_uid, 'medical_videos_manage_featured') THEN
      RAISE EXCEPTION 'permission denied: medical_videos_manage_featured required' USING ERRCODE = '42501';
    END IF;

    IF (NEW.thumbnail_url IS DISTINCT FROM OLD.thumbnail_url
        OR NEW.storage_path IS DISTINCT FROM OLD.storage_path)
       AND NOT public.has_medical_video_permission(v_uid, 'medical_videos_upload') THEN
      RAISE EXCEPTION 'permission denied: medical_videos_upload required' USING ERRCODE = '42501';
    END IF;

    IF (NEW.title_ar IS DISTINCT FROM OLD.title_ar
        OR NEW.title_en IS DISTINCT FROM OLD.title_en
        OR NEW.description_ar IS DISTINCT FROM OLD.description_ar
        OR NEW.description_en IS DISTINCT FROM OLD.description_en
        OR NEW.video_source_type IS DISTINCT FROM OLD.video_source_type
        OR NEW.video_url IS DISTINCT FROM OLD.video_url
        OR NEW.category_id IS DISTINCT FROM OLD.category_id
        OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
        OR NEW.specialty IS DISTINCT FROM OLD.specialty
        OR NEW.is_active IS DISTINCT FROM OLD.is_active
        OR NEW.display_order IS DISTINCT FROM OLD.display_order)
       AND NOT public.has_medical_video_permission(v_uid, 'medical_videos_edit') THEN
      RAISE EXCEPTION 'permission denied: medical_videos_edit required' USING ERRCODE = '42501';
    END IF;

    IF NEW.is_published = true AND OLD.is_published IS DISTINCT FROM true AND NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
    NEW.updated_by := v_uid;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_medical_video_permissions ON public.medical_videos;
CREATE TRIGGER trg_enforce_medical_video_permissions
  BEFORE INSERT OR UPDATE ON public.medical_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_medical_video_permissions();

ALTER TABLE public.medical_video_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active medical video categories" ON public.medical_video_categories;
CREATE POLICY "Public read active medical video categories"
  ON public.medical_video_categories
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Staff read medical video categories" ON public.medical_video_categories;
CREATE POLICY "Staff read medical video categories"
  ON public.medical_video_categories
  FOR SELECT
  TO authenticated
  USING (
    public.has_medical_video_permission(auth.uid(), 'medical_videos_view')
    OR public.has_medical_video_permission(auth.uid(), 'medical_videos_manage_categories')
  );

DROP POLICY IF EXISTS "Staff insert medical video categories" ON public.medical_video_categories;
CREATE POLICY "Staff insert medical video categories"
  ON public.medical_video_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_medical_video_permission(auth.uid(), 'medical_videos_manage_categories'));

DROP POLICY IF EXISTS "Staff update medical video categories" ON public.medical_video_categories;
CREATE POLICY "Staff update medical video categories"
  ON public.medical_video_categories
  FOR UPDATE
  TO authenticated
  USING (public.has_medical_video_permission(auth.uid(), 'medical_videos_manage_categories'))
  WITH CHECK (public.has_medical_video_permission(auth.uid(), 'medical_videos_manage_categories'));

DROP POLICY IF EXISTS "Staff delete medical video categories" ON public.medical_video_categories;
CREATE POLICY "Staff delete medical video categories"
  ON public.medical_video_categories
  FOR DELETE
  TO authenticated
  USING (public.has_medical_video_permission(auth.uid(), 'medical_videos_manage_categories'));

ALTER TABLE public.medical_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published medical videos" ON public.medical_videos;
CREATE POLICY "Public read published medical videos"
  ON public.medical_videos
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND is_published = true);

DROP POLICY IF EXISTS "Staff read medical videos" ON public.medical_videos;
CREATE POLICY "Staff read medical videos"
  ON public.medical_videos
  FOR SELECT
  TO authenticated
  USING (public.has_medical_video_permission(auth.uid(), 'medical_videos_view'));

DROP POLICY IF EXISTS "Staff insert medical videos" ON public.medical_videos;
CREATE POLICY "Staff insert medical videos"
  ON public.medical_videos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_medical_video_permission(auth.uid(), 'medical_videos_create'));

DROP POLICY IF EXISTS "Staff update medical videos" ON public.medical_videos;
CREATE POLICY "Staff update medical videos"
  ON public.medical_videos
  FOR UPDATE
  TO authenticated
  USING (
    public.has_medical_video_permission(auth.uid(), 'medical_videos_edit')
    OR public.has_medical_video_permission(auth.uid(), 'medical_videos_publish')
    OR public.has_medical_video_permission(auth.uid(), 'medical_videos_manage_featured')
    OR public.has_medical_video_permission(auth.uid(), 'medical_videos_upload')
  )
  WITH CHECK (
    public.has_medical_video_permission(auth.uid(), 'medical_videos_edit')
    OR public.has_medical_video_permission(auth.uid(), 'medical_videos_publish')
    OR public.has_medical_video_permission(auth.uid(), 'medical_videos_manage_featured')
    OR public.has_medical_video_permission(auth.uid(), 'medical_videos_upload')
  );

DROP POLICY IF EXISTS "Staff delete medical videos" ON public.medical_videos;
CREATE POLICY "Staff delete medical videos"
  ON public.medical_videos
  FOR DELETE
  TO authenticated
  USING (public.has_medical_video_permission(auth.uid(), 'medical_videos_delete'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'medical_video_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.medical_video_categories;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'medical_videos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.medical_videos;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-video-thumbnails',
  'medical-video-thumbnails',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read medical video thumbnails" ON storage.objects;
CREATE POLICY "Public read medical video thumbnails"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'medical-video-thumbnails');

DROP POLICY IF EXISTS "Authorized staff upload medical video thumbnails" ON storage.objects;
CREATE POLICY "Authorized staff upload medical video thumbnails"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'medical-video-thumbnails'
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
    AND public.has_medical_video_permission(auth.uid(), 'medical_videos_upload')
  );

DROP POLICY IF EXISTS "Authorized staff update medical video thumbnails" ON storage.objects;
CREATE POLICY "Authorized staff update medical video thumbnails"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'medical-video-thumbnails'
    AND public.has_medical_video_permission(auth.uid(), 'medical_videos_upload')
  )
  WITH CHECK (
    bucket_id = 'medical-video-thumbnails'
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
    AND public.has_medical_video_permission(auth.uid(), 'medical_videos_upload')
  );

DROP POLICY IF EXISTS "Authorized staff delete medical video thumbnails" ON storage.objects;
CREATE POLICY "Authorized staff delete medical video thumbnails"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'medical-video-thumbnails'
    AND (
      public.has_medical_video_permission(auth.uid(), 'medical_videos_upload')
      OR public.has_medical_video_permission(auth.uid(), 'medical_videos_delete')
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-video-files',
  'medical-video-files',
  false,
  104857600,
  ARRAY['video/mp4', 'video/webm', 'video/ogg']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Authorized staff read medical video files" ON storage.objects;
CREATE POLICY "Authorized staff read medical video files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'medical-video-files'
    AND (
      public.has_medical_video_permission(auth.uid(), 'medical_videos_view')
      OR public.has_medical_video_permission(auth.uid(), 'medical_videos_upload')
    )
  );

DROP POLICY IF EXISTS "Authorized staff upload medical video files" ON storage.objects;
CREATE POLICY "Authorized staff upload medical video files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'medical-video-files'
    AND lower(storage.extension(name)) IN ('mp4', 'webm', 'ogg')
    AND public.has_medical_video_permission(auth.uid(), 'medical_videos_upload')
  );

DROP POLICY IF EXISTS "Authorized staff update medical video files" ON storage.objects;
CREATE POLICY "Authorized staff update medical video files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'medical-video-files'
    AND public.has_medical_video_permission(auth.uid(), 'medical_videos_upload')
  )
  WITH CHECK (
    bucket_id = 'medical-video-files'
    AND lower(storage.extension(name)) IN ('mp4', 'webm', 'ogg')
    AND public.has_medical_video_permission(auth.uid(), 'medical_videos_upload')
  );

DROP POLICY IF EXISTS "Authorized staff delete medical video files" ON storage.objects;
CREATE POLICY "Authorized staff delete medical video files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'medical-video-files'
    AND (
      public.has_medical_video_permission(auth.uid(), 'medical_videos_upload')
      OR public.has_medical_video_permission(auth.uid(), 'medical_videos_delete')
    )
  );

DO $$
BEGIN
  IF to_regclass('ops.applied_migrations') IS NOT NULL THEN
    INSERT INTO ops.applied_migrations (name)
    VALUES ('0019_medical_videos_library.sql')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
`;

let migrationInFlight: Promise<{ ok: boolean; migrated: boolean }> | null = null;

export async function tryApplyMedicalVideosMigration(): Promise<{ ok: boolean; migrated: boolean }> {
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
        await tx.unsafe(MEDICAL_VIDEOS_MIGRATION_SQL);
      });
      return { ok: true, migrated: true };
    } catch (err) {
      console.warn("Auto-applying medical videos migration failed:", err instanceof Error ? err.message : err);
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getSignedMedicalVideoUrlServer(
  videoId: string,
  authHeader?: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!videoId || !UUID_RE.test(videoId)) {
    return { status: 400, body: { error: "Invalid video id" } };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: video, error } = await supabaseAdmin
    .from("medical_videos")
    .select("id, is_active, is_published, video_source_type, storage_path, video_url")
    .eq("id", videoId)
    .maybeSingle();

  if (error || !video) {
    return { status: 404, body: { error: "Video not found" } };
  }

  const isPubliclyVisible = video.is_active === true && video.is_published === true;

  if (!isPubliclyVisible) {
    let authorizedStaff = false;
    const token =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : "";
    if (token && token.split(".").length === 3) {
      const { data: userRes } = await supabaseAdmin.auth.getUser(token);
      const uid = userRes?.user?.id;
      if (uid) {
        const [{ data: roleRows }, { data: profileRow }] = await Promise.all([
          supabaseAdmin.from("user_roles").select("role").eq("user_id", uid),
          supabaseAdmin
            .from("profiles")
            .select("permissions, is_active")
            .eq("user_id", uid)
            .maybeSingle(),
        ]);
        const isAdmin = Array.isArray(roleRows) && roleRows.some((r) => r.role === "admin");
        const isActiveStaff =
          profileRow?.is_active !== false &&
          Array.isArray(profileRow?.permissions) &&
          profileRow.permissions.includes("medical_videos_view");
        authorizedStaff = isAdmin || isActiveStaff;
      }
    }

    if (!authorizedStaff) {
      return { status: 403, body: { error: "Forbidden" } };
    }
  }

  if (video.video_source_type !== "upload" || !video.storage_path) {
    return { status: 200, body: { url: video.video_url || "" } };
  }

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from("medical-video-files")
    .createSignedUrl(video.storage_path, 3600);

  if (signErr || !signed?.signedUrl) {
    return { status: 500, body: { error: signErr?.message || "Failed to sign video URL" } };
  }

  return { status: 200, body: { url: signed.signedUrl } };
}
