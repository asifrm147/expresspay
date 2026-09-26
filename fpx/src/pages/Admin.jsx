import { useCallback, useEffect, useState } from "react";
import { OBJ, FEE, AUD, PAYMENT_FOR } from "../config";
import { list, create, update, and } from "../lib/api";
import { mapFee, mapAudit } from "../lib/models";
import { isoToday, addDays, rangeRules, money, moneyWrite, num } from "../lib/format";
import { logAudit } from "../lib/audit";
import { useSession } from "../lib/context";
import { clearFeeCache } from "./NewPayment";
import { ErrorBox, Field, Loading, Notice, StatusTag } from "../components/ui";

const blankFee = { name: "", paymentFor: "Self-Pay Visit", price: "", cpt: "" };

export function FeeSchedule() {
  const { user } = useSession();
  const [rows, setRows] = useState(null);
  const [f, setF] = useState(blankFee);
  const [editId, setEditId] = useState(null);
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
    if (!f.name.trim()) return setErr("Enter the service name.");
    setBusy(true);
    setErr(null);
    try {
      const body = { [FEE.name]: f.name.trim(), [FEE.paymentFor]: f.paymentFor, [FEE.price]: f.price === "" ? "" : moneyWrite(f.price), [FEE.cpt]: f.cpt.trim() };
      if (editId) await update(OBJ.fees, editId, body);
      else await create(OBJ.fees, { ...body, [FEE.availability]: "Active" });
      const w = await logAudit(user.name, editId ? "Edited" : "Created", "Fee Schedule", f.name.trim(), f.price ? money(num(f.price)) : "No set price");
      setNote(w);
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
    <div className="page">
      <h1>Fee schedule</h1>
      <p className="muted">Services listed here appear on the payment screen and fill in the self-pay price.</p>
      <form className="panel" onSubmit={save}>
        <h2>{editId ? "Edit service" : "Add a service"}</h2>
        <div className="grid">
          <Field label="Service"><input value={f.name} onChange={set("name")} placeholder="Office visit, level 3" /></Field>
          <Field label="Payment type">
            <select value={f.paymentFor} onChange={set("paymentFor")}>{PAYMENT_FOR.map((o) => <option key={o}>{o}</option>)}</select>
          </Field>
          <Field label="Self-pay price" hint="Leave blank if it varies."><input className="amount" inputMode="decimal" value={f.price} onChange={set("price")} /></Field>
          <Field label="CPT code"><input value={f.cpt} onChange={set("cpt")} /></Field>
        </div>
        <ErrorBox error={err} />
        <div className="actions">
          <button className="btn" disabled={busy}>{busy ? "Saving…" : editId ? "Save service" : "Add service"}</button>
          {editId && <button type="button" className="btn btn-quiet" onClick={() => { setEditId(null); setF(blankFee); }}>Cancel</button>}
        </div>
      </form>
      <Notice tone="warn" onClose={() => setNote(null)}>{note}</Notice>
      {!rows ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Service</th><th>Payment type</th><th>CPT</th><th className="num">Self-pay price</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className={x.availability === "Inactive" ? "row-void" : ""}>
                  <td>{x.name}</td><td>{x.paymentFor}</td><td>{x.cpt}</td><td className="num">{x.price ? money(x.price) : "Varies"}</td>
                  <td><StatusTag value={x.availability} /></td>
                  <td className="row-actions">
                    <button className="btn btn-small btn-quiet" onClick={() => { setEditId(x.id); setF({ name: x.name, paymentFor: x.paymentFor || "Other", price: x.price ? x.price.toFixed(2) : "", cpt: x.cpt }); window.scrollTo(0, 0); }}>Edit</button>
                    <button className="btn btn-small btn-quiet" onClick={() => toggle(x)}>{x.availability === "Inactive" ? "Turn on" : "Turn off"}</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="empty">No services yet. Add your common visits and their self-pay prices.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AuditLog() {
  const [from, setFrom] = useState(addDays(isoToday(), -7));
  const [to, setTo] = useState(isoToday());
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setRows(null);
    setErr(null);
    try {
      const d = await list(OBJ.audit, { filters: and(rangeRules(AUD.time, from, to)), sort: AUD.time, order: "desc", perPage: 500 });
      setRows((d.records || []).map(mapAudit));
    } catch (e) { setErr(e); setRows([]); }
  }, [from, to]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <h1>Audit log</h1>
      <p className="muted">Every payment, void, refund, export and settings change, with who did it.</p>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <button className="btn">Show entries</button>
      </form>
      <ErrorBox error={err} />
      {!rows ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}><td>{r.time}</td><td>{r.user}</td><td>{r.action}</td><td>{r.recordType} {r.ref}</td><td className="wrap">{r.details}</td></tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="empty">No entries for these dates.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
