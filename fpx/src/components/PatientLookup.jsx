import { useEffect, useRef, useState } from "react";
import { OBJ, PAT, RECEIPT_PREFS } from "../config";
import { list, create, update, get, and } from "../lib/api";
import { mapPatient } from "../lib/models";
import { toKnack, dateWrite, phoneWrite, isoToday } from "../lib/format";
import { logAudit } from "../lib/audit";
import { useSession } from "../lib/context";
import { ErrorBox, Field, Notice } from "./ui";

const blank = { first: "", last: "", phone: "", email: "", receiptPref: "None", insName: "", memberId: "", group: "" };

function patientBody(f, dobIso, prevPref) {
  const phone = phoneWrite(f.phone);
  if (phone === null) throw new Error("Phone number needs 10 digits.");
  const body = {
    [PAT.name]: { first: f.first.trim(), last: f.last.trim() },
    [PAT.phone]: phone,
    [PAT.email]: f.email.trim() ? { email: f.email.trim(), label: "" } : "",
    [PAT.receiptPref]: f.receiptPref,
    [PAT.insName]: f.insName.trim(),
    [PAT.memberId]: f.memberId.trim(),
    [PAT.group]: f.group.trim(),
  };
  if (dobIso) body[PAT.dob] = dateWrite(dobIso);
  if (f.receiptPref !== "None" && f.receiptPref !== prevPref) body[PAT.consentDate] = dateWrite(isoToday());
  return body;
}

function PatientForm({ initial, dobIso, onSaved, onCancel, patientId }) {
  const { user } = useSession();
  const [f, setF] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    if (!f.first.trim() || !f.last.trim()) return setErr("First and last name are required.");
    if (f.receiptPref.includes("Text") && !f.phone.trim()) return setErr("Add a phone number to send text receipts.");
    if (f.receiptPref.includes("Email") && !f.email.trim()) return setErr("Add an email address to send email receipts.");
    setBusy(true);
    setErr(null);
    try {
      const body = patientBody(f, patientId ? null : dobIso, initial.receiptPref);
      const rec = patientId ? await update(OBJ.patients, patientId, body) : await create(OBJ.patients, body);
      const saved = mapPatient(rec.record || rec);
      const warn = await logAudit(user.name, patientId ? "Edited" : "Created", "Patient", saved.name, patientId ? "Contact or insurance details updated" : "New patient");
      onSaved(saved, warn);
    } catch (ex) {
      setErr(ex);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <div className="grid">
        <Field label="First name"><input value={f.first} onChange={set("first")} autoFocus required /></Field>
        <Field label="Last name"><input value={f.last} onChange={set("last")} required /></Field>
        <Field label="Mobile phone"><input value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="(509) 555-0100" /></Field>
        <Field label="Email"><input value={f.email} onChange={set("email")} type="email" /></Field>
        <Field label="Send receipts by" hint="Only if the patient asks for it.">
          <select value={f.receiptPref} onChange={set("receiptPref")}>
            {RECEIPT_PREFS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Insurance name"><input value={f.insName} onChange={set("insName")} /></Field>
        <Field label="Member ID"><input value={f.memberId} onChange={set("memberId")} /></Field>
        <Field label="Group number"><input value={f.group} onChange={set("group")} /></Field>
      </div>
      <ErrorBox error={err} />
      <div className="actions">
        <button className="btn" disabled={busy}>{busy ? "Saving…" : patientId ? "Save changes" : "Add patient"}</button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function PatientLookup({ patient, onChange, preloadId }) {
  const [dob, setDob] = useState("");
  const [nameQ, setNameQ] = useState("");
  const [results, setResults] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("search");
  const [warn, setWarn] = useState(null);
  const dobRef = useRef(null);

  useEffect(() => {
    if (!preloadId) return;
    get(OBJ.patients, preloadId).then((r) => onChange(mapPatient(r))).catch(setErr);
  }, [preloadId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function search(iso) {
    setResults(null);
    setErr(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso.slice(0, 4) < "1900") return;
    setBusy(true);
    try {
      const d = await list(OBJ.patients, {
        filters: and({ field: PAT.dob, operator: "is", value: toKnack(iso) }, { field: PAT.recordType, operator: "is not", value: "Test" }),
        sort: PAT.name, order: "asc", perPage: 50,
      });
      setResults((d.records || []).map(mapPatient));
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  if (patient && mode !== "edit") {
    return (
      <section className="patient-card">
        <div>
          <div className="patient-name">{patient.name}</div>
          <div className="patient-meta">
            DOB {patient.dob}
            {patient.phone && <> · {patient.phone}</>}
            {patient.insName && <> · {patient.insName}</>}
          </div>
          {patient.receiptPref && patient.receiptPref !== "None" && <div className="patient-meta">Receipts by {patient.receiptPref.toLowerCase()}</div>}
        </div>
        <div className="actions">
          <button type="button" className="btn btn-quiet" onClick={() => setMode("edit")}>Edit details</button>
          <button type="button" className="btn btn-quiet" onClick={() => { onChange(null); setMode("search"); setTimeout(() => dobRef.current?.focus(), 0); }}>Change patient</button>
        </div>
        <Notice tone="warn" onClose={() => setWarn(null)}>{warn}</Notice>
      </section>
    );
  }

  if (patient && mode === "edit") {
    return (
      <PatientForm
        patientId={patient.id}
        initial={{ ...blank, ...patient, receiptPref: patient.receiptPref || "None" }}
        onCancel={() => setMode("search")}
        onSaved={(p, w) => { onChange(p); setWarn(w); setMode("search"); }}
      />
    );
  }

  const shown = (results || []).filter((p) => !nameQ || p.name.toLowerCase().includes(nameQ.toLowerCase()));

  return (
    <section className="lookup">
      <label className="dob-entry">
        <span>Date of birth</span>
        <input
          ref={dobRef}
          type="date"
          value={dob}
          max={isoToday()}
          autoFocus
          onChange={(e) => { setDob(e.target.value); setMode("search"); search(e.target.value); }}
        />
      </label>
      <ErrorBox error={err} />
      {busy && <p className="loading">Looking up patients…</p>}
      {results && mode === "search" && (
        <div className="lookup-results">
          {results.length > 3 && (
            <input className="name-filter" placeholder="Narrow by name" value={nameQ} onChange={(e) => setNameQ(e.target.value)} />
          )}
          {shown.map((p) => (
            <button type="button" key={p.id} className="result" onClick={() => onChange(p)}>
              <strong>{p.name}</strong>
              <span>{[p.phone, p.insName].filter(Boolean).join(" · ") || "No contact details"}</span>
            </button>
          ))}
          {results.length === 0 && <p className="muted">No patient on file with this date of birth.</p>}
          <button type="button" className="btn btn-quiet" onClick={() => setMode("new")}>
            New patient born {toKnack(dob)}
          </button>
        </div>
      )}
      {mode === "new" && (
        <PatientForm
          dobIso={dob}
          initial={blank}
          onCancel={() => setMode("search")}
          onSaved={(p, w) => { onChange(p); setWarn(w); setMode("search"); }}
        />
      )}
    </section>
  );
}
