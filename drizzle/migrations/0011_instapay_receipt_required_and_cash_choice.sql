-- InstaPay transfers must come with an uploaded receipt that belongs to the same booking.
CREATE OR REPLACE FUNCTION public.submit_instapay_payment(_booking_id uuid, _phone text, _transaction_ref text, _declared_amount integer, _evidence_path text)
 RETURNS TABLE(booking_ref text, amount_due integer, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE b public.bookings; v_ref text; v_due integer; v_id uuid; v_txn text := trim(COALESCE(_transaction_ref, ''));
BEGIN
  IF length(v_txn) < 4 OR length(v_txn) > 100 THEN RAISE EXCEPTION 'invalid transaction reference'; END IF;
  IF _declared_amount IS NOT NULL AND (_declared_amount < 0 OR _declared_amount > 1000000) THEN RAISE EXCEPTION 'invalid amount'; END IF;
  IF COALESCE(_evidence_path, '') = '' THEN RAISE EXCEPTION 'evidence required'; END IF;
  IF _evidence_path NOT LIKE _booking_id::text || '/%' THEN RAISE EXCEPTION 'invalid evidence path'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'instapay-evidence' AND o.name = _evidence_path) THEN
    RAISE EXCEPTION 'evidence not found';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND OR b.phone <> _phone OR COALESCE(b.payment_method,'') <> 'instapay' THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF b.created_at < now() - interval '1 hour' THEN RAISE EXCEPTION 'submission window closed'; END IF;
  IF EXISTS (SELECT 1 FROM public.instapay_submissions s WHERE s.booking_id = _booking_id) THEN RAISE EXCEPTION 'already submitted'; END IF;
  v_due := public.instapay_amount_due(b.service, b.doctor_id, b.doctor_name);
  v_ref := 'BR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  INSERT INTO public.instapay_submissions (booking_id, booking_ref, transaction_ref, declared_amount, amount_due, evidence_path)
  VALUES (_booking_id, v_ref, v_txn, _declared_amount, v_due, _evidence_path) RETURNING id INTO v_id;
  INSERT INTO public.instapay_audit_events (submission_id, booking_ref, event_type, previous_status, new_status)
  VALUES (v_id, v_ref, 'PAYMENT_EVIDENCE_SUBMITTED', 'NOT_STARTED', 'PENDING_REVIEW');
  INSERT INTO public.payment_notifications (patient_name, amount, message)
  VALUES (b.patient_name, COALESCE(_declared_amount, v_due), 'طلب مراجعة تحويل إنستاباي للحجز ' || v_ref || ' - رقم العملية: ' || v_txn);
  RETURN QUERY SELECT v_ref, v_due, 'PENDING_REVIEW'::text;
END $function$;

-- Cash at the center is now a payment method chosen in Settings. Saved settings keep offering it
-- (as before) by adding it once to any saved list that does not have it yet.
UPDATE public.app_settings
SET payment_methods = COALESCE(payment_methods, '[]'::jsonb)
  || jsonb_build_array(jsonb_build_object('id', 'cash', 'type', 'cash', 'label', 'الدفع نقداً في المركز', 'detail', ''))
WHERE NOT (COALESCE(payment_methods, '[]'::jsonb) @> '[{"type":"cash"}]'::jsonb);