import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OBJ, PAY, REF } from "../config";
import { list, get, update, and } from "../lib/api";
import { mapPayment, mapPatient, mapRefund } from "../lib/models";
import { isoToday, addDays, rangeRules, money, toKnack } from "../lib/format";
import { logAudit } from "../lib/audit";
import { receiptDoc, superbillDoc } from "../lib/docs";
import { useSession, usePrint } from "../lib/context";
import RefundForm from "../components/RefundForm";
import { ChoiceGroup, ConfirmationDialog, Drawer, EmptyState, ErrorBox, Field, KV, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "custom", label: "Custom" },
];

// Ledger status: void state first, then refunds against the payment.
function ledgerStatus(p, refunds) {
  if (p.status === "Voided") return "Voided";
  const mine = refunds.filter((r) => r.paymentId === p.id && r.status !== "Denied");
  const paidOut = mine.filter((r) => r.status === "Processed").reduce((s, r) => s + r.amount, 0);
  if (paidOut >= p.amount - 0.005 && paidOut > 0) return "Refunded";
  if (paidOut > 0) return "Partial refund";
  if (mine.length) return "Refund pending";
  return "Paid";
}

function PaymentDrawer({ payment, refunds, canVoidAny, onClose, onChanged }) {
  const { user } = useSession();
  const { print } = usePrint();
  const [mode, setMode] = useState("view");
  const [reason, setReason] = useState("");
  const [reasonErr, setReasonErr] = useState(null);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const p = payment;
  const voidable = p.status !== "Voided" && (canVoidAny || p.createdDate === toKnack(isoToday()));
  const already = refunds.filter((r) => r.paymentId === p.id && r.status !== "Denied").reduce((s, r) => s + r.amount, 0);

  async function printSuperbill() {
    try {
      print(superbillDoc(p, mapPatient(await get(OBJ.patients, p.patientId))));
    } catch (e) { setErr(e); }
  }

  async function doVoid() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const rec = await update(OBJ.payments, p.id, { [PAY.status]: "Voided", [PAY.voidReason]: `${reason.trim()} (voided by ${user.name})` });
      const w = await logAudit(user.name, "Voided", "Payment", `Receipt #${p.receiptNo}`, reason.trim());
      onChanged(mapPayment(rec.record || rec), w);
    } catch (ex) {
      setErr(ex);
      setBusy(false);
    }
  }

  return (
    <Drawer title={`Receipt #${p.receiptNo}`} onClose={onClose}>
      <p className="drawer-amount">{money(p.amount)}</p>
      <p><StatusBadge value={ledgerStatus(p, refunds)} /></p>
      <KV items={[
        ["Patient", p.patientName], ["Date of service", p.dos], ["Payment for", p.paymentFor],
        ["Method", p.last4 ? `${p.method} •••• ${p.last4}` : p.method], ["Reference", p.txnRef],
        ["Insurance", [p.insName, p.memberId && `ID ${p.memberId}`, p.group && `Group ${p.group}`].filter(Boolean).join(" · ")],
        ["CPT", p.cpt], ["ICD-10", p.icd], ["Invoice", p.invoiceLabel && `#${p.invoiceLabel}`],
        ["Collected by", p.collectedBy], ["Entered", [p.createdDate, p.createdTime].filter(Boolean).join(" ")], ["Receipt", p.receiptSent],
        ["Note", p.notes], ["Void reason", p.voidReason],
      ]} />
      <ErrorBox error={err} />
      <Notice onClose={() => setNote(null)}>{note}</Notice>
      {mode === "view" && (
        <>
          <div className="row">
            <button type="button" className="btn btn-secondary" onClick={() => print(receiptDoc(p), { receipt: true })}>Print receipt</button>
            {(p.cpt || p.icd) && <button type="button" className="btn btn-tertiary" onClick={printSuperbill}>Print superbill</button>}
          </div>
          {p.status !== "Voided" && (
            <div className="danger-zone">
              <button type="button" className="btn btn-danger" onClick={() => setMode("refund")}>Refund payment</button>
              {voidable && <button type="button" className="link link-danger" onClick={() => setMode("void")}>Void entry</button>}
            </div>
          )}
        </>
      )}
      {mode === "void" && (
        <form className="refund" onSubmit={(e) => { e.preventDefault(); if (!reason.trim()) { setReasonErr("Enter why this entry is being voided."); return; } setReasonErr(null); setMode("void-confirm"); }} noValidate>
          <h3>Void entry</h3>
          <p className="quiet">For entry mistakes only. Use a refund when money goes back to the patient.</p>
          <Field label="Reason" error={reasonErr}>{(pp) => <input {...pp} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus autoComplete="off" />}</Field>
          <div className="row">
            <button className="btn btn-danger">Review void</button>
            <button type="button" className="btn btn-tertiary" onClick={() => setMode("view")}>Cancel</button>
          </div>
        </form>
      )}
      {mode === "void-confirm" && (
        <ConfirmationDialog
          title={`Void receipt #${p.receiptNo}?`}
          confirmLabel="Void entry"
          busyLabel="Voiding…"
          busy={busy}
          danger
          error={err}
          onConfirm={doVoid}
          onCancel={() => setMode("void")}
        >
          <p className="quiet">{money(p.amount)} · {p.patientName}. The entry stays on record but no longer counts in totals.</p>
        </ConfirmationDialog>
      )}
      {mode === "refund" && (
        <RefundForm
          payment={p}
          alreadyRefunded={already}
          onCancel={() => setMode("view")}
          onDone={(r, w) => { setMode("view"); setNote(`Refund #${r.no} for ${money(r.amount)} sent for manager approval.${w ? ` ${w}` : ""}`); onChanged(null, null, r); }}
        />
      )}
    </Drawer>
  );
}

export default function Payments({ canVoidAny = false, base }) {
  const nav = useNavigate();
  const loc = useLocation();
  const jump = loc.state?.receipt || "";
  const [range, setRange] = useState(jump ? "custom" : "today");
  const [from, setFrom] = useState(isoToday());
  const [to, setTo] = useState(isoToday());
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [refunds, setRefunds] = useState([]);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const [warn, setWarn] = useState(null);

  const load = useCallback(async (f, t, receipt) => {
    setErr(null);
    setRows(null);
    try {
      const filters = receipt ? and({ field: PAY.receiptNo, operator: "is", value: receipt }) : and(rangeRules(PAY.dos, f, t));
      const [d, r] = await Promise.all([
        list(OBJ.payments, { filters, sort: PAY.receiptNo, order: "desc", perPage: 500 }),
        list(OBJ.refunds, { filters: and({ field: REF.status, operator: "is not", value: "Denied" }), sort: REF.no, order: "desc", perPage: 500 }),
      ]);
      const pays = (d.records || []).map(mapPayment);
      setRows(pays);
      setRefunds((r.records || []).map(mapRefund));
      if (receipt && pays[0]) setOpen(pays[0]);
    } catch (e) { setErr(e); setRows([]); }
  }, []);

  useEffect(() => {
    if (jump) { load(null, null, jump); window.history.replaceState({}, ""); }
    else load(isoToday(), isoToday());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function pickRange(v) {
    setRange(v);
    if (v === "custom") return;
    const t = isoToday();
    const f = v === "today" ? t : addDays(t, -(Number(v) - 1));
    setFrom(f);
    setTo(t);
    load(f, t);
  }

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!rows) return null;
    if (!s) return rows;
    return rows.filter((r) =>
      [r.patientName, r.txnRef, String(r.receiptNo), r.amount.toFixed(2), r.method, r.collectedBy].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [rows, q]);

  const counted = (shown || []).filter((r) => r.status !== "Voided");
  const total = counted.reduce((s, r) => s + r.amount, 0);
  const multiDay = rows && new Set(rows.map((r) => r.dos)).size > 1;

  return (
    <div className="work work-wide">
      <PageHeader title="Payments" action={<button type="button" className="btn btn-secondary" onClick={() => nav(base)}>+ New payment</button>} />
      <div className="toolbar">
        <Field label="Search" className="toolbar-search">
          {(p) => <input {...p} data-search type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Patient, amount, reference, receipt #" autoComplete="off" />}
        </Field>
        <ChoiceGroup label="Date range" small options={RANGES} value={range} onChange={pickRange} />
      </div>
      {range === "custom" && (
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); load(from, to); }}>
          <Field label="From">{(p) => <input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="To">{(p) => <input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
          <button className="btn btn-secondary">Show</button>
        </form>
      )}
      <ErrorBox error={err} />
      <Notice tone="warn" onClose={() => setWarn(null)}>{warn}</Notice>
      {!shown ? <Loading /> : (
        <>
          <p className="ledger-sum"><span className="ledger-total">{money(total)}</span> <span className="quiet">· {counted.length} payments{rows.length > counted.length && ` · ${rows.length - counted.length} voided`}</span></p>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Payments</caption>
              <thead><tr><th scope="col">{multiDay ? "Date" : "Time"}</th><th scope="col">Patient</th><th scope="col" className="num">Amount</th><th scope="col">Method</th><th scope="col">Status</th><th scope="col">Receipt</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {shown.map((r) => {
                  const st = ledgerStatus(r, refunds);
                  return (
                    <tr key={r.id} className={`clickable${r.status === "Voided" ? " is-void" : ""}`} onClick={() => setOpen(r)}>
                      <td className="muted">{multiDay ? r.dos : r.createdTime || r.dos}</td>
                      <td>{r.patientName}</td>
                      <td className="num amount">{money(r.amount)}</td>
                      <td>{r.method}{r.last4 && <span className="muted"> ••{r.last4}</span>}</td>
                      <td><StatusBadge value={st} /></td>
                      <td className="muted">#{r.receiptNo}</td>
                      <td className="num">
                        <button type="button" className="more" aria-label={`Open receipt #${r.receiptNo}`} onClick={(e) => { e.stopPropagation(); setOpen(r); }}>•••</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && <EmptyState>{q ? "No payments match that search." : "No payments in this range."}</EmptyState>}
          </div>
        </>
      )}
      {open && (
        <PaymentDrawer
          payment={open}
          refunds={refunds}
          canVoidAny={canVoidAny}
          onClose={() => setOpen(null)}
          onChanged={(p, w, newRefund) => {
            if (newRefund) { setRefunds([newRefund, ...refunds]); return; }
            setRows(rows.map((r) => (r.id === p.id ? { ...r, ...p } : r)));
            setOpen(null);
            setWarn(w);
          }}
        />
      )}
    </div>
  );
}
