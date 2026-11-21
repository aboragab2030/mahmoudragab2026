-- Visitors see the contracting companies (name + required documents) in the booking window.
-- The view runs with the owner's rights so it can read the staff-only table; manager contact
-- details are not exposed and the view is read-only.
CREATE OR REPLACE VIEW public.contracting_companies_public
WITH (security_invoker = false)
AS
SELECT id, name, documents, created_at
FROM public.contracting_companies;

REVOKE ALL ON public.contracting_companies_public FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.contracting_companies_public FROM anon, authenticated;
GRANT SELECT ON public.contracting_companies_public TO anon, authenticated;
GRANT ALL ON public.contracting_companies_public TO service_role;