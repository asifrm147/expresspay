# FranklinPark Express Care Payments

React (Vite) app on Vercel, backed by the Knack app "FranklinPark Express Care Payments"
(app ID 6ab750236f2f55328950a5fd). Staff sign in with their Knack accounts.

## Deploy to Vercel
1. Push this folder to a new GitHub repo, then import it in Vercel (framework preset: Vite).
2. Name the Vercel project `franklinpark-payments` so the address is
   https://franklinpark-payments.vercel.app — that exact sign-in return address is already
   registered with Knack. If you use a different address or a custom domain, send it to me
   and I'll add it; sign-in fails until it's registered.
3. No environment variables are needed yet.

## Before go-live
- Fill in the clinic address, phone, tax ID and NPI in `src/config.js` (CLINIC). They print on receipts, invoices and superbills.
- In Knack, replace the three sample accounts (password Demo1234!) with real staff:
  Front Desk Staff for front desk, Managers for managers.
- Add your common services and self-pay prices under Fee schedule.

## Roles
- Front desk: take payments, look up returning patients by date of birth, print receipts and
  superbills, request refunds, create invoices, void their own same-day entries, close their drawer.
- Manager: everything above, plus approve/deny refunds, void any payment or invoice,
  review all drawer closes, reports and exports, fee schedule, audit log.

## Not connected yet (by design)
- Sphere card terminal (staff enter card last 4 + Sphere transaction ID for now)
- Text/email receipts
- Practice Books sync (Reports > "Export summary" produces the no-patient-info file it will use)

## Approvals (super admin) — /admin/approvals
Two kinds of request land here, addressed to asif.malik@psychiatrygroup.com (APPROVER_EMAIL in src/config.js):
- Contact manager: staff hold any payment for approval with a short message. Once approved, the
  button becomes "Save $X". Staff can withdraw a pending request; a denied payment can't be saved.
- Price overrides (below).
Both text 509-850-1098 (OVERRIDE_ALERT_TO) with a link; staff messages are never put in the text.

## Price overrides (super admin)
- Super admins (Knack role "Super Admins") own the fee schedule and approve price overrides at /admin/overrides.
- Front desk and managers who pick a fee-schedule service and change its price must request approval;
  the payment can't be recorded until a super admin approves that exact amount.
- Each request texts the super admin. Text contains no patient information.

### Text messages (Vercel → Settings → Environment Variables, then redeploy)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1XXXXXXXXXX      (a Twilio number registered for US texting)
OVERRIDE_ALERT_TO=+15098501098
APP_URL=https://fpx-chi.vercel.app
Until these are set, requests still reach the super admin's queue; the app says the text didn't go out.
