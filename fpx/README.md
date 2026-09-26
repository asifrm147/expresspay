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
