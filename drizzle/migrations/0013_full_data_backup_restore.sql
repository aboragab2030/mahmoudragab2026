-- Full JSON backup and restore of the clinic's data (every table in the public schema),
-- used by the dashboard's Backup tab and the daily Google Drive backup.
-- Only the server (service_role) may call these; staff reach them through admin-checked
-- server functions. Paymob secrets are never exported (they must be re-entered anyway).

CREATE OR REPLACE FUNCTION public.backup_export()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
  tables jsonb := '{}'::jsonb;
  rows jsonb;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND c.relname <> 'payment_gateway_secrets'
    ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t', r.relname) INTO rows;
    tables := tables || jsonb_build_object(r.relname, rows);
  END LOOP;

  RETURN jsonb_build_object('format', 'barrada-backup-v1', 'exported_at', now(), 'tables', tables);
END;
$$;

-- Restores a backup made by backup_export(): rows that are missing come back and rows that
-- exist are overwritten with the backup's values; rows added after the backup are kept.
-- Triggers and foreign-key checks are paused for the load so old rows go in exactly as saved.
CREATE OR REPLACE FUNCTION public.backup_restore(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  t record;
  tbl regclass;
  pk text[];
  cols text[];
  col_list text;
  upd_list text;
  n bigint;
  summary jsonb := '{}'::jsonb;
  tables jsonb := _payload -> 'tables';
BEGIN
  IF _payload ->> 'format' IS DISTINCT FROM 'barrada-backup-v1' OR jsonb_typeof(tables) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ملف النسخة الاحتياطية غير صالح';
  END IF;

  SET LOCAL session_replication_role = replica;

  FOR t IN SELECT key AS name, value AS rows FROM jsonb_each(tables) ORDER BY key LOOP
    tbl := to_regclass(format('public.%I', t.name));
    IF t.name = 'payment_gateway_secrets' OR tbl IS NULL
       OR jsonb_typeof(t.rows) IS DISTINCT FROM 'array' OR jsonb_array_length(t.rows) = 0 THEN
      CONTINUE;
    END IF;

    SELECT array_agg(a.attname::text ORDER BY array_position(i.indkey::int2[], a.attnum))
      INTO pk
      FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey::int2[])
      WHERE i.indrelid = tbl AND i.indisprimary;
    IF pk IS NULL THEN
      summary := summary || jsonb_build_object(t.name, 'skipped: no primary key');
      CONTINUE;
    END IF;

    -- Columns that exist both in the table now and in the saved rows (tables may have gained
    -- or lost columns since the backup); generated columns are filled by the database.
    SELECT array_agg(a.attname::text ORDER BY a.attnum)
      INTO cols
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = tbl AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.rows) e WHERE e ? a.attname::text);
    IF cols IS NULL OR NOT pk <@ cols THEN
      summary := summary || jsonb_build_object(t.name, 'skipped: columns do not match');
      CONTINUE;
    END IF;

    SELECT string_agg(quote_ident(c), ', ') INTO col_list FROM unnest(cols) c;
    SELECT string_agg(format('%I = EXCLUDED.%I', c, c), ', ') INTO upd_list FROM unnest(cols) c WHERE c <> ALL (pk);

    EXECUTE format(
      'INSERT INTO %s (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM jsonb_populate_recordset(NULL::%s, $1) ON CONFLICT (%s) DO %s',
      tbl, col_list, col_list, tbl,
      (SELECT string_agg(quote_ident(c), ', ') FROM unnest(pk) c),
      CASE WHEN upd_list IS NULL THEN 'NOTHING' ELSE 'UPDATE SET ' || upd_list END
    ) USING t.rows;
    GET DIAGNOSTICS n = ROW_COUNT;
    summary := summary || jsonb_build_object(t.name, n);
  END LOOP;

  RETURN jsonb_build_object('restored', summary, 'backup_date', _payload ->> 'exported_at');
END;
$$;

REVOKE ALL ON FUNCTION public.backup_export() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_restore(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_export() TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_restore(jsonb) TO service_role;
