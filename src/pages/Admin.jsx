import { useCallback, useEffect, useMemo, useState } from "react";
import { OBJ, FEE, AUD, PAYMENT_FOR } from "../config";
import { list, create, update, and } from "../lib/api";
import { mapFee, mapAudit } from "../lib/models";
import { isoToday, addDays, rangeRules, money, moneyWrite, num } from "../lib/format";
import { logAudit } from "../lib/audit";
import { useSession } from "../lib/context";
import { clearFeeCache } from "./NewPayment";
import { EmptyState, ErrorBox, Field, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";

const blankFee = { name: "", paymentFor: "Self-Pay Visit", price: "", cpt: "" };

export function FeeSchedule() {
  const { user } = useSession();
  const [rows, setRows] = useState(null);
  const [f, setF] = useState(blankFee);
  const [editId, setEditId] = useState(null);
  const [nameErr, setNameErr] = useState(null);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const load = useCallback(async () => {
    try {
      const d = await list(OBJ.fees, { sort: FEE.name, order: "asc", perPage: 300 });
      setRows((d.records || []).map(mapFee));
    } catch (e) { setErr(e); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    if (!f.name.trim()) { setNameErr("Enter the service name."); return; }
    setNameErr(null);
    setBusy(true);
    setErr(null);
    try {
      const body = { [FEE.name]: f.name.trim(), [FEE.paymentFor]: f.paymentFor, [FEE.price]: f.price === "" ? "" : moneyWrite(f.price), [FEE.cpt]: f.cpt.trim() };
      if (editId) await update(OBJ.fees, editId, body);
      else await create(OBJ.fees, { ...body, [FEE.availability]: "Active" });
      setNote(await logAudit(user.name, editId ? "Edited" : "Created", "Fee Schedule", f.name.trim(), f.price ? money(num(f.price)) : "No set price"));
      clearFeeCache();
      setF(blankFee);
      setEditId(null);
      load();
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  }

  async function toggle(x) {
    const next = x.availability === "Inactive" ? "Active" : "Inactive";
    try {
      await update(OBJ.fees, x.id, { [FEE.availability]: next });
      setNote(await logAudit(user.name, "Edited", "Fee Schedule", x.name, `Set ${next.toLowerCase()}`));
      clearFeeCache();
      load();
    } catch (e) { setErr(e); }
  }

  return (
    <div className="work work-wide">
      <PageHeader title="Fee schedule" />
      <form className="section" onSubmit={save} noValidate>
        <h2>{editId ? "Edit service" : "Add service"}</h2>
        <div className="cols-2">
          <Field label="Service" error={nameErr}>{(p) => <input {...p} autoComplete="off" value={f.name} onChange={set("name")} />}</Field>
          <Field label="Payment type">
            {(p) => <select {...p} value={f.paymentFor} onChange={set("paymentFor")}>{PAYMENT_FOR.map((o) => <option key={o}>{o}</option>)}</select>}
          </Field>
          <Field label="Self-pay price" optional hint="Leave blank if it varies.">
            {(p) => (
              <div className="money money-sm">
                <span aria-hidden="true">$</span>
                <input {...p} inputMode="decimal" autoComplete="off" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^0-9.]/g, "") })} />
              </div>
            )}
          </Field>
          <Field label="CPT code" optional>{(p) => <input {...p} className="w-sm" autoComplete="off" value={f.cpt} onChange={set("cpt")} />}</Field>
        </div>
        <ErrorBox error={err} />
        <div className="row">
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : editId ? "Save service" : "Add service"}</button>
          {editId && <button type="button" className="btn btn-tertiary" onClick={() => { setEditId(null); setF(blankFee); }}>Cancel</button>}
        </div>
      </form>
      <Notice tone="warn" onClose={() => setNote(null)}>{note}</Notice>
      {!rows ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Services</caption>
            <thead><tr><th scope="col">Service</th><th scope="col">Payment type</th><th scope="col">CPT</th><th scope="col" className="num">Self-pay</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className={x.availability === "Inactive" ? "is-void" : ""}>
                  <td>{x.name}</td><td className="muted">{x.paymentFor}</td><td className="muted">{x.cpt}</td>
                  <td className="num amount">{x.price ? money(x.price) : "Varies"}</td>
                  <td><StatusBadge value={x.availability} /></td>
                  <td className="actions-cell">
                    <button type="button" className="link" onClick={() => { setEditId(x.id); setF({ name: x.name, paymentFor: x.paymentFor || "Other", price: x.price ? x.price.toFixed(2) : "", cpt: x.cpt }); window.scrollTo(0, 0); }}>Edit</button>
                    <button type="button" className="link" onClick={() => toggle(x)}>{x.availability === "Inactive" ? "Turn on" : "Turn off"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState>No services yet.</EmptyState>}
        </div>
      )}
    </div>
  );
}

export function AuditLog() {
  const [from, setFrom] = useState(addDays(isoToday(), -7));
  const [to, setTo] = useState(isoToday());
  const [who, setWho] = useState("");
  const [action, setAction] = useState("");
  const [ref, setRef] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setRows(null);
    setErr(null);
    try {
      const d = await list(OBJ.audit, { filters: and(rangeRules(AUD.createdOn, from, to)), sort: AUD.createdOn, order: "desc", perPage: 1000 });
      setRows((d.records || []).map(mapAudit));
    } catch (e) { setErr(e); setRows([]); }
  }, [from, to]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const users = useMemo(() => [...new Set((rows || []).map((r) => r.user).filter(Boolean))].sort(), [rows]);
  const actions = useMemo(() => [...new Set((rows || []).map((r) => r.action).filter(Boolean))].sort(), [rows]);
  const shown = (rows || []).filter((r) =>
    (!who || r.user === who) && (!action || r.action === action)
    && (!ref.trim() || `${r.recordType} ${r.ref} ${r.details}`.toLowerCase().includes(ref.trim().toLowerCase())));
  const amountOf = (d) => (String(d).match(/-?\$[\d,]+\.\d{2}/) || [""])[0];

  return (
    <div className="work work-wide">
      <PageHeader title="Audit log" />
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <Field label="From">{(p) => <input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="To">{(p) => <input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        <button className="btn btn-secondary">Load</button>
      </form>
      <div className="toolbar">
        <Field label="User">{(p) => <select {...p} value={who} onChange={(e) => setWho(e.target.value)}><option value="">Everyone</option>{users.map((u) => <option key={u}>{u}</option>)}</select>}</Field>
        <Field label="Action">{(p) => <select {...p} value={action} onChange={(e) => setAction(e.target.value)}><option value="">All</option>{actions.map((a) => <option key={a}>{a}</option>)}</select>}</Field>
        <Field label="Transaction" className="toolbar-search">{(p) => <input {...p} data-search type="search" autoComplete="off" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Receipt #, refund #, invoice #" />}</Field>
      </div>
      <ErrorBox error={err} />
      {!rows ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Audit entries, read-only</caption>
            <thead><tr><th scope="col">Timestamp</th><th scope="col">User</th><th scope="col">Action</th><th scope="col">Patient / transaction</th><th scope="col" className="num">Amount</th><th scope="col">Details</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{r.time}</td><td>{r.user}</td><td>{r.action}</td>
                  <td>{r.recordType} {r.ref}</td><td className="num amount">{amountOf(r.details)}</td><td className="wrap muted">{r.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <EmptyState>No entries match.</EmptyState>}
        </div>
      )}
    </div>
  );
}
