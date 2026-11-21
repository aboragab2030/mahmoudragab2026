// Daily automatic backup endpoint, called by the Google Apps Script in the clinic's Google
// Drive. Requires `Authorization: Bearer <BACKUP_EXPORT_TOKEN>`; disabled when the secret is unset.
import { createFileRoute } from "@tanstack/react-router";
import { serviceClient } from "@/lib/paymob/paymob.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/backup-export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expected = process.env["BACKUP_EXPORT_TOKEN"];
        if (!expected || expected.length < 32) return json({ error: "Backup export is not configured" }, 503);

        const match = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "");
        if (!match || !safeEqual(match[1], expected)) return json({ error: "Unauthorized" }, 401);

        const db = await serviceClient();
        const { data, error } = await db.rpc("backup_export");
        if (error) {
          console.error("backup-export failed:", error.message);
          return json({ error: "Backup failed" }, 500);
        }
        return json(data);
      },
    },
  },
});
