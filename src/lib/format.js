import { ptTodayIso } from "./time";

const pad = (n) => String(n).padStart(2, "0");

// "Today" is always the clinic's day (Pacific), not the computer's.
export const isoToday = () => ptTodayIso();
export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
export function startOfWeek(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return addDays(iso, -((dt.getDay() + 6) % 7));
}
export const startOfMonth = (iso) => `${iso.slice(0, 8)}01`;

export function toKnack(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}
export function fromKnack(mdy) {
  if (!mdy) return "";
  const [m, d, y] = mdy.split("/");
  return `${y}-${m}-${d}`;
}
export const dateWrite = (iso) => ({ date: toKnack(iso), all_day: true });
export function nowWrite() {
  const t = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date());
  const g = (k) => t.find((p) => p.type === k)?.value || "";
  return { date: toKnack(isoToday()), time: `${pad(g("hour"))}:${g("minute")}${g("dayPeriod").toLowerCase()}`, all_day: false };
}

export const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
};
export const money = (n) => num(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const moneyWrite = (n) => num(n).toFixed(2);

const raw = (r, k) => r?.[`${k}_raw`];
export const rawDate = (r, k) => raw(r, k)?.date || "";
export const rawNum = (r, k) => num(raw(r, k));
export const rawText = (r, k) => {
  const v = raw(r, k);
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return typeof v === "object" ? "" : String(v);
};
export function rawName(r, k) {
  const v = raw(r, k);
  if (!v) return "";
  if (typeof v === "string") return v;
  return [v.first, v.last].filter(Boolean).join(" ") || v.full || "";
}
export const rawEmail = (r, k) => raw(r, k)?.email || "";
export const rawPhone = (r, k) => {
  const v = raw(r, k);
  if (!v) return "";
  return typeof v === "string" ? v : v.formatted || v.full || "";
};
export const connId = (r, k) => raw(r, k)?.[0]?.id || "";
export const connLabel = (r, k) => raw(r, k)?.[0]?.identifier || "";

// Returns "" for blank, null for invalid, otherwise a Knack phone value.
export function phoneWrite(s) {
  const d = String(s || "").replace(/\D/g, "").slice(-10);
  if (!d) return "";
  if (d.length !== 10) return null;
  return { area: d.slice(0, 3), number: d.slice(3), full: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` };
}

export const rangeRules = (field, fromIso, toIso) => [
  { field, operator: "is after", value: toKnack(addDays(fromIso, -1)) },
  { field, operator: "is before", value: toKnack(addDays(toIso, 1)) },
];

export function csv(rows) {
  return rows
    .map((r) => r.map((c) => {
      const s = String(c ?? "");
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\r\n");
}
export function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
