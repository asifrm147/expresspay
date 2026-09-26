import { useCallback, useEffect, useState } from "react";
import { OBJ, PAY, REF } from "../config";
import { list, update, and } from "../lib/api";
import { mapPayment, mapRefund } from "../lib/models";
import { isoToday, dateWrite, money, toKnack } from "../lib/format";
import { logAudit } from "../lib/audit";
import { refundDoc } from "../lib/docs";
import { useSession, usePrint } from "../lib/context";
import PatientLookup from "../components/PatientLookup";
import RefundForm from "../components/RefundForm";
import { ErrorBox, Loading, Notice, Segmented, StatusTag } from "../components/ui";

const VIEWS = ["Pending Approval", "Approved", "Processed", "Denied", "All"];

function NewRefund({ onDone, onCancel }) {
  const [patient, setPatient] = useState(null);
  const [payments, setPayments] = useState(null);
  const [pick, setPick] = useState(null);
  const [refunded, setRefunded] = useState(0);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setPayments(null);
    setPick(null);
    if (!patient) return;
    list(OBJ.payments, {
      filters: and({ field: PAY.patient, operator: "is", value: patient.id }, { field: PAY.status, operator: "is not", value: "Voided" }),
      sort: PAY.receiptNo, order: "desc", perPage: 25,
    }).then((d) => setPayments((d.records || []).map(mapPayment))).catch(setErr);
  }, [patient]);

  async function choose(p) {
    setErr(null);
    try {
      const d = await list(OBJ.refunds, { filters: and({ field: REF.payment, operator: "is", value: p.id }, { field: REF.status, operator: "is not", value: "Denied" }), perPage: 50 });
      setRefunded((d.records || []).map(mapRefund).reduce((s, r) => s + r.amount, 0));
      setPick({ ...p, patientName: p.patientName || patient.name });
    } catch (e) { setErr(e); }
  }

  return (
    <section className="panel">
      <div className="alert-row"><h2>New refund</h2><button className="btn-link" onClick={onCancel}>Cancel</button></div>
      <PatientLookup patient={patient} onChange={setPatient} />
      <ErrorBox error={err} />
      {patient && !pick && (
        payments === null ? <Loading label="Loading this patient's payments…" /> : (
          <div className="lookup-results">
            <p className="muted">Choose the payment being refunded.</p>
            {payments.map((p) => (
              <button type="button" key={p.id} className="result" onClick={() => choose(p)}>
                <strong>#{p.receiptNo} · {money(p.amount)}</strong>
                <span>{p.dos} · {p.paymentFor} · {p.method}</span>
              </button>
            ))}
            {payments.length === 0 && <p className="muted">No payments on file for this patient.</p>}
          </div>
        )
      )}
      {pick && <RefundForm payment={pick} alreadyRefunded={refunded} onCancel={() => setPick(null)} onDone={onDone} />}
    </section>
  );
}

export default function Refunds({ canApprove = false }) {
  const { user } = useSession();
  const { print } = usePrint();
  const [view, setView] = useState(canApprove ? "Pending Approval" : "All");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setRows(null);
    setErr(null);
    try {
      const filters = view === "All" ? undefined : and({ field: REF.status, operator: "is", value: view });
      const d = await list(OBJ.refunds, { filters, sort: REF.no, order: "desc", perPage: 100 });
      setRows((d.records || []).map(mapRefund));
    } catch (e) { setErr(e); setRows([]); }
  }, [view]);

  useEffect(() => { load(); }, [load]);

  async function act(r, changes, action, detail) {
    setBusyId(r.id);
    setErr(null);
    try {
      const rec = await update(OBJ.refunds, r.id, changes);
      const u = mapRefund(rec.record || rec);
      const w = await logAudit(user.name, action, "Refund", `Refund #${r.no}`, detail);
      setRows(rows.map((x) => (x.id === r.id ? { ...x, ...u } : x)));
      setNote(w);
      return { ...r, ...u };
    } catch (e) { setErr(e); return null; } finally { setBusyId(null); }
  }

  const approve = (r) => act(r, { [REF.status]: "Approved", [REF.approvedBy]: user.name }, "Refund Approved", money(r.amount));
  const deny = (r) => act(r, { [REF.status]: "Denied", [REF.approvedBy]: user.name }, "Refund Denied", money(r.amount));
  async function markPaid(r) {
    const u = await act(r, { [REF.status]: "Processed", [REF.refundDate]: dateWrite(isoToday()), [REF.processedBy]: user.name }, "Edited", `Refund paid out: ${money(r.amount)} by ${r.method}`);
    if (u) print(refundDoc({ ...u, refundDate: u.refundDate || toKnack(isoToday()), processedBy: user.name }), { receipt: true });
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Refunds</h1>
        {!adding && <button className="btn" onClick={() => setAdding(true)}>New refund</button>}
      </div>
      {adding && (
        <NewRefund
          onCancel={() => setAdding(false)}
          onDone={(r, w) => { setAdding(false); setNote(`Refund #${r.no} sent for approval.${w ? ` ${w}` : ""}`); load(); }}
        />
      )}
      <Segmented name="Refund status" options={VIEWS} value={view} onChange={setView} />
      <ErrorBox error={err} />
      <Notice onClose={() => setNote(null)}>{note}</Notice>
      {!rows ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Refund</th><th>Patient</th><th>Date of service</th><th className="num">Amount</th><th>By</th><th>Reason</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>#{r.no}</td><td>{r.patientName}</td><td>{r.dos}</td><td className="num">{money(r.amount)}</td>
                  <td>{r.method}</td><td className="wrap">{r.reason}</td>
                  <td><StatusTag value={r.status} />{r.approvedBy && <div className="muted small">{r.status === "Denied" ? "Denied" : "Approved"} by {r.approvedBy}</div>}</td>
                  <td className="row-actions">
                    {canApprove && r.status === "Pending Approval" && (
                      <>
                        <button className="btn btn-small" disabled={busyId === r.id} onClick={() => approve(r)}>Approve</button>
                        <button className="btn btn-small btn-quiet" disabled={busyId === r.id} onClick={() => deny(r)}>Deny</button>
                      </>
                    )}
                    {r.status === "Approved" && (
                      <button className="btn btn-small" disabled={busyId === r.id} onClick={() => markPaid(r)}>Mark refunded</button>
                    )}
                    {r.status === "Processed" && (
                      <button className="btn btn-small btn-quiet" onClick={() => print(refundDoc(r), { receipt: true })}>Print</button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="empty">No refunds here.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
