import { useState } from "react";
import { OBJ, REF, REFUND_METHODS, CARD_METHODS } from "../config";
import { create } from "../lib/api";
import { mapRefund } from "../lib/models";
import { fromKnack, dateWrite, moneyWrite, money, num } from "../lib/format";
import { logAudit } from "../lib/audit";
import { useSession } from "../lib/context";
import { ConfirmationDialog, Field, isAmbiguous } from "./ui";

export default function RefundForm({ payment, alreadyRefunded = 0, onDone, onCancel }) {
  const { user } = useSession();
  const max = Math.max(0, payment.amount - alreadyRefunded);
  const [amount, setAmount] = useState(max.toFixed(2));
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState(
    payment.method === "Cash" ? "Cash" : CARD_METHODS.includes(payment.method) ? "Card Reversal" : payment.method === "Check" ? "Check" : "Other",
  );
  const [errs, setErrs] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  function review(e) {
    e.preventDefault();
    const x = {};
    if (num(amount) <= 0) x.amount = "Enter a refund amount.";
    else if (num(amount) > max + 0.005) x.amount = `The refund can't be more than ${money(max)}.`;
    if (!reason.trim()) x.reason = "Enter the reason for the refund.";
    setErrs(x);
    if (!Object.keys(x).length) { setErr(null); setConfirming(true); }
  }

  async function submit() {
    if (busy) return;
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
      setErr(isAmbiguous(ex)
        ? "Connection lost. Check Refunds to see whether this request was saved before sending it again."
        : { message: `Refund request was not saved. ${ex.message}`, status: ex.status, body: ex.body });
      setBusy(false);
    }
  }

  const target = method === "Card Reversal" && payment.last4 ? `${payment.method} •••• ${payment.last4}` : method.toLowerCase();

  return (
    <form className="refund" onSubmit={review} noValidate>
      <h3>Refund payment</h3>
      <p className="quiet">
        {money(payment.amount)} {payment.method} on {payment.dos}.
        {alreadyRefunded > 0 && ` ${money(alreadyRefunded)} already refunded or pending.`} A manager approves every refund.
      </p>
      <div className="cols-2">
        <Field label="Refund amount" error={errs.amount}>
          {(p) => (
            <div className="money money-sm">
              <span aria-hidden="true">$</span>
              <input {...p} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
          )}
        </Field>
        <Field label="Refund by">
          {(p) => <select {...p} value={method} onChange={(e) => setMethod(e.target.value)}>{REFUND_METHODS.map((o) => <option key={o}>{o}</option>)}</select>}
        </Field>
      </div>
      <Field label="Reason" error={errs.reason}>
        {(p) => <textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
      <div className="row">
        <button className="btn btn-danger">Review refund</button>
        <button type="button" className="btn btn-tertiary" onClick={onCancel}>Cancel</button>
      </div>
      {confirming && (
        <ConfirmationDialog
          title={`Refund ${money(amount)} to ${target}?`}
          confirmLabel="Send for approval"
          busyLabel="Processing refund…"
          busy={busy}
          danger
          error={err}
          onConfirm={submit}
          onCancel={() => setConfirming(false)}
        >
          <p className="quiet">Receipt #{payment.receiptNo} · {payment.patientName}</p>
          <p className="quiet">Reason: {reason.trim()}</p>
          <p className="quiet">No money moves until a manager approves and the refund is marked paid out.</p>
        </ConfirmationDialog>
      )}
    </form>
  );
}
