import { OBJ, AUD } from "../config";
import { create } from "./api";
import { nowWrite } from "./format";

// Never blocks the main action; returns a message if logging failed so the screen can show it.
export async function logAudit(user, action, recordType, ref, details = "") {
  try {
    await create(OBJ.audit, {
      [AUD.time]: nowWrite(),
      [AUD.action]: action,
      [AUD.recordType]: recordType,
      [AUD.ref]: String(ref ?? ""),
      [AUD.user]: user,
      [AUD.details]: details,
    });
    return null;
  } catch (e) {
    return `Saved, but the audit log entry failed: ${e.message}`;
  }
}
