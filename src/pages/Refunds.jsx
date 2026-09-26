import { useCallback, useEffect, useState } from "react";
import { OBJ, PAY, REF } from "../config";
import { list, update, and } from "../lib/api";
import { mapPayment, mapRefund } from "../lib/models";
import { isoToday, dateWrite, money, toKnack } from "../lib/format";
import { logAudit } from "../lib/audit";
import { refundDoc } from "../lib/docs";
import { useSession, usePrint } from "../lib/context";
import PatientSearch from "../components/PatientSearch";
import RefundForm from "../components/RefundForm";
import { ChoiceGroup, ConfirmationDialog, EmptyState, ErrorBox, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";

const VIEWS = ["Pending Approval", "Approved", "Processed", "Denied", "All"].map((v) => ({ value: v, label: v === "Processed" ? "Paid out" : v === "Pending Approval" ? "Pending" : v }));

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
    <section className="panel-quiet">
      <div className="row-between"><h2>New refund</h2><button type="button" className="link" onClick={onCancel}>Cancel</button></div>
      {!patient && <PatientSearch onSelect={setPatient} />}
      <ErrorBox error={err} />
      {patient && !pick && (
        payments === null ? <Loading label="Loading payments…" /> : (
          <>
            <p className="quiet">{patient.name} · choose the payment to refund.</p>
            <ul className="pick-list">
              {payments.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => choose(p)}>
                    <span className="pick-name">{money(p.amount)} · #{p.receiptNo}</span>
                    <span className="pick-meta">{p.dos} · {p.paymentFor} · {p.method}</span>
                  </button>
                </li>
              ))}
            </ul>
            {payments.length === 0 && <EmptyState>No payments on file for this patient.</EmptyState>}
            <button type="button" className="link" onClick={() => setPatient(null)}>Different patient</button>
          </>
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
  const [payout, setPayout] = useState(null);
  const [payoutErr, setPayoutErr] = useState(null);

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
    try {
      const rec = await update(OBJ.refunds, r.id, changes);
      const u = mapRefund(rec.record || rec);
      const w = await logAudit(user.name, action, "Refund", `Refund #${r.no}`, detail);
      setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, ...u } : x)));
      setNote(w);
      return { ...r, ...u };
    } finally { setBusyId(null); }
  }

  const approve = (r) => act(r, { [REF.status]: "Approved", [REF.approvedBy]: user.name }, "Refund Approved", money(r.amount)).catch(setErr);
  const deny = (r) => act(r, { [REF.status]: "Denied", [REF.approvedBy]: user.name }, "Refund Denied", money(r.amount)).catch(setErr);

  async function confirmPayout() {
    const r = payout;
    setPayoutErr(null);
    try {
      const u = await act(r, { [REF.status]: "Processed", [REF.refundDate]: dateWrite(isoToday()), [REF.processedBy]: user.name }, "Edited", `Refund paid out: ${money(r.amount)} by ${r.method}`);
      setPayout(null);
      print(refundDoc({ ...u, refundDate: u.refundDate || toKnack(isoToday()), processedBy: user.name }), { receipt: true });
    } catch (e) {
      setPayoutErr(e);
    }
  }

  return (
    <div className="work work-wide">
      <PageHeader title="Refunds" action={!adding && <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>+ New refund</button>} />
      {adding && (
        <NewRefund
          onCancel={() => setAdding(false)}
          onDone={(r, w) => { setAdding(false); setNote(`Refund #${r.no} sent for approval.${w ? ` ${w}` : ""}`); load(); }}
        />
      )}
      <div className="toolbar"><ChoiceGroup label="Refund status" small options={VIEWS} value={view} onChange={setView} /></div>
      <ErrorBox error={err} onClose={() => setErr(null)} />
      <Notice onClose={() => setNote(null)}>{note}</Notice>
      {!rows ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Refunds</caption>
            <thead><tr><th scope="col">Refund</th><th scope="col">Patient</th><th scope="col" className="num">Amount</th><th scope="col">By</th><th scope="col">Reason</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted">#{r.no}</td>
                  <td>{r.patientName}</td>
                  <td className="num amount">{money(r.amount)}</td>
                  <td>{r.method}</td>
                  <td className="wrap">{r.reason}</td>
                  <td>
                    <StatusBadge value={r.status} label={r.status === "Processed" ? "Paid out" : r.status === "Pending Approval" ? "Pending" : r.status} />
                    {r.approvedBy && <div className="muted small">{r.status === "Denied" ? "Denied" : "Approved"} by {r.approvedBy}</div>}
                  </td>
                  <td className="actions-cell">
                    {canApprove && r.status === "Pending Approval" && (
                      <>
                        <button type="button" className="btn btn-sm btn-secondary" disabled={busyId === r.id} onClick={() => approve(r)}>Approve</button>
                        <button type="button" className="link" disabled={busyId === r.id} onClick={() => deny(r)}>Deny</button>
                      </>
                    )}
                    {r.status === "Approved" && (
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => { setPayoutErr(null); setPayout(r); }}>Pay out</button>
                    )}
                    {r.status === "Processed" && (
                      <button type="button" className="link" onClick={() => print(refundDoc(r), { receipt: true })}>Print</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState>No refunds here.</EmptyState>}
        </div>
      )}
      {payout && (
        <ConfirmationDialog
          title={`Pay out ${money(payout.amount)} by ${payout.method.toLowerCase()}?`}
          confirmLabel="Confirm refund"
          busyLabel="Processing refund…"
          busy={busyId === payout.id}
          danger
          error={payoutErr}
          onConfirm={confirmPayout}
          onCancel={() => setPayout(null)}
        >
          <p className="quiet">Refund #{payout.no} · {payout.patientName}</p>
          <p className="quiet">Only confirm once the money has actually gone back to the patient. A refund receipt prints next.</p>
        </ConfirmationDialog>
      )}
    </div>
  );
}
