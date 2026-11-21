-- Visitor messages (complaints / suggestions) are now saved in the database, and staff who
-- manage them can delete them from the dashboard. Visitors can still only add messages.
DROP POLICY IF EXISTS "Staff can delete complaints" ON public.complaints;
CREATE POLICY "Staff can delete complaints" ON public.complaints
  FOR DELETE TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));
