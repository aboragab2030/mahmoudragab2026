// Full data backup / restore for the dashboard's Backup tab (admins only).
// The work is done by the database functions backup_export() / backup_restore()
// (drizzle/migrations/0013_full_data_backup_restore.sql), called with the service role.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { serviceClient } from "@/lib/paymob/paymob.server";

export type BackupResult = { ok: true; data: any } | { ok: false; error: string };

const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

async function isAdmin(context: { supabase: any; userId: string }): Promise<boolean> {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  return data === true;
}

export const exportFullBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BackupResult> => {
    if (!(await isAdmin(context))) return { ok: false, error: "النسخ الاحتياطي متاح لمدير النظام فقط" };
    const db = await serviceClient();
    const { data, error } = await db.rpc("backup_export");
    if (error) {
      console.error("backup_export failed:", error.message);
      return { ok: false, error: "تعذر إنشاء النسخة الاحتياطية، حاول مرة أخرى" };
    }
    return { ok: true, data };
  });

export const restoreFullBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const backup = (input as any)?.backup;
    return { backup: backup && typeof backup === "object" && !Array.isArray(backup) ? backup : null };
  })
  .handler(async ({ data, context }): Promise<BackupResult> => {
    if (!(await isAdmin(context))) return { ok: false, error: "استعادة البيانات متاحة لمدير النظام فقط" };
    if (!data.backup || data.backup.format !== "barrada-backup-v1" || typeof data.backup.tables !== "object") {
      return { ok: false, error: "الملف ده مش نسخة احتياطية صالحة من النظام" };
    }
    if (JSON.stringify(data.backup).length > MAX_BACKUP_BYTES) {
      return { ok: false, error: "حجم الملف أكبر من المسموح" };
    }
    const db = await serviceClient();
    const { data: result, error } = await db.rpc("backup_restore", { _payload: data.backup });
    if (error) {
      console.error("backup_restore failed:", error.message);
      return { ok: false, error: "تعذر استعادة البيانات: " + error.message };
    }
    console.log(`Backup from ${data.backup.exported_at} restored by ${context.userId}`);
    return { ok: true, data: result };
  });
