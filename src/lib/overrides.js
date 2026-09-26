import { OBJ, OVR, APPROVER_EMAIL } from "../config";
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
    [OVR.type]: "Price Override",
    [OVR.assignedTo]: APPROVER_EMAIL,
  });
  const o = mapOverride(rec.record || rec);
  const a = await logAudit(userName, "Created", "Override Request", `Override #${o.no}`, `${fee.name}: ${money(fee.price)} → ${money(amount)}. ${reason}`);
  return finish(o, a);
}

// Sends the text, records whether it went out, and collects warnings.
async function finish(o, auditWarning) {
  const warnings = auditWarning ? [auditWarning] : [];
  const n = await notify(o.id);
  try {
    await update(OBJ.overrides, o.id, { [OVR.textStatus]: n.sent ? "Sent" : "Failed" });
  } catch { /* the queue still shows the request */ }
  if (!n.sent) warnings.push(`The request is in the manager's queue, but the text didn't go out (${n.error}).`);
  return { request: { ...o, textStatus: n.sent ? "Sent" : "Failed" }, warning: warnings.join(" ") || null };
}

// "Contact manager": any payment can be held for approval before it's saved.
export async function requestManagerReview({ patient, amount, method, message, userName }) {
  const summary = `${money(amount)} ${method}`;
  const rec = await create(OBJ.overrides, {
    [OVR.patient]: [{ id: patient.id }],
    [OVR.service]: "Manager review",
    [OVR.requested]: moneyWrite(amount),
    [OVR.reason]: message,
    [OVR.requestedBy]: userName,
    [OVR.status]: "Pending",
    [OVR.textStatus]: "Not Sent",
    [OVR.type]: "Manager Review",
    [OVR.assignedTo]: APPROVER_EMAIL,
    [OVR.summary]: summary,
  });
  const o = mapOverride(rec.record || rec);
  const a = await logAudit(userName, "Created", "Manager Review", `Request #${o.no}`, `${summary}. ${message}`);
  return finish(o, a);
}

export async function withdrawRequest(o, userName) {
  await update(OBJ.overrides, o.id, { [OVR.status]: "Withdrawn", [OVR.responseNote]: `Withdrawn by ${userName}` });
  return logAudit(userName, "Edited", o.type, `Request #${o.no}`, "Withdrawn by requester");
}

export async function fetchOverride(id) {
  return mapOverride(await get(OBJ.overrides, id));
}

export async function markOverrideUsed(id, receiptNo) {
  await update(OBJ.overrides, id, { [OVR.status]: "Used", [OVR.receiptNo]: String(receiptNo) });
}
