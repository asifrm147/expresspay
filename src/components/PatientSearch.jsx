import { useEffect, useRef, useState } from "react";
import { OBJ, PAT, RECEIPT_PREFS } from "../config";
import { list, create, update, and } from "../lib/api";
import { mapPatient } from "../lib/models";
import { toKnack, dateWrite, phoneWrite, isoToday } from "../lib/format";
import { parseDob, longDate, phoneLast4 } from "../lib/dob";
import { logAudit } from "../lib/audit";
import { useSession } from "../lib/context";
import { Drawer, ErrorBox, Field } from "./ui";

const blank = { first: "", last: "", dob: "", phone: "", email: "", receiptPref: "None", insName: "", memberId: "", group: "" };

/* ---------- Add / edit patient ---------- */
export function PatientForm({ initial, patientId, onSaved, onCancel, bare }) {
  const { user } = useSession();
  const [f, setF] = useState({ ...blank, ...initial });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const editing = Boolean(patientId);

  useEffect(() => { firstRef.current?.focus(); }, []);

  function validate() {
    const e = {};
    if (!f.first.trim()) e.first = "Enter the first name.";
    if (!f.last.trim()) e.last = "Enter the last name.";
    let dob = null;
    if (!editing) {
      dob = parseDob(f.dob);
      if (dob.error) e.dob = dob.error;
    }
    if (phoneWrite(f.phone) === null) e.phone = "Enter a 10-digit phone number.";
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Enter a valid email address.";
    if (f.receiptPref.includes("Text") && !f.phone.trim()) e.receiptPref = "Add a mobile phone to send text receipts.";
    if (f.receiptPref.includes("Email") && !f.email.trim()) e.receiptPref = "Add an email address to send email receipts.";
    return { e, dob };
  }

  async function save(ev) {
    ev.preventDefault();
    if (busy) return;
    const { e, dob } = validate();
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setErr(null);
    try {
      const body = {
        [PAT.name]: { first: f.first.trim(), last: f.last.trim() },
        [PAT.phone]: phoneWrite(f.phone),
        [PAT.email]: f.email.trim() ? { email: f.email.trim(), label: "" } : "",
        [PAT.receiptPref]: f.receiptPref,
        [PAT.insName]: f.insName.trim(),
        [PAT.memberId]: f.memberId.trim(),
        [PAT.group]: f.group.trim(),
      };
      if (!editing) body[PAT.dob] = dateWrite(dob.iso);
      if (f.receiptPref !== "None" && f.receiptPref !== (initial.receiptPref || "None")) body[PAT.consentDate] = dateWrite(isoToday());
      const rec = editing ? await update(OBJ.patients, patientId, body) : await create(OBJ.patients, body);
      const saved = mapPatient(rec.record || rec);
      const warn = await logAudit(user.name, editing ? "Edited" : "Created", "Patient", saved.name, editing ? "Contact or insurance details updated" : "New patient");
      onSaved(saved, warn);
    } catch (ex) {
      setErr(ex);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="patient-form" onSubmit={save} noValidate>
      {!bare && <h2>{editing ? "Patient details" : "Add patient"}</h2>}

      <fieldset className="group">
        <legend>Identity</legend>
        <div className="cols-2">
          <Field label="First name" error={errs.first}>
            {(p) => <input {...p} ref={firstRef} value={f.first} onChange={set("first")} autoComplete="off" />}
          </Field>
          <Field label="Last name" error={errs.last}>
            {(p) => <input {...p} value={f.last} onChange={set("last")} autoComplete="off" />}
          </Field>
          {!editing && (
            <Field label="Date of birth" hint="MM/DD/YYYY" error={errs.dob}>
              {(p) => <input {...p} className="w-dob" inputMode="numeric" value={f.dob} onChange={set("dob")} autoComplete="off" />}
            </Field>
          )}
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>Contact <span className="optional">· optional</span></legend>
        <div className="cols-2">
          <Field label="Mobile phone" error={errs.phone}>
            {(p) => <input {...p} type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="off" />}
          </Field>
          <Field label="Email" error={errs.email}>
            {(p) => <input {...p} type="email" value={f.email} onChange={set("email")} autoComplete="off" />}
          </Field>
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>Insurance <span className="optional">· optional</span></legend>
        <div className="cols-2">
          <Field label="Insurance">{(p) => <input {...p} value={f.insName} onChange={set("insName")} autoComplete="off" />}</Field>
          <Field label="Member ID">{(p) => <input {...p} value={f.memberId} onChange={set("memberId")} autoComplete="off" />}</Field>
          <Field label="Group number">{(p) => <input {...p} value={f.group} onChange={set("group")} autoComplete="off" />}</Field>
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>Receipt <span className="optional">· optional</span></legend>
        <Field label="Preference" hint="Only send a receipt when the patient asks." error={errs.receiptPref}>
          {(p) => (
            <select {...p} className="w-md" value={f.receiptPref} onChange={set("receiptPref")}>
              {RECEIPT_PREFS.map((o) => <option key={o}>{o}</option>)}
            </select>
          )}
        </Field>
      </fieldset>

      <ErrorBox error={err} />
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save details" : "Add patient & continue"}
        </button>
        <button type="button" className="btn btn-tertiary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

/* ---------- Find patient ----------
   One stable block: input row, then (only if needed) a short result list or "no patient".
   A single match is selected immediately — the caller moves focus onward. */
export default function PatientSearch({ onSelect, autoFocus = true }) {
  const [mode, setMode] = useState("dob"); // dob | text
  const [dobText, setDobText] = useState("");
  const [query, setQuery] = useState("");
  const [fieldErr, setFieldErr] = useState(null);
  const [state, setState] = useState("idle"); // idle | searching | multiple | none | error
  const [results, setResults] = useState([]);
  const [err, setErr] = useState(null);
  const [lastSearch, setLastSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const addRef = useRef(null);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus, mode]);
  useEffect(() => {
    if (state === "multiple") listRef.current?.querySelector("button")?.focus();
    if (state === "none") addRef.current?.focus();
  }, [state]);

  function again() {
    setState("idle");
    setResults([]);
    setErr(null);
    setFieldErr(null);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select?.(); }, 0);
  }

  function settle(rows) {
    setResults(rows);
    if (rows.length === 1) { setState("idle"); onSelect(rows[0]); }
    else setState(rows.length === 0 ? "none" : "multiple");
  }

  async function run(filters, label, narrow) {
    setState("searching");
    setErr(null);
    setLastSearch(label);
    try {
      const d = await list(OBJ.patients, { filters, sort: PAT.name, order: "asc", perPage: 50 });
      let rows = (d.records || []).map(mapPatient);
      if (narrow) rows = rows.filter(narrow);
      settle(rows);
    } catch (e) {
      setErr(e);
      setState("error");
    }
  }

  async function search(e) {
    e?.preventDefault();
    if (state === "searching") return;
    setFieldErr(null);
    const notTest = { field: PAT.recordType, operator: "is not", value: "Test" };
    if (mode === "dob") {
      const r = parseDob(dobText);
      if (r.error) { setFieldErr(r.error); return; }
      setDobText(r.display);
      await run(and({ field: PAT.dob, operator: "is", value: toKnack(r.iso) }, notTest), r.display);
    } else {
      const q = query.trim();
      const digits = q.replace(/\D/g, "");
      if (digits.length >= 4) {
        await run(and({ field: PAT.phone, operator: "contains", value: digits.slice(-4) }, notTest), q,
          digits.length > 4 ? (p) => p.phone.replace(/\D/g, "").endsWith(digits.slice(-10)) : null);
      } else if (q.length >= 2) {
        await run(and({ field: PAT.name, operator: "contains", value: q }, notTest), q);
      } else {
        setFieldErr("Enter at least 2 letters of a name, or 4 digits of a phone number.");
      }
    }
  }

  const isDob = mode === "dob";
  return (
    <div className="find">
      <form onSubmit={search} noValidate>
        <Field label={isDob ? "Date of birth" : "Name or phone"} hint={isDob ? "MM/DD/YYYY" : "Last name, full name, or phone"} error={fieldErr}>
          {(p) => (
            <div className="find-row">
              <input
                {...p}
                ref={inputRef}
                data-search
                className={isDob ? "w-dob" : "w-md"}
                inputMode={isDob ? "numeric" : "text"}
                autoComplete="off"
                value={isDob ? dobText : query}
                onChange={(e) => { (isDob ? setDobText : setQuery)(e.target.value); if (fieldErr) setFieldErr(null); if (state !== "idle" && state !== "searching") setState("idle"); }}
                onBlur={() => { if (isDob) { const r = parseDob(dobText); if (!r.error) setDobText(r.display); } }}
              />
              <button className="btn btn-secondary" disabled={state === "searching"}>{state === "searching" ? "Searching…" : "Find"}</button>
            </div>
          )}
        </Field>
      </form>
      <button type="button" className="link link-quiet" onClick={() => { setMode(isDob ? "text" : "dob"); again(); }}>
        {isDob ? "Search by name or phone" : "Search by date of birth"}
      </button>
      {state === "searching" && <span className="sr-only" role="status">Searching…</span>}

      {state === "error" && <ErrorBox error={`Patient search failed. Try again. (${err?.message || "no details"})`} />}

      {state === "multiple" && (
        <div className="find-results">
          <p className="quiet small">{results.length} patients match {lastSearch}. Choose one.</p>
          <ul className="pick-list" ref={listRef}>
            {results.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  onKeyDown={(e) => {
                    const items = listRef.current.querySelectorAll("button");
                    if (e.key === "ArrowDown") { e.preventDefault(); items[Math.min(i + 1, items.length - 1)].focus(); }
                    if (e.key === "ArrowUp") { e.preventDefault(); items[Math.max(i - 1, 0)].focus(); }
                    if (e.key === "Escape") again();
                  }}
                >
                  <span className="pick-name">{p.name}</span>
                  <span className="pick-meta">{longDate(p.dob)}{phoneLast4(p.phone) ? ` · phone ending ${phoneLast4(p.phone)}` : " · no phone on file"}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="link" onClick={() => setAdding(true)}>None of these — add patient</button>
        </div>
      )}

      {state === "none" && (
        <div className="find-results" role="status">
          <p><strong>No patient found</strong> <span className="quiet">for {lastSearch}.</span></p>
          <div className="row row-tight">
            <button type="button" className="btn btn-secondary" ref={addRef} onClick={() => setAdding(true)}>Add new patient</button>
            <button type="button" className="link" onClick={again}>Search again</button>
          </div>
        </div>
      )}

      {adding && (
        <Drawer title="Add patient" onClose={() => setAdding(false)}>
          <PatientForm
            bare
            initial={{ dob: isDob ? dobText : "" }}
            onCancel={() => setAdding(false)}
            onSaved={(p) => { setAdding(false); again(); onSelect(p); }}
          />
        </Drawer>
      )}
    </div>
  );
}
