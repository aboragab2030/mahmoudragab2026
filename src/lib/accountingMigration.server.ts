import fs from "node:fs";
import path from "node:path";

let migrationInFlight: Promise<{ ok: boolean; migrated: boolean }> | null = null;

const MIGRATION_FILES = [
  "0023_staff_bookings_patients_accounting.sql",
  "0024_unified_patient_billing_and_payment_sync.sql",
  "0025_payment_delete_and_notifications.sql",
  "0026_patient_experience_evaluation_system.sql",
];

function loadMigrationSqlList(): string[] {
  const results: string[] = [];
  for (const file of MIGRATION_FILES) {
    const candidates = [
      path.resolve(process.cwd(), "drizzle/migrations", file),
      path.resolve(process.cwd(), "../drizzle/migrations", file),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        results.push(fs.readFileSync(p, "utf8"));
        break;
      }
    }
  }
  return results;
}

export async function tryApplyClinicErpMigration(): Promise<{ ok: boolean; migrated: boolean }> {
  if (migrationInFlight) return migrationInFlight;

  migrationInFlight = (async () => {
    const dbUrl =
      process.env["LOVABLE_DB_MIGRATION_URL"] ||
      process.env["PROD_DATABASE_URL"] ||
      process.env["DATABASE_URL"];

    if (!dbUrl) {
      return { ok: true, migrated: false };
    }

    const sqlScripts = loadMigrationSqlList();
    if (sqlScripts.length === 0) {
      return { ok: true, migrated: false };
    }

    const { default: postgres } = await import("postgres");
    const sql = postgres(dbUrl, { max: 1, connect_timeout: 5, idle_timeout: 5 });
    try {
      await sql.begin(async (tx) => {
        for (const sqlText of sqlScripts) {
          await tx.unsafe(sqlText);
        }
      });
      return { ok: true, migrated: true };
    } catch (err) {
      console.warn(
        "Auto-applying clinic ERP migration failed:",
        err instanceof Error ? err.message : err,
      );
      return { ok: false, migrated: false };
    } finally {
      await sql.end({ timeout: 3 }).catch(() => undefined);
    }
  })();

  try {
    return await migrationInFlight;
  } finally {
    migrationInFlight = null;
  }
}
