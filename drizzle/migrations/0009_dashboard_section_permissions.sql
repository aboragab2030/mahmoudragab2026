-- Every dashboard section now has its own staff permission. Overview, doctors and bookings
-- were open to every staff member, and photos + complaints followed the services permission,
-- so existing staff get the matching new permissions and keep exactly what they could open.
WITH base AS (
  SELECT p.id,
    CASE WHEN p.permissions IS NULL OR jsonb_typeof(p.permissions) <> 'array' OR jsonb_array_length(p.permissions) = 0
      THEN '["manage_bookings","view_reports"]'::jsonb ELSE p.permissions END AS perms
  FROM public.profiles p
  WHERE NOT public.has_role(p.user_id, 'admin')
)
UPDATE public.profiles p
SET permissions = (
  SELECT jsonb_agg(DISTINCT x.e)
  FROM jsonb_array_elements(
    b.perms
    || '["view_overview","manage_doctors","manage_bookings"]'::jsonb
    || CASE WHEN b.perms ? 'manage_content' THEN '["manage_hero_images","manage_complaints"]'::jsonb ELSE '[]'::jsonb END
  ) AS x(e)
)
FROM base b
WHERE b.id = p.id;

WITH base AS (
  SELECT i.email,
    CASE WHEN jsonb_typeof(i.permissions) <> 'array' OR jsonb_array_length(i.permissions) = 0
      THEN '["manage_bookings","view_reports"]'::jsonb ELSE i.permissions END AS perms
  FROM public.staff_invites i
  WHERE i.role = 'staff' AND i.claimed_by IS NULL
)
UPDATE public.staff_invites i
SET permissions = (
  SELECT jsonb_agg(DISTINCT x.e)
  FROM jsonb_array_elements(
    b.perms
    || '["view_overview","manage_doctors","manage_bookings"]'::jsonb
    || CASE WHEN b.perms ? 'manage_content' THEN '["manage_hero_images","manage_complaints"]'::jsonb ELSE '[]'::jsonb END
  ) AS x(e)
)
FROM base b
WHERE b.email = i.email;