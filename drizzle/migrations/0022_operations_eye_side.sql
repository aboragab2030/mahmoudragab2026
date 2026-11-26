-- Add optional eye_side column to operations table for selecting right, left, or both eyes.
ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS eye_side text;
