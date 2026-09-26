// All times display in the clinic's time zone, whatever the computer or Knack is set to.
export const CLINIC_TZ = "America/Los_Angeles";

const parts = (d, opts) => Object.fromEntries(
  new Intl.DateTimeFormat("en-US", { timeZone: CLINIC_TZ, ...opts }).formatToParts(d).map((p) => [p.type, p.value]),
);

// "MM/DD/YYYY" of an instant, in Pacific.
export function ptDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = parts(d, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.month}/${p.day}/${p.year}`;
}

// "2:41 PM" of an instant, in Pacific.
export function ptTime(iso, { seconds = false } = {}) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { timeZone: CLINIC_TZ, hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}) });
}

// Today's date in Pacific as YYYY-MM-DD.
export function ptTodayIso() {
  const p = parts(new Date(), { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}
