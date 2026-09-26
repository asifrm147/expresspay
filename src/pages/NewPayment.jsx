import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OBJ, PAY, PAT, INV, FEE, PAYMENT_FOR } from "../config";
import { list, create, update, get, and } from "../lib/api";
import { mapPayment, mapInvoice, mapFee, mapPatient } from "../lib/models";
import { isoToday, dateWrite, moneyWrite, money, num, toKnack } from "../lib/format";
import { longDate, maskedPhone } from "../lib/dob";
import { logAudit } from "../lib/audit";
import { receiptDoc, superbillDoc } from "../lib/docs";
import { useSession, usePrint } from "../lib/context";
import PatientSearch, { PatientForm } from "../components/PatientSearch";
import { ChoiceGroup, ErrorBox, Field, Notice, isAmbiguous } from "../components/ui";

let feeCache = null;
function loadFees() {
  if (!feeCache) {
    feeCache = list(OBJ.fees, {
      filters: and({ field: FEE.availability, operator: "is not", value: "Inactive" }),
      sort: FEE.name, order: "asc", perPage: 200,
    }).then((d) => (d.records || []).map(mapFee)).catch((e) => { feeCache = null; throw e; });
  }
  return feeCache;
}
export const clearFeeCache = () => { feeCache = null; };

// Knack values are unchanged: Card maps to Credit Card / Debit Card / HSA Or FSA.
const TOP_METHODS = [
  { value: "Card", label: "Card" },
  { value: "Cash", label: "Cash" },
  { value: "Check", label: "Check" },
  { value: "Insurance", label: "Insurance" },
];
const CARD_TYPES = [
  { value: "Credit Card", label: "Credit" },
  { value: "Debit Card", label: "Debit" },
  { value: "HSA Or FSA", label: "HSA / FSA" },
];

const emptyForm = () => ({
  dos: isoToday(), paymentFor: "Self-Pay Visit", feeId: "", amount: "", top: "Card", cardType: "Credit Card",
  last4: "", txnRef: "", insName: "", memberId: "", group: "", cpt: "", icd: "", notes: "", invoiceId: "",
});

function Steps({ step }) {
  const items = ["Find patient", "Payment", "Done"];
  return (
    <ol className="steps" aria-label="Progress">
      {items.map((s, i) => (
        <li key={s} className={i === step ? "now" : i < step ? "past" : ""} aria-current={i === step ? "step" : undefined}>
          <span className="step-n">{i + 1}</span>{s}
        </li>
      ))}
    </ol>
  );
}

export default function NewPayment({ base }) {
  const { user } = useSession();
  const { print } = usePrint();
  const loc = useLocation();
  const nav = useNavigate();
  const preload = loc.state || {};
  const [patient, setPatient] = useState(null);
  const [editingPatient, setEditingPatient] = useState(false);
  const [f, setF] = useState(emptyForm);
  const [errs, setErrs] = useState({});
  const [fees, setFees] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [showDetails, setShowDetails] = useState(false);
  const [err, setErr] = useState(null);
  const [warn, setWarn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [savedAt, setSavedAt] = useState("");
  const [dupe, setDupe] = useState(null);
  const [searchKey, setSearchKey] = useState(0);
  const inFlight = useRef(false);
  const amountRef = useRef(null);
  const methodRef = useRef(null);
  const last4Ref = useRef(null);
  const nextRef = useRef(null);

  const method = f.top === "Card" ? f.cardType : f.top;
  const isCard = f.top === "Card";
  const needsIns = f.top === "Insurance" || ["Copay", "Deductible Or Coinsurance"].includes(f.paymentFor);

  useEffect(() => { loadFees().then(setFees).catch(() => {}); }, []);

  // Arriving from an invoice: load that patient and go straight to payment.
  useEffect(() => {
    if (!preload.patientId) return;
    get(OBJ.patients, preload.patientId).then((r) => setPatient(mapPatient(r))).catch(setErr);
  }, [preload.patientId]);

  useEffect(() => {
    setInvoices([]);
    if (!patient) return;
    setF((cur) => ({
      ...cur,
      insName: cur.insName || patient.insName,
      memberId: cur.memberId || patient.memberId,
      group: cur.group || patient.group,
      invoiceId: preload.invoiceId || "",
    }));
    list(OBJ.invoices, {
      filters: and({ field: INV.patient, operator: "is", value: patient.id }, { field: INV.status, operator: "is not", value: "Paid" }, { field: INV.status, operator: "is not", value: "Voided" }),
      perPage: 20,
    }).then((d) => setInvoices((d.records || []).map(mapInvoice))).catch(() => {});
    setTimeout(() => amountRef.current?.focus(), 0);
  }, [patient]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (saved) nextRef.current?.focus(); }, [saved]);

  const startOver = useCallback(() => {
    if (inFlight.current) return;
    setSaved(null);
    setPatient(null);
    setEditingPatient(false);
    setF(emptyForm());
    setErrs({});
    setWarn(null);
    setErr(null);
    setDupe(null);
    setShowDetails(false);
    setSearchKey((k) => k + 1);
    window.history.replaceState({}, "");
  }, []);

  useEffect(() => {
    window.addEventListener("fpx:new-payment", startOver);
    return () => window.removeEventListener("fpx:new-payment", startOver);
  }, [startOver]);

  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); if (errs[k]) setErrs({ ...errs, [k]: null }); };

  function pickFee(id) {
    const fee = fees.find((x) => x.id === id);
    setF({ ...f, feeId: id, ...(fee ? { amount: fee.price ? fee.price.toFixed(2) : f.amount, paymentFor: fee.paymentFor || f.paymentFor, cpt: fee.cpt || f.cpt } : {}) });
  }

  function validate() {
    const e = {};
    if (!f.dos) e.dos = "Enter the date of service.";
    if (num(f.amount) <= 0) e.amount = "Enter an amount greater than zero.";
    if (isCard && !/^\d{4}$/.test(f.last4)) e.last4 = "Enter the last 4 digits of the card.";
    if (f.top === "Insurance" && !f.insName.trim()) e.insName = "Enter the insurance name.";
    if (e.dos) setShowDetails(true);
    return e;
  }

  function amountEnter(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (num(f.amount) <= 0) { setErrs({ ...errs, amount: "Enter an amount greater than zero." }); return; }
    setF((cur) => ({ ...cur, amount: num(cur.amount).toFixed(2) }));
    methodRef.current?.focus();
  }

  function methodEnter() {
    if (isCard && !/^\d{4}$/.test(f.last4)) { last4Ref.current?.focus(); return; }
    save();
  }

  const release = () => { inFlight.current = false; setBusy(false); };

  async function save(e, skipDupeCheck = false) {
    e?.preventDefault();
    if (inFlight.current) return; // blocks double submission
    const v = validate();
    setErrs(v);
    if (Object.keys(v).length) return;
    inFlight.current = true;
    setBusy(true);
    setErr(null);

    if (!skipDupeCheck) {
      try {
        const d = await list(OBJ.payments, {
          filters: and(
            { field: PAY.patient, operator: "is", value: patient.id },
            { field: PAY.dos, operator: "is", value: toKnack(f.dos) },
            { field: PAY.status, operator: "is not", value: "Voided" },
          ),
          perPage: 20,
        });
        const same = (d.records || []).map(mapPayment).find((p) => Math.abs(p.amount - num(f.amount)) < 0.005);
        if (same) { setDupe(same); release(); return; }
      } catch (ex) {
        setErr({ message: `Payment was not recorded. The duplicate check failed: ${ex.message}`, body: ex.body });
        release();
        return;
      }
    }
    setDupe(null);

    const body = {
      [PAY.patient]: [{ id: patient.id }],
      [PAY.dos]: dateWrite(f.dos),
      [PAY.amount]: moneyWrite(f.amount),
      [PAY.paymentFor]: f.paymentFor,
      [PAY.method]: method,
      [PAY.last4]: isCard ? f.last4 : "",
      [PAY.txnRef]: isCard || f.top === "Check" ? f.txnRef.trim() : "",
      [PAY.insName]: needsIns ? f.insName.trim() : "",
      [PAY.memberId]: needsIns ? f.memberId.trim() : "",
      [PAY.group]: needsIns ? f.group.trim() : "",
      [PAY.cpt]: f.cpt.trim(),
      [PAY.icd]: f.icd.trim(),
      [PAY.collectedBy]: user.name,
      [PAY.status]: "Active",
      [PAY.receiptSent]: "Not Sent",
      [PAY.notes]: f.notes.trim(),
    };
    if (f.invoiceId) body[PAY.invoice] = [{ id: f.invoiceId }];

    let p;
    try {
      const rec = await create(OBJ.payments, body);
      p = mapPayment(rec.record || rec);
    } catch (ex) {
      setErr(isAmbiguous(ex)
        ? { message: "Connection lost. This payment may or may not have been recorded. Check Payments for this patient before recording it again.", body: ex.body }
        : { message: `Payment was not recorded. ${ex.message}`, status: ex.status, body: ex.body });
      release();
      return;
    }

    const warnings = [];
    if (f.invoiceId) {
      const inv = invoices.find((i) => i.id === f.invoiceId);
      if (inv) {
        const paid = inv.amountPaid + num(f.amount);
        try {
          await update(OBJ.invoices, inv.id, { [INV.amountPaid]: moneyWrite(paid), [INV.status]: paid + 0.005 >= inv.amountDue ? "Paid" : "Partially Paid" });
        } catch (ex) {
          warnings.push(`Invoice #${inv.no} wasn't updated: ${ex.message}`);
        }
      }
    }
    if (needsIns && f.insName.trim() && !patient.insName) {
      try {
        await update(OBJ.patients, patient.id, { [PAT.insName]: f.insName.trim(), [PAT.memberId]: f.memberId.trim(), [PAT.group]: f.group.trim() });
      } catch (ex) {
        warnings.push(`Insurance wasn't saved to the patient's file: ${ex.message}`);
      }
    }
    const a = await logAudit(user.name, "Created", "Payment", `Receipt #${p.receiptNo}`, `${money(p.amount)} ${p.method} for ${p.paymentFor}`);
    if (a) warnings.push(a);
    setWarn(warnings.join(" ") || null);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    setSaved({ ...p, patientName: p.patientName || patient.name });
    release();
  }

  async function printReceipt() {
    print(receiptDoc(saved), { receipt: true });
    if (saved.receiptSent !== "Printed") {
      try {
        await update(OBJ.payments, saved.id, { [PAY.receiptSent]: "Printed" });
        setSaved({ ...saved, receiptSent: "Printed" });
      } catch (ex) {
        setWarn(`Receipt printed, but the record wasn't marked as printed: ${ex.message}`);
      }
    }
  }

  /* ---------- 3 · Done ---------- */
  if (saved) {
    return (
      <div className="work">
        <h1>New payment</h1>
        <Steps step={2} />
        <section className="done" aria-live="polite">
          <p className="done-check" aria-hidden="true">✓</p>
          <p className="done-title">Payment recorded</p>
          <p className="done-amount">{money(saved.amount)}</p>
          <p className="done-line">{saved.patientName}</p>
          <p className="done-meta">{saved.method}{saved.last4 && ` •••• ${saved.last4}`}</p>
          <p className="done-meta">Today · {savedAt} · Receipt #{saved.receiptNo}</p>
          <Notice tone="warn" onClose={() => setWarn(null)}>{warn}</Notice>
          <div className="row">
            <button type="button" className="btn btn-primary" ref={nextRef} onClick={startOver}>New payment</button>
          </div>
          <div className="row row-quiet">
            <button type="button" className="link" onClick={printReceipt}>Print receipt</button>
            {(saved.cpt || saved.icd) && <button type="button" className="link" onClick={() => print(superbillDoc(saved, patient))}>Print superbill</button>}
            <button type="button" className="link" onClick={() => nav(`${base}/payments`, { state: { receipt: String(saved.receiptNo) } })}>View payment</button>
          </div>
          {patient?.receiptPref && patient.receiptPref !== "None" && (
            <p className="quiet">Prefers receipts by {patient.receiptPref.toLowerCase()}. Sending turns on once messaging is connected.</p>
          )}
        </section>
      </div>
    );
  }

  /* ---------- 1 · Find patient ---------- */
  if (!patient) {
    return (
      <div className="work">
        <h1>New payment</h1>
        <Steps step={0} />
        <ErrorBox error={err} />
        <PatientSearch key={searchKey} onSelect={(p) => { setErr(null); setPatient(p); }} />
      </div>
    );
  }

  /* ---------- 2 · Payment ---------- */
  const amountLabel = num(f.amount) > 0 ? money(f.amount) : "";
  return (
    <div className="work">
      <h1>New payment</h1>
      <Steps step={1} />

      {editingPatient ? (
        <PatientForm
          patientId={patient.id}
          initial={{ ...patient, receiptPref: patient.receiptPref || "None" }}
          onCancel={() => setEditingPatient(false)}
          onSaved={(p, w) => { setPatient(p); setWarn(w); setEditingPatient(false); }}
        />
      ) : (
        <section className="strip" aria-label="Patient">
          <div>
            <p className="label">Patient</p>
            <p className="identity-name">{patient.name}</p>
            <p className="identity-meta">{longDate(patient.dob)}{maskedPhone(patient.phone) && <> · {maskedPhone(patient.phone)}</>}</p>
          </div>
          <div className="strip-actions">
            <button type="button" className="link" onClick={() => setEditingPatient(true)}>Edit</button>
            <button type="button" className="link" onClick={startOver}>Change</button>
          </div>
        </section>
      )}
      <Notice tone="warn" onClose={() => setWarn(null)}>{warn}</Notice>

      {!editingPatient && (
        <form className="step pay" onSubmit={save} noValidate>
          {fees.length > 0 && (
            <Field label="Service" optional hint="Fills in the standard self-pay price.">
              {(p) => (
                <select {...p} className="w-md" value={f.feeId} onChange={(e) => pickFee(e.target.value)}>
                  <option value="">None</option>
                  {fees.map((x) => <option key={x.id} value={x.id}>{x.name}{x.price ? ` — ${money(x.price)}` : ""}</option>)}
                </select>
              )}
            </Field>
          )}

          <Field label="Amount" error={errs.amount} className="field-amount">
            {(p) => (
              <div className="money">
                <span aria-hidden="true">$</span>
                <input
                  {...p}
                  ref={amountRef}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={f.amount}
                  onChange={(e) => { setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") }); if (errs.amount) setErrs({ ...errs, amount: null }); }}
                  onBlur={() => num(f.amount) > 0 && setF((cur) => ({ ...cur, amount: num(cur.amount).toFixed(2) }))}
                  onKeyDown={amountEnter}
                />
              </div>
            )}
          </Field>

          <div className="field">
            <span className="label">Payment method</span>
            <ChoiceGroup label="Payment method" options={TOP_METHODS} value={f.top} onChange={(v) => setF({ ...f, top: v })} onEnter={methodEnter} firstRef={methodRef} />
          </div>

          {isCard && (
            <div className="sub">
              <ChoiceGroup label="Card type" small options={CARD_TYPES} value={f.cardType} onChange={(v) => setF({ ...f, cardType: v })} onEnter={methodEnter} />
              <div className="cols-2">
                <Field label="Last 4 digits" error={errs.last4}>
                  {(p) => (
                    <input {...p} ref={last4Ref} className="w-sm" inputMode="numeric" maxLength={4} autoComplete="off" value={f.last4}
                      onChange={(e) => { setF({ ...f, last4: e.target.value.replace(/\D/g, "") }); if (errs.last4) setErrs({ ...errs, last4: null }); }} />
                  )}
                </Field>
                <Field label="Sphere transaction ID" optional>
                  {(p) => <input {...p} autoComplete="off" value={f.txnRef} onChange={set("txnRef")} />}
                </Field>
              </div>
            </div>
          )}
          {f.top === "Check" && (
            <div className="sub">
              <Field label="Check number" optional>{(p) => <input {...p} className="w-md" autoComplete="off" value={f.txnRef} onChange={set("txnRef")} />}</Field>
            </div>
          )}
          {needsIns && (
            <div className="sub">
              <div className="cols-2">
                <Field label="Insurance" error={errs.insName} optional={f.top !== "Insurance"}>{(p) => <input {...p} autoComplete="off" value={f.insName} onChange={set("insName")} />}</Field>
                <Field label="Member ID" optional>{(p) => <input {...p} autoComplete="off" value={f.memberId} onChange={set("memberId")} />}</Field>
                <Field label="Group number" optional>{(p) => <input {...p} autoComplete="off" value={f.group} onChange={set("group")} />}</Field>
              </div>
            </div>
          )}

          {invoices.length > 0 && (
            <Field label="Apply to invoice" optional>
              {(p) => (
                <select {...p} className="w-md" value={f.invoiceId} onChange={set("invoiceId")}>
                  <option value="">No invoice</option>
                  {invoices.map((i) => <option key={i.id} value={i.id}>#{i.no} · balance {money(i.amountDue - i.amountPaid)}</option>)}
                </select>
              )}
            </Field>
          )}

          <div className="details">
            {!showDetails && <span className="quiet">{f.paymentFor} · {f.dos === isoToday() ? "Today" : f.dos}</span>}
            <button type="button" className="link" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>
              {showDetails ? "Hide details" : "Edit details"}
            </button>
            {showDetails && (
              <div className="details-body">
                <div className="cols-2">
                  <Field label="Payment for">
                    {(p) => <select {...p} value={f.paymentFor} onChange={set("paymentFor")}>{PAYMENT_FOR.map((o) => <option key={o}>{o}</option>)}</select>}
                  </Field>
                  <Field label="Date of service" error={errs.dos}>
                    {(p) => <input {...p} type="date" value={f.dos} max={isoToday()} onChange={set("dos")} />}
                  </Field>
                  <Field label="CPT codes" optional hint="Separate with commas.">{(p) => <input {...p} autoComplete="off" value={f.cpt} onChange={set("cpt")} />}</Field>
                  <Field label="ICD-10 codes" optional hint="For superbills.">{(p) => <input {...p} autoComplete="off" value={f.icd} onChange={set("icd")} />}</Field>
                </div>
                <Field label="Note" optional>{(p) => <textarea {...p} rows={2} value={f.notes} onChange={set("notes")} />}</Field>
              </div>
            )}
          </div>

          <ErrorBox error={err} />
          {dupe ? (
            <div className="msg msg-warn" role="alert">
              <p>Receipt #{dupe.receiptNo} already records {money(dupe.amount)} from this patient for {dupe.dos}. Record this as a second, separate payment?</p>
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={() => save(null, true)} disabled={busy}>{busy ? "Recording payment…" : "Yes, record it"}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setDupe(null)} disabled={busy}>No</button>
              </div>
            </div>
          ) : (
            <div className="row">
              <button className="btn btn-primary btn-wide" disabled={busy}>
                {busy ? "Recording payment…" : amountLabel ? `Record ${amountLabel} payment` : "Record payment"}
              </button>
            </div>
          )}
          <p className="quiet">Collected by {user.name}</p>
        </form>
      )}
    </div>
  );
}
