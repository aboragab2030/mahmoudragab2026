<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Patient self-cancellation uses the booking's per-device random capability through cancel_patient_booking; never expose anonymous booking reads or updates. Legacy bookings without the capability require staff cancellation because their ownership cannot be verified.
- The clinic app lives in `src/barada/` (ported verbatim from the original repo) and renders client-only from `src/routes/index.tsx` via `src/pages/Index.tsx`; it still reads localStorage for staff-side lists, so it must not be server-rendered.
- Public site content (doctors, services, hero_images, partners, settings via the read-only `app_settings_public` view) is loaded for everyone by `src/hooks/usePublicSiteData.tsx` and is never read from localStorage or built-in samples; staff-only tables load only through `useRealtimeSync` after sign-in. Why: every visitor must see the admin's saved content.
- Original backend functions are server functions in `src/lib/backend.functions.ts`; screens call them through `invokeBackend()` in `src/lib/backend.ts`, which keeps the old `{ data, error }` shape so ported code stays unchanged.
- External callers use `/api/public/payment-webhook` (shared `x-webhook-secret`) and `/api/public/paymob-webhook` (Paymob HMAC); both must verify before any write.
- Paymob secrets are AES-GCM encrypted in `payment_gateway_secrets` (helpers in `src/lib/paymob/paymob.server.ts`); never return decrypted values to the browser.
- Style class names were upgraded to the current Tailwind naming (shadow-xs, rounded-sm, outline-hidden, backdrop-blur-xs) to keep the original look; keep that mapping when porting more original code.
- tsconfig is relaxed (strict off, strictNullChecks on) to match the original project so ported code compiles unchanged.
- Staff accounts start from rows in `staff_invites`; the `claim_staff_invite` trigger grants profile + role only after the invited email is confirmed, so never grant roles from client input or before confirmation.
- Contracting companies live only in `contracting_companies`; visitors read names + documents through the read-only `contracting_companies_public` view (manager contacts stay staff-only), and each staff device copies its old on-device list in once while the table is empty. Why: every visitor's booking window must list the admin's companies.
- Production runs on the client's own Supabase (not Lovable Cloud). Every schema/data change must be a new, never-edited file in `drizzle/migrations/` (next number, e.g. `0009_...sql`); the GitHub Action `.github/workflows/apply-db-migrations.yml` applies new files to production on push to main and records them in `ops.applied_migrations`. Never rename or edit an already-pushed migration file, and write migrations so they also succeed on a database that already has real data. Why: changes applied only to Lovable Cloud never reach the live site.
- Dashboard edits to doctors, services, top photos, partners and settings are written to their database tables (row mapping in `src/barada/publicData.ts`); daily/hourly booking limits are enforced by a database trigger that reads `doctors`.
- Booking date selection uses dateUtils.resolveBookingDate to reconcile state with offered dates after doctor or schedule changes; never accept an unlisted day. Why: a select can visually show an option while holding stale state.
- Dashboard section access comes from `src/barada/permissions.ts` (one permission per side-menu section; Users and electronic-payment settings stay admin-only because the server only lets admins change passwords, roles and payment keys). When adding a section, add its permission there and backfill existing staff in a migration so nobody silently loses access.
- Booking payment choices (cash at the center, InstaPay, wallet) all come from the saved Settings payment methods (`paymentOptionsFor`); InstaPay submissions require an uploaded receipt that `submit_instapay_payment` checks exists in storage under the booking's folder. Why: the manager controls every offered method and reviewers always get proof to look at.
- Backups: the dashboard Backup tab and the daily Google Drive script (`/api/public/backup-export`, Bearer `BACKUP_EXPORT_TOKEN`) use the database functions `backup_export()` / `backup_restore()` (migration 0013, service_role only, admin-checked in `src/lib/backup.functions.ts`). They cover every public table automatically, so new tables need no backup code; never restore by writing React state or localStorage. Why: the old import only changed the screen and lost data on refresh.
- Surgery operations and visitor contact messages (complaints/suggestions) are saved only in the `operations` / `complaints` tables through `src/barada/clinicRecords.ts`; never keep staff or visitor records only in React state or localStorage. Why: browser-only records never reach other staff devices or the backups.
