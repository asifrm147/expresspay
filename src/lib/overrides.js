import { OBJ, OVR } from "../config";
import { create, get, update } from "./api";
import { accessToken } from "./auth";
import { mapOverride } from "./models";
import { moneyWrite, money } from "./format";
import { logAudit } from "./audit";

async function notify(id) {
  try {
    const res = await fetch("/api/notify-override", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}` },
      body: JSON.stringify({ requestId: id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { sent: data.sent !== false, error: null };
    return { sent: false, error: data.error || `Text service error ${res.status}` };
  } catch (e) {
    return { sent: false, error: `Text service unreachable: ${e.message}` };
  }
}

// Creates the request, logs it, texts the super admin. Returns { request, warning }.
export async function requestOverride({ patient, fee, amount, reason, userName }) {
  const rec = await create(OBJ.overrides, {
    [OVR.patient]: [{ id: patient.id }],
    [OVR.service]: fee.name,
    [OVR.scheduled]: moneyWrite(fee.price),
    [OVR.requested]: moneyWrite(amount),
    [OVR.reason]: reason,
    [OVR.requestedBy]: userName,
    [OVR.status]: "Pending",
    [OVR.textStatus]: "Not Sent",
  });
  const o = mapOverride(rec.record || rec);
  const warnings = [];
  const a = await logAudit(userName, "Created", "Override Request", `Override #${o.no}`, `${fee.name}: ${money(fee.price)} → ${money(amount)}. ${reason}`);
  if (a) warnings.push(a);
  const n = await notify(o.id);
  try {
    await update(OBJ.overrides, o.id, { [OVR.textStatus]: n.sent ? "Sent" : "Failed" });
  } catch { /* the queue still shows the request */ }
  if (!n.sent) warnings.push(`The request is in the super admin's queue, but the text didn't go out (${n.error}).`);
  return { request: { ...o, textStatus: n.sent ? "Sent" : "Failed" }, warning: warnings.join(" ") || null };
}

export async function fetchOverride(id) {
  return mapOverride(await get(OBJ.overrides, id));
}

export async function markOverrideUsed(id, receiptNo) {
  await update(OBJ.overrides, id, { [OVR.status]: "Used", [OVR.receiptNo]: String(receiptNo) });
}
