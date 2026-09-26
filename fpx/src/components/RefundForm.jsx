import { useState } from "react";
import { OBJ, REF, REFUND_METHODS, CARD_METHODS } from "../config";
import { create } from "../lib/api";
import { mapRefund } from "../lib/models";
import { fromKnack, dateWrite, moneyWrite, money, num } from "../lib/format";
import { logAudit } from "../lib/audit";
import { useSession } from "../lib/context";
import { ErrorBox, Field } from "./ui";

export default function RefundForm({ payment, alreadyRefunded = 0, onDone, onCancel }) {
  const { user } = useSession();
  const max = Math.max(0, payment.amount - alreadyRefunded);
  const [amount, setAmount] = useState(max.toFixed(2));
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState(
    payment.method === "Cash" ? "Cash" : CARD_METHODS.includes(payment.method) ? "Card Reversal" : payment.method === "Check" ? "Check" : "Other",
  );
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (num(amount) <= 0) return setErr("Enter a refund amount.");
    if (num(amount) > max + 0.005) return setErr(`The refund can't be more than ${money(max)}.`);
    if (!reason.trim()) return setErr("Enter the reason for the refund.");
    setBusy(true);
    setErr(null);
    try {
      const rec = await create(OBJ.refunds, {
        [REF.patient]: [{ id: payment.patientId }],
        [REF.payment]: [{ id: payment.id }],
        [REF.dos]: dateWrite(fromKnack(payment.dos)),
        [REF.amount]: moneyWrite(amount),
        [REF.reason]: reason.trim(),
        [REF.method]: method,
        [REF.status]: "Pending Approval",
        [REF.processedBy]: "",
        [REF.approvedBy]: "",
      });
      const r = mapRefund(rec.record || rec);
      const warn = await logAudit(user.name, "Refund Requested", "Refund", `Refund #${r.no}`, `${money(amount)} against receipt #${payment.receiptNo}: ${reason.trim()}`);
      onDone(r, warn);
    } catch (ex) {
      setErr(ex);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h3>Request a refund</h3>
      <p className="muted">
        Receipt #{payment.receiptNo}, {money(payment.amount)} {payment.method} on {payment.dos}.
        {alreadyRefunded > 0 && ` ${money(alreadyRefunded)} already refunded or pending.`} A manager approves every refund.
      </p>
      <div className="grid">
        <Field label="Refund amount"><input className="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Refund by">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {REFUND_METHODS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Reason" wide><textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ErrorBox error={err} />
      <div className="actions">
        <button className="btn" disabled={busy}>{busy ? "Sending…" : "Send for approval"}</button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
