# Roadmap

## Booking details and partner logos (Nov 6)
- [x] Show cash/contract type, contracting company and additional notes within the existing doctor/service cell
- [x] Keep the actual selected date aligned with the doctor's available dates
- [x] Show saved partner logos on the home page — all three saved images loaded
- [x] Test booking date changes and inspect logos — 84 tests pass; isolated future schedule advances to payment without error; current saved schedules contain no future dates
- [ ] Inspect contract details/notes with a saved booking visible to the testing account — account has an empty booking list; existing records have neither notes nor contracting companies

## Remaining payments tasks (Nov 5)
- [x] Connect manager-only delete in payments and InstaPay review — tested both deletions as manager
- [x] Show paid-cancellation notifications in red — checked visibly
- [x] Persist patient cancellation centrally without exposing staff data — new bookings store per-device cancellation credential; legacy bookings need staff cancellation
- [x] Test patient cancellation and manager deletion end to end — seeded a temporary booking, cancelled through My Bookings, verified central status and notice, deleted payment/review via UI; wrong token and anonymous deletion denied

## Migration from GitHub (Barrada Luxor Eye Center)
- [x] Port clinic screens, styles, tests, and Arabic content
- [x] Recreate database structure, permissions, and InstaPay/Paymob rules in Lovable Cloud
- [x] Move staff tools, assistant chat, Paymob checkout/settings and webhooks to this app's server
- [x] Verify build, 50 tests, home page, booking window, assistant chat, staff login error, 404
- [ ] Import existing records (doctors, services, bookings, etc.) — skipped for now by the user; waiting on data export
- [x] First admin invite + first-time password setup on the staff sign-in page
- [ ] Verify admin sign-in — waiting on the admin to confirm the email sent to their inbox
- [ ] Import remaining staff accounts — skipped for now by the user; waiting on staff list
- [ ] Set PAYMENT_WEBHOOK_SECRET — waiting on the user's existing value
- [ ] Re-enter Paymob keys in admin panel and update Paymob callback URL — after first admin exists and the app is published

## InstaPay manual review wiring (from original project)
- [x] Transfer number + amount + optional receipt fields on the InstaPay booking step (present in code)
- [x] Booking reference + "under review" message after booking (present in code)
- [x] Review panel inside the payments section (present in code)
- [x] Patient status lookup under "حجوزاتي" (present in code)
- [x] "مراجعة مدفوعات إنستاباي" staff permission (present in code)
- [ ] Browser check of the full InstaPay flow — needs real doctors/services and a reviewer account

## Dashboard requests (Oct 22)
- [x] Password change from Users screen (incl. own account); removed first-time password link from staff sign-in
- [x] Print button in complaints box
- [x] Doctor filter, print, and quick "تأكيد الدفع" in InstaPay payments review
- [ ] Icon colors / labels on side menu and icon-only buttons — paused earlier (credits); waiting for the user to ask again
- [ ] Staff sign-in button shows blank on the user's computer (likely an older browser that can't read the new color format) — waiting on the user's go-ahead

## Dashboard requests (Oct 23)
- [x] Remove the test doctor and its test booking
- [x] Enforce each doctor's daily patient limit (server + booking form)
- [x] Remove rating from doctor cards on the home page
- [x] Make InstaPay review "تحديث" refresh work visibly
- [x] Fix password change from the Users screen
- [x] Transparent top bar on the home page
- [x] Staff + doctor filters and print in the contact & reminders log
- [ ] Admin-only screens (contact log, InstaPay review, password change) checked in browser — waiting on the user to allow signing the preview in as the admin
- [x] Visitors see the admin's doctor list from the database

## Dashboard requests (Oct 24)
- [x] Date filter in the contact & reminders log
- [x] Payment-method step follows the dashboard settings (cash always shown) — checked on screen as a visitor
- [x] Full InstaPay review test (approve / reject / wrong amount) — test bookings and payments removed afterwards
- [x] "api.whatsapp.com is blocked" — only happens inside the editor preview frame; WhatsApp opens in a new tab on the site
- [x] Booking window date stays aligned with the selected doctor's offered dates (Nov 6)

## Public site data from the database (Nov 1)
- [x] Doctors and services load from the database for every visitor (loading state, no device/sample fallback) — checked as a new visitor
- [x] Top photos, partners and public settings saved to and read from the database (previous photos/partners copied in)
- [x] Staff-only data still loads only after staff sign-in
- [ ] Saving photos, partners and settings from the dashboard checked on screen — waiting on the user to allow signing the preview in as the admin

## Settings and contracting companies for everyone (Nov 2)
- [x] Settings, phones, addresses, logo and payment methods save to the database and show to every visitor — checked by saving from the dashboard (test values removed afterwards)
- [x] Contracting companies saved in the database; a new company appears in every visitor's booking window — checked with a test company (deleted afterwards)
- [ ] Admin's real phones, addresses and logo — waiting on the admin to enter them in Settings and press save once

## Staff permissions per dashboard section (Nov 3)
- [x] Permission list covers every dashboard section; side menu follows it; existing staff keep what they could already open — checked on screen as the manager
- [x] Only the manager can add, change or remove staff records (staff can still read them) — manager edit checked; staff-side check skipped (user declined signing in as staff)

## Users and InstaPay (Nov 3–4)
- [x] Allow up to 10 users — no user cap exists in the app or server; 10+ users can already be added
- [x] Cash at the center becomes a choice in Settings payment methods (added once to saved settings so it keeps showing) — checked as a visitor
- [x] InstaPay receipt photo required (booking window + server) — checked as a visitor
- [x] Patient phone and receipt photo shown in InstaPay review — checked as the manager; test booking removed
