import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OBJ, INV } from "../config";
import { list, create, update, and } from "../lib/api";
import { mapInvoice } from "../lib/models";
import { isoToday, addDays, dateWrite, moneyWrite, money, num } from "../lib/format";
import { logAudit } from "../lib/audit";
import { invoiceDoc } from "../lib/docs";
import { useSession, usePrint } from "../lib/context";
import PatientSearch from "../components/PatientSearch";
import { ChoiceGroup, ConfirmationDialog, EmptyState, ErrorBox, Field, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";

const VIEWS = ["Open", "Partially Paid", "Paid", "Voided", "All"].map((v) => ({ value: v, label: v }));

function NewInvoice({ onDone, onCancel }) {
  const { user } = useSession();
  const [patient, setPatient] = useState(null);
  const [f, setF] = useState({ dos: isoToday(), due: addDays(isoToday(), 30), desc: "", amount: "", notes: "" });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    const x = {};
    if (num(f.amount) <= 0) x.amount = "Enter the amount due.";
    if (!f.desc.trim()) x.desc = "Describe what the invoice is for.";
    setErrs(x);
    if (Object.keys(x).length) return;
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
    <section className="panel-quiet">
      <div className="row-between"><h2>New invoice</h2><button type="button" className="link" onClick={onCancel}>Cancel</button></div>
      {!patient ? <PatientSearch onSelect={setPatient} /> : (
        <form onSubmit={save} noValidate>
          <p className="quiet">{patient.name} · <button type="button" className="link" onClick={() => setPatient(null)}>Change</button></p>
          <Field label="Amount due" error={errs.amount}>
            {(p) => (
              <div className="money money-sm">
                <span aria-hidden="true">$</span>
                <input {...p} inputMode="decimal" autoComplete="off" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") })} autoFocus />
              </div>
            )}
          </Field>
          <Field label="Description" hint="Printed on the invoice." error={errs.desc}>
            {(p) => <input {...p} className="w-lg" autoComplete="off" value={f.desc} onChange={set("desc")} />}
          </Field>
          <div className="cols-2">
            <Field label="Date of service">{(p) => <input {...p} type="date" value={f.dos} onChange={set("dos")} />}</Field>
            <Field label="Due date">{(p) => <input {...p} type="date" value={f.due} onChange={set("due")} />}</Field>
          </div>
          <Field label="Internal note" optional>{(p) => <textarea {...p} rows={2} value={f.notes} onChange={set("notes")} />}</Field>
          <ErrorBox error={err} />
          <div className="row"><button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create invoice"}</button></div>
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
  const [voiding, setVoiding] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidErr, setVoidErr] = useState(null);
  const [busy, setBusy] = useState(false);

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

  async function confirmVoid() {
    if (!voidReason.trim()) { setVoidErr("Enter why this invoice is being voided."); return; }
    setBusy(true);
    setVoidErr(null);
    const inv = voiding;
    try {
      await update(OBJ.invoices, inv.id, { [INV.status]: "Voided", [INV.notes]: [inv.notes, `Voided by ${user.name}: ${voidReason.trim()}`].filter(Boolean).join("\n") });
      const w = await logAudit(user.name, "Voided", "Invoice", `Invoice #${inv.no}`, voidReason.trim());
      setNote(`Invoice #${inv.no} voided.${w ? ` ${w}` : ""}`);
      setVoiding(null);
      load();
    } catch (e) { setVoidErr(e); } finally { setBusy(false); }
  }

  return (
    <div className="work work-wide">
      <PageHeader title="Invoices" action={!adding && <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>+ New invoice</button>} />
      {adding && (
        <NewInvoice
          onCancel={() => setAdding(false)}
          onDone={(inv, w) => { setAdding(false); setNote(`Invoice #${inv.no} created.${w ? ` ${w}` : ""}`); print(invoiceDoc(inv)); load(); }}
        />
      )}
      <div className="toolbar"><ChoiceGroup label="Invoice status" small options={VIEWS} value={view} onChange={setView} /></div>
      <ErrorBox error={err} />
      <Notice onClose={() => setNote(null)}>{note}</Notice>
      {!rows ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Invoices</caption>
            <thead><tr><th scope="col">Invoice</th><th scope="col">Patient</th><th scope="col">Due</th><th scope="col" className="num">Balance</th><th scope="col" className="num">Total</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td className="muted">#{i.no}</td>
                  <td>{i.patientName}</td>
                  <td className="muted">{i.due}</td>
                  <td className="num amount">{money(Math.max(0, i.amountDue - i.amountPaid))}</td>
                  <td className="num muted">{money(i.amountDue)}</td>
                  <td><StatusBadge value={i.status} /></td>
                  <td className="actions-cell">
                    {["Open", "Partially Paid"].includes(i.status) && (
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => nav(base, { state: { patientId: i.patientId, invoiceId: i.id } })}>Take payment</button>
                    )}
                    <button type="button" className="link" onClick={() => print(invoiceDoc(i))}>Print</button>
                    {canVoid && ["Open", "Partially Paid"].includes(i.status) && (
                      <button type="button" className="link link-danger" onClick={() => { setVoidReason(""); setVoidErr(null); setVoiding(i); }}>Void</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState>No invoices here.</EmptyState>}
        </div>
      )}
      {voiding && (
        <ConfirmationDialog
          title={`Void invoice #${voiding.no}?`}
          confirmLabel="Void invoice"
          busyLabel="Voiding…"
          busy={busy}
          danger
          error={typeof voidErr === "object" ? voidErr : null}
          onConfirm={confirmVoid}
          onCancel={() => setVoiding(null)}
        >
          <p className="quiet">{voiding.patientName} · balance {money(Math.max(0, voiding.amountDue - voiding.amountPaid))}</p>
          <Field label="Reason" error={typeof voidErr === "string" ? voidErr : null}>
            {(p) => <input {...p} autoComplete="off" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />}
          </Field>
        </ConfirmationDialog>
      )}
    </div>
  );
}
