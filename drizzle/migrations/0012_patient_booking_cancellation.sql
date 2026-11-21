ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_token uuid;
CREATE OR REPLACE FUNCTION public.cancel_patient_booking(_booking_id uuid, _token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _token IS NULL THEN RETURN false; END IF;
  UPDATE public.bookings SET status = 'cancelled', updated_at = now()
  WHERE id = _booking_id AND cancellation_token = _token AND status = 'confirmed';
  IF FOUND THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.bookings WHERE id = _booking_id AND cancellation_token = _token AND status = 'cancelled');
END $$;
REVOKE ALL ON FUNCTION public.cancel_patient_booking(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_patient_booking(uuid, uuid) TO anon, authenticated;