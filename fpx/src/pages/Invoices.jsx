import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OBJ, INV } from "../config";
import { list, create, update, and } from "../lib/api";
import { mapInvoice } from "../lib/models";
import { isoToday, addDays, dateWrite, moneyWrite, money, num } from "../lib/format";
import { logAudit } from "../lib/audit";
import { invoiceDoc } from "../lib/docs";
import { useSession, usePrint } from "../lib/context";
import PatientLookup from "../components/PatientLookup";
import { ErrorBox, Field, Loading, Notice, Segmented, StatusTag } from "../components/ui";

const VIEWS = ["Open", "Partially Paid", "Paid", "Voided", "All"];

function NewInvoice({ onDone, onCancel }) {
  const { user } = useSession();
  const [patient, setPatient] = useState(null);
  const [f, setF] = useState({ dos: isoToday(), due: addDays(isoToday(), 30), desc: "", amount: "", notes: "" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    if (!patient) return setErr("Choose the patient first.");
    if (num(f.amount) <= 0) return setErr("Enter the amount due.");
    if (!f.desc.trim()) return setErr("Describe what the invoice is for.");
    setBusy(true);
    setErr(null);
    try {
      const rec = await create(OBJ.invoices, {
        [INV.patient]: [{ id: patient.id }],
        [INV.date]: dateWrite(isoToday()),
        [INV.dos]: dateWrite(f.dos),
        [INV.due]: dateWrite(f.due),
        [INV.desc]: f.desc.trim(),
        [INV.amountDue]: moneyWrite(f.amount),
        [INV.amountPaid]: "0.00",
        [INV.status]: "Open",
        [INV.notes]: f.notes.trim(),
      });
      const inv = mapInvoice(rec.record || rec);
      const w = await logAudit(user.name, "Created", "Invoice", `Invoice #${inv.no}`, money(f.amount));
      onDone({ ...inv, patientName: inv.patientName || patient.name }, w);
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  }

  return (
    <section className="panel">
      <div className="alert-row"><h2>New invoice</h2><button className="btn-link" onClick={onCancel}>Cancel</button></div>
      <PatientLookup patient={patient} onChange={setPatient} />
      {patient && (
        <form onSubmit={save}>
          <div className="grid">
            <Field label="Date of service"><input type="date" value={f.dos} onChange={set("dos")} /></Field>
            <Field label="Due date"><input type="date" value={f.due} onChange={set("due")} /></Field>
            <Field label="Amount due"><input className="amount" inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="0.00" /></Field>
          </div>
          <Field label="Description" wide hint="Printed on the invoice."><input value={f.desc} onChange={set("desc")} placeholder="Office visit balance" /></Field>
          <Field label="Internal notes" wide><textarea rows={2} value={f.notes} onChange={set("notes")} /></Field>
          <ErrorBox error={err} />
          <div className="actions"><button className="btn" disabled={busy}>{busy ? "Creating…" : "Create invoice"}</button></div>
        </form>
      )}
    </section>
  );
}

export default function Invoices({ base, canVoid = false }) {
  const { user } = useSession();
  const { print } = usePrint();
  const nav = useNavigate();
  const [view, setView] = useState("Open");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    setErr(null);
    try {
      const filters = view === "All" ? undefined : and({ field: INV.status, operator: "is", value: view });
      const d = await list(OBJ.invoices, { filters, sort: INV.no, order: "desc", perPage: 100 });
      setRows((d.records || []).map(mapInvoice));
    } catch (e) { setErr(e); setRows([]); }
  }, [view]);

  useEffect(() => { load(); }, [load]);

  async function voidInvoice(inv) {
    const reason = window.prompt(`Why is invoice #${inv.no} being voided?`);
    if (!reason) return;
    try {
      await update(OBJ.invoices, inv.id, { [INV.status]: "Voided", [INV.notes]: [inv.notes, `Voided by ${user.name}: ${reason}`].filter(Boolean).join("\n") });
      const w = await logAudit(user.name, "Voided", "Invoice", `Invoice #${inv.no}`, reason);
      setNote(`Invoice #${inv.no} voided.${w ? ` ${w}` : ""}`);
      load();
    } catch (e) { setErr(e); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Invoices</h1>
        {!adding && <button className="btn" onClick={() => setAdding(true)}>New invoice</button>}
      </div>
      {adding && (
        <NewInvoice
          onCancel={() => setAdding(false)}
          onDone={(inv, w) => { setAdding(false); setNote(`Invoice #${inv.no} created.${w ? ` ${w}` : ""}`); print(invoiceDoc(inv)); load(); }}
        />
      )}
      <Segmented name="Invoice status" options={VIEWS} value={view} onChange={setView} />
      <ErrorBox error={err} />
      <Notice onClose={() => setNote(null)}>{note}</Notice>
      {!rows ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Invoice</th><th>Patient</th><th>Date of service</th><th>Due</th><th className="num">Due</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td>#{i.no}</td><td>{i.patientName}</td><td>{i.dos}</td><td>{i.due}</td>
                  <td className="num">{money(i.amountDue)}</td><td className="num">{money(i.amountPaid)}</td>
                  <td className="num">{money(Math.max(0, i.amountDue - i.amountPaid))}</td>
                  <td><StatusTag value={i.status} /></td>
                  <td className="row-actions">
                    <button className="btn btn-small btn-quiet" onClick={() => print(invoiceDoc(i))}>Print</button>
                    {["Open", "Partially Paid"].includes(i.status) && (
                      <button className="btn btn-small" onClick={() => nav(base, { state: { patientId: i.patientId, invoiceId: i.id } })}>Take payment</button>
                    )}
                    {canVoid && ["Open", "Partially Paid"].includes(i.status) && (
                      <button className="btn btn-small btn-quiet" onClick={() => voidInvoice(i)}>Void</button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="empty">No invoices here.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
