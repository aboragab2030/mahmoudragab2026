-- Add optional patient_age column to operations table for recording patient age in surgery records.
ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS patient_age integer;
