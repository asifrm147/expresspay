import { isoToday } from "./format";

const pad = (n) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Accepts 01011986, 01/01/1986, 1/1/1986, 01-01-1986. Returns { iso, display } or { error }.
export function parseDob(input) {
  const s = String(input || "").trim();
  if (!s) return { error: "Enter a date of birth." };
  let m, d, y;
  if (/^\d{8}$/.test(s)) {
    m = s.slice(0, 2); d = s.slice(2, 4); y = s.slice(4);
  } else {
    const parts = s.split(/[/\-.\s]+/).filter(Boolean);
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return { error: "Enter the date as MM/DD/YYYY." };
    [m, d, y] = parts;
    if (y.length !== 4) return { error: "Use a four-digit year." };
  }
  const mi = Number(m), di = Number(d), yi = Number(y);
  const dt = new Date(yi, mi - 1, di);
  if (!mi || !di || dt.getFullYear() !== yi || dt.getMonth() !== mi - 1 || dt.getDate() !== di) return { error: "Enter a valid date of birth." };
  if (yi < 1900) return { error: "Enter a valid date of birth." };
  const iso = `${yi}-${pad(mi)}-${pad(di)}`;
  if (iso > isoToday()) return { error: "Date of birth can't be in the future." };
  return { iso, display: `${pad(mi)}/${pad(di)}/${yi}` };
}

// "01/01/1986" -> "Jan 1, 1986"
export function longDate(mdy) {
  const [m, d, y] = String(mdy || "").split("/").map(Number);
  if (!m || !d || !y) return mdy || "";
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export const phoneLast4 = (phone) => String(phone || "").replace(/\D/g, "").slice(-4);
export const maskedPhone = (phone) => {
  const d = String(phone || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) •••-${d.slice(6)}` : "";
};
