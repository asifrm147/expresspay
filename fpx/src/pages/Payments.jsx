import { useCallback, useEffect, useState } from "react";
import { OBJ, PAY, REF } from "../config";
import { list, get, update, and } from "../lib/api";
import { mapPayment, mapPatient, mapRefund } from "../lib/models";
import { isoToday, rangeRules, money, toKnack } from "../lib/format";
import { logAudit } from "../lib/audit";
import { receiptDoc, superbillDoc } from "../lib/docs";
import { useSession, usePrint } from "../lib/context";
import RefundForm from "../components/RefundForm";
import { Drawer, ErrorBox, Field, KV, Loading, Notice, StatusTag } from "../components/ui";

function PaymentDrawer({ payment, canVoidAny, onClose, onChanged }) {
  const { user } = useSession();
  const { print } = usePrint();
  const [mode, setMode] = useState("view");
  const [reason, setReason] = useState("");
  const [refunded, setRefunded] = useState(null);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const p = payment;
  const voidable = p.status !== "Voided" && (canVoidAny || p.createdDate === toKnack(isoToday()));

  async function printSuperbill() {
    try {
      const patient = mapPatient(await get(OBJ.patients, p.patientId));
      print(superbillDoc(p, patient));
    } catch (e) { setErr(e); }
  }

  async function startRefund() {
    setErr(null);
    try {
      const d = await list(OBJ.refunds, { filters: and({ field: REF.payment, operator: "is", value: p.id }, { field: REF.status, operator: "is not", value: "Denied" }), perPage: 50 });
      setRefunded((d.records || []).map(mapRefund).reduce((s, r) => s + r.amount, 0));
      setMode("refund");
    } catch (e) { setErr(e); }
  }

  async function doVoid(e) {
    e.preventDefault();
    if (!reason.trim()) return setErr("Enter why this payment is being voided.");
    setBusy(true);
    setErr(null);
    try {
      const rec = await update(OBJ.payments, p.id, { [PAY.status]: "Voided", [PAY.voidReason]: `${reason.trim()} (voided by ${user.name})` });
      const w = await logAudit(user.name, "Voided", "Payment", `Receipt #${p.receiptNo}`, reason.trim());
      onChanged(mapPayment(rec.record || rec), w);
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  }

  return (
    <Drawer title={`Receipt #${p.receiptNo}`} onClose={onClose}>
      <p className="drawer-amount">{money(p.amount)} <StatusTag value={p.status} /></p>
      <KV items={[
        ["Patient", p.patientName], ["Date of service", p.dos], ["Payment for", p.paymentFor],
        ["Form of payment", p.last4 ? `${p.method} ending ${p.last4}` : p.method], ["Reference", p.txnRef],
        ["Insurance", [p.insName, p.memberId && `ID ${p.memberId}`, p.group && `Group ${p.group}`].filter(Boolean).join(" · ")],
        ["CPT", p.cpt], ["ICD-10", p.icd], ["Invoice", p.invoiceLabel && `#${p.invoiceLabel}`],
        ["Collected by", p.collectedBy], ["Entered", p.createdDate], ["Receipt", p.receiptSent],
        ["Notes", p.notes], ["Void reason", p.voidReason],
      ]} />
      <ErrorBox error={err} />
      <Notice tone="ok" onClose={() => setNote(null)}>{note}</Notice>
      {mode === "view" && (
        <div className="actions">
          <button className="btn" onClick={() => print(receiptDoc(p), { receipt: true })}>Print receipt</button>
          {(p.cpt || p.icd) && <button className="btn btn-quiet" onClick={printSuperbill}>Print superbill</button>}
          {p.status !== "Voided" && <button className="btn btn-quiet" onClick={startRefund}>Refund</button>}
          {voidable && <button className="btn btn-danger" onClick={() => setMode("void")}>Void</button>}
        </div>
      )}
      {mode === "void" && (
        <form className="panel" onSubmit={doVoid}>
          <p>Voiding removes this payment from totals. Use it for entry mistakes; use a refund when money goes back to the patient.</p>
          <Field label="Reason" wide><input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
          <div className="actions">
            <button className="btn btn-danger" disabled={busy}>{busy ? "Voiding…" : "Void payment"}</button>
            <button type="button" className="btn btn-quiet" onClick={() => setMode("view")}>Cancel</button>
          </div>
        </form>
      )}
      {mode === "refund" && (
        <RefundForm
          payment={p}
          alreadyRefunded={refunded || 0}
          onCancel={() => setMode("view")}
          onDone={(r, w) => { setMode("view"); setNote(`Refund #${r.no} for ${money(r.amount)} sent for manager approval.${w ? ` ${w}` : ""}`); }}
        />
      )}
    </Drawer>
  );
}

export default function Payments({ canVoidAny = false }) {
  const [from, setFrom] = useState(isoToday());
  const [to, setTo] = useState(isoToday());
  const [receipt, setReceipt] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const [warn, setWarn] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    setRows(null);
    try {
      const filters = receipt.trim()
        ? and({ field: PAY.receiptNo, operator: "is", value: receipt.trim() })
        : and(rangeRules(PAY.dos, from, to));
      const d = await list(OBJ.payments, { filters, sort: PAY.receiptNo, order: "desc", perPage: 200 });
      setRows((d.records || []).map(mapPayment));
    } catch (e) { setErr(e); setRows([]); }
  }, [from, to, receipt]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const active = (rows || []).filter((r) => r.status !== "Voided");
  const total = active.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="page">
      <h1>Payments</h1>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Or receipt #"><input inputMode="numeric" value={receipt} onChange={(e) => setReceipt(e.target.value)} /></Field>
        <button className="btn">Show payments</button>
      </form>
      <ErrorBox error={err} />
      <Notice tone="warn" onClose={() => setWarn(null)}>{warn}</Notice>
      {!rows ? <Loading /> : (
        <>
          <p className="summary-line">{active.length} payments · <strong>{money(total)}</strong>{rows.length > active.length && ` · ${rows.length - active.length} voided`}</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Receipt</th><th>Date of service</th><th>Patient</th><th>For</th><th>Paid by</th><th className="num">Amount</th><th>Collected by</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setOpen(r)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(r)} className={r.status === "Voided" ? "row-void" : ""}>
                    <td>#{r.receiptNo}</td><td>{r.dos}</td><td>{r.patientName}</td><td>{r.paymentFor}</td>
                    <td>{r.method}{r.last4 && ` ·${r.last4}`}</td><td className="num">{money(r.amount)}</td>
                    <td>{r.collectedBy}</td><td><StatusTag value={r.status} /></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={8} className="empty">No payments for these dates.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {open && (
        <PaymentDrawer
          payment={open}
          canVoidAny={canVoidAny}
          onClose={() => setOpen(null)}
          onChanged={(p, w) => { setRows(rows.map((r) => (r.id === p.id ? { ...r, ...p } : r))); setOpen(null); setWarn(w); }}
        />
      )}
    </div>
  );
}
