-- Visitors read the clinic's public settings (name, hero text, contact details, hours, terms)
-- through this view. It runs with the view owner's rights so it can read app_settings,
-- which stays staff-only; only the listed safe columns are exposed and the view is read-only.
CREATE OR REPLACE VIEW public.app_settings_public
WITH (security_invoker = false)
AS
SELECT id, app_name, hero_title, hero_description, logo_url, language, patient_mode, stats, terms_ar, terms_en, working_hours, created_at,
       phones, addresses, facebook_url, whatsapp_number, map_location_url, updated_at
FROM public.app_settings;

REVOKE ALL ON public.app_settings_public FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.app_settings_public FROM anon, authenticated;
GRANT SELECT ON public.app_settings_public TO anon, authenticated;
GRANT ALL ON public.app_settings_public TO service_role;