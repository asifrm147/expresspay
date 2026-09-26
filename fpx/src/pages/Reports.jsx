import { useCallback, useEffect, useMemo, useState } from "react";
import { OBJ, PAY, REF } from "../config";
import { listAll, and } from "../lib/api";
import { mapPayment, mapRefund } from "../lib/models";
import { isoToday, addDays, startOfWeek, startOfMonth, rangeRules, money, csv, download } from "../lib/format";
import { logAudit } from "../lib/audit";
import { reportDoc } from "../lib/docs";
import { useSession, usePrint } from "../lib/context";
import { ErrorBox, Field, Loading, Notice, Segmented } from "../components/ui";

const PRESETS = ["Today", "Yesterday", "This week", "Month to date", "Custom"];

function presetRange(p) {
  const t = isoToday();
  if (p === "Yesterday") return [addDays(t, -1), addDays(t, -1)];
  if (p === "This week") return [startOfWeek(t), t];
  if (p === "Month to date") return [startOfMonth(t), t];
  return [t, t];
}

function groupBy(items, key) {
  const m = {};
  items.forEach((i) => {
    const k = i[key] || "Not set";
    m[k] ||= [k, 0, 0];
    m[k][1]++;
    m[k][2] += i.amount;
  });
  return Object.values(m).sort((a, b) => b[2] - a[2]);
}

export function summarize(payments, refunds) {
  const active = payments.filter((p) => p.status !== "Voided");
  const voided = payments.filter((p) => p.status === "Voided");
  const gross = active.reduce((s, p) => s + p.amount, 0);
  const refundTotal = refunds.reduce((s, r) => s + r.amount, 0);
  return {
    count: active.length, gross, refundCount: refunds.length, refundTotal, net: gross - refundTotal,
    voidCount: voided.length, voidTotal: voided.reduce((s, p) => s + p.amount, 0),
    byMethod: groupBy(active, "method"), byCollector: groupBy(active, "collectedBy"), byCategory: groupBy(active, "paymentFor"),
  };
}

function Breakdown({ title, rows }) {
  const max = Math.max(1, ...rows.map((r) => r[2]));
  return (
    <section className="breakdown">
      <h3>{title}</h3>
      {rows.length === 0 && <p className="muted">Nothing yet.</p>}
      {rows.map(([k, n, t]) => (
        <div className="bar-row" key={k}>
          <span className="bar-label">{k} <span className="muted">({n})</span></span>
          <span className="bar"><span style={{ width: `${(t / max) * 100}%` }} /></span>
          <span className="num">{money(t)}</span>
        </div>
      ))}
    </section>
  );
}

export default function Reports() {
  const { user } = useSession();
  const { print } = usePrint();
  const [preset, setPreset] = useState("Today");
  const [range, setRange] = useState(presetRange("Today"));
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);

  const load = useCallback(async ([from, to]) => {
    setData(null);
    setErr(null);
    try {
      const [p, r] = await Promise.all([
        listAll(OBJ.payments, { filters: and(rangeRules(PAY.dos, from, to)), sort: PAY.receiptNo, order: "asc" }),
        listAll(OBJ.refunds, { filters: and({ field: REF.status, operator: "is", value: "Processed" }, rangeRules(REF.refundDate, from, to)) }),
      ]);
      setData({ payments: p.map(mapPayment), refunds: r.map(mapRefund), from, to });
    } catch (e) { setErr(e); setData({ payments: [], refunds: [], from, to }); }
  }, []);

  useEffect(() => { load(range); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const s = useMemo(() => (data ? summarize(data.payments, data.refunds) : null), [data]);
  const label = data ? (data.from === data.to ? data.from : `${data.from} to ${data.to}`) : "";

  function choosePreset(p) {
    setPreset(p);
    if (p !== "Custom") {
      const r = presetRange(p);
      setRange(r);
      load(r);
    }
  }

  async function exportDetail() {
    const rows = [["Receipt", "Date of service", "Patient", "Payment for", "Form of payment", "Card last 4", "Reference", "Amount", "Insurance", "Member ID", "CPT", "ICD-10", "Collected by", "Status", "Void reason", "Notes"]];
    data.payments.forEach((p) => rows.push([p.receiptNo, p.dos, p.patientName, p.paymentFor, p.method, p.last4, p.txnRef, p.amount.toFixed(2), p.insName, p.memberId, p.cpt, p.icd, p.collectedBy, p.status, p.voidReason, p.notes]));
    rows.push([]);
    rows.push(["Refund", "Date of service", "Patient", "Refund date", "Refunded by", "", "", "Amount", "", "", "", "", "Processed by", "Approved by", "Reason"]);
    data.refunds.forEach((r) => rows.push([r.no, r.dos, r.patientName, r.refundDate, r.method, "", "", `-${r.amount.toFixed(2)}`, "", "", "", "", r.processedBy, r.approvedBy, r.reason]));
    download(`franklinpark-payments-detail-${data.from}-to-${data.to}.csv`, csv(rows));
    setNote(await logAudit(user.name, "Exported", "Report", label, "Detail export with patient information"));
  }

  async function exportSummary() {
    // No patient information: safe to hand to bookkeeping (Practice Books).
    const m = {};
    data.payments.filter((p) => p.status !== "Voided").forEach((p) => {
      const k = [p.dos, "Payment", p.method, p.paymentFor, p.collectedBy].join("|");
      m[k] ||= [p.dos, "Payment", p.method, p.paymentFor, p.collectedBy, 0, 0];
      m[k][5]++;
      m[k][6] += p.amount;
    });
    data.refunds.forEach((r) => {
      const k = [r.refundDate, "Refund", r.method, "Refund", r.processedBy].join("|");
      m[k] ||= [r.refundDate, "Refund", r.method, "Refund", r.processedBy, 0, 0];
      m[k][5]++;
      m[k][6] -= r.amount;
    });
    const rows = [["Date", "Type", "Method", "Category", "Staff", "Count", "Total"], ...Object.values(m).sort().map((r) => [...r.slice(0, 6), r[6].toFixed(2)])];
    download(`franklinpark-summary-${data.from}-to-${data.to}.csv`, csv(rows));
    setNote(await logAudit(user.name, "Exported", "Report", label, "Summary export, no patient information"));
  }

  return (
    <div className="page">
      <h1>Reports</h1>
      <Segmented name="Date range" options={PRESETS} value={preset} onChange={choosePreset} />
      {preset === "Custom" && (
        <form className="filters" onSubmit={(e) => { e.preventDefault(); load(range); }}>
          <Field label="From"><input type="date" value={range[0]} onChange={(e) => setRange([e.target.value, range[1]])} /></Field>
          <Field label="To"><input type="date" value={range[1]} onChange={(e) => setRange([range[0], e.target.value])} /></Field>
          <button className="btn">Run report</button>
        </form>
      )}
      <ErrorBox error={err} />
      <Notice tone="warn" onClose={() => setNote(null)}>{note}</Notice>
      {!s ? <Loading label="Adding it up…" /> : (
        <>
          <p className="report-range">{label}</p>
          <dl className="figures big">
            <div><dt>Collected</dt><dd>{money(s.gross)}</dd><span className="muted">{s.count} payments</span></div>
            <div><dt>Refunded</dt><dd>{money(s.refundTotal)}</dd><span className="muted">{s.refundCount} refunds</span></div>
            <div><dt>Net</dt><dd className="strong">{money(s.net)}</dd><span className="muted">{s.voidCount} voided entries excluded</span></div>
          </dl>
          <div className="breakdowns">
            <Breakdown title="By form of payment" rows={s.byMethod} />
            <Breakdown title="By collector" rows={s.byCollector} />
            <Breakdown title="By payment type" rows={s.byCategory} />
          </div>
          <div className="actions">
            <button className="btn" onClick={() => print(reportDoc(s, label))}>Print report</button>
            <button className="btn btn-quiet" onClick={exportSummary}>Export summary (no patient info)</button>
            <button className="btn btn-quiet" onClick={exportDetail}>Export detail</button>
          </div>
          <p className="muted small">The detail export contains patient names and insurance details. Save it only on practice devices.</p>
        </>
      )}
    </div>
  );
}
