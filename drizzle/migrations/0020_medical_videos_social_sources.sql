-- Add Facebook, Instagram, and X (Twitter) as allowed video_source_type options
-- in public.medical_videos while preserving existing rows and constraints.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'medical_videos'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%video_source_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.medical_videos DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.medical_videos
  ADD CONSTRAINT medical_videos_video_source_type_chk
  CHECK (video_source_type IN ('youtube', 'vimeo', 'facebook', 'instagram', 'x', 'mp4', 'upload'));

ALTER TABLE public.medical_videos
  ADD CONSTRAINT medical_videos_source_payload_chk
  CHECK (
    (video_source_type = 'upload' AND (COALESCE(trim(storage_path), '') <> '' OR COALESCE(trim(video_url), '') <> ''))
    OR (video_source_type IN ('youtube', 'vimeo', 'facebook', 'instagram', 'x', 'mp4') AND COALESCE(trim(video_url), '') <> '')
  );

DO $$
BEGIN
  IF to_regclass('ops.applied_migrations') IS NOT NULL THEN
    INSERT INTO ops.applied_migrations (name)
    VALUES ('0020_medical_videos_social_sources.sql')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
