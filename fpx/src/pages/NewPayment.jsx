import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { OBJ, PAY, PAT, INV, FEE, PAYMENT_FOR, METHODS, CARD_METHODS } from "../config";
import { list, create, update, and } from "../lib/api";
import { mapPayment, mapInvoice, mapFee } from "../lib/models";
import { isoToday, dateWrite, moneyWrite, money, num, toKnack } from "../lib/format";
import { logAudit } from "../lib/audit";
import { receiptDoc, superbillDoc } from "../lib/docs";
import { useSession, usePrint } from "../lib/context";
import PatientLookup from "../components/PatientLookup";
import { ErrorBox, Field, Notice, Segmented } from "../components/ui";

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

const emptyForm = () => ({
  dos: isoToday(), paymentFor: "Self-Pay Visit", feeId: "", amount: "", method: "Cash",
  last4: "", txnRef: "", insurance: false, insName: "", memberId: "", group: "", cpt: "", icd: "",
  notes: "", invoiceId: "",
});

export default function NewPayment() {
  const { user } = useSession();
  const { print } = usePrint();
  const loc = useLocation();
  const preload = loc.state || {};
  const [patient, setPatient] = useState(null);
  const [f, setF] = useState(emptyForm);
  const [fees, setFees] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [err, setErr] = useState(null);
  const [warn, setWarn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [dupe, setDupe] = useState(null);

  useEffect(() => { loadFees().then(setFees).catch(setErr); }, []);

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
    }).then((d) => setInvoices((d.records || []).map(mapInvoice))).catch(setErr);
  }, [patient]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isCard = CARD_METHODS.includes(f.method);
  const showIns = f.insurance || f.method === "Insurance" || ["Copay", "Deductible Or Coinsurance"].includes(f.paymentFor);

  function pickFee(id) {
    const fee = fees.find((x) => x.id === id);
    setF({ ...f, feeId: id, ...(fee ? { amount: fee.price ? fee.price.toFixed(2) : f.amount, paymentFor: fee.paymentFor || f.paymentFor, cpt: fee.cpt || f.cpt } : {}) });
  }

  function validate() {
    if (!patient) return "Look up or add the patient first.";
    if (!f.dos) return "Enter the date of service.";
    if (num(f.amount) <= 0) return "Enter an amount greater than zero.";
    if (isCard && !/^\d{4}$/.test(f.last4)) return "Enter the last 4 digits of the card.";
    if (showIns && f.method === "Insurance" && !f.insName.trim()) return "Enter the insurance name.";
    return null;
  }

  async function save(e, skipDupeCheck = false) {
    e?.preventDefault();
    const v = validate();
    if (v) return setErr(v);
    setErr(null);
    setBusy(true);
    try {
      if (!skipDupeCheck) {
        const d = await list(OBJ.payments, {
          filters: and(
            { field: PAY.patient, operator: "is", value: patient.id },
            { field: PAY.dos, operator: "is", value: toKnack(f.dos) },
            { field: PAY.status, operator: "is not", value: "Voided" },
          ),
          perPage: 20,
        });
        const same = (d.records || []).map(mapPayment).find((p) => Math.abs(p.amount - num(f.amount)) < 0.005);
        if (same) { setDupe(same); setBusy(false); return; }
      }
      setDupe(null);
      const body = {
        [PAY.patient]: [{ id: patient.id }],
        [PAY.dos]: dateWrite(f.dos),
        [PAY.amount]: moneyWrite(f.amount),
        [PAY.paymentFor]: f.paymentFor,
        [PAY.method]: f.method,
        [PAY.last4]: isCard ? f.last4 : "",
        [PAY.txnRef]: f.txnRef.trim(),
        [PAY.insName]: showIns ? f.insName.trim() : "",
        [PAY.memberId]: showIns ? f.memberId.trim() : "",
        [PAY.group]: showIns ? f.group.trim() : "",
        [PAY.cpt]: f.cpt.trim(),
        [PAY.icd]: f.icd.trim(),
        [PAY.collectedBy]: user.name,
        [PAY.status]: "Active",
        [PAY.receiptSent]: "Not Sent",
        [PAY.notes]: f.notes.trim(),
      };
      if (f.invoiceId) body[PAY.invoice] = [{ id: f.invoiceId }];
      const rec = await create(OBJ.payments, body);
      const p = mapPayment(rec.record || rec);
      const warnings = [];

      if (f.invoiceId) {
        const inv = invoices.find((i) => i.id === f.invoiceId);
        if (inv) {
          const paid = inv.amountPaid + num(f.amount);
          try {
            await update(OBJ.invoices, inv.id, {
              [INV.amountPaid]: moneyWrite(paid),
              [INV.status]: paid + 0.005 >= inv.amountDue ? "Paid" : "Partially Paid",
            });
          } catch (ex) {
            warnings.push(`Payment saved, but invoice #${inv.no} wasn't updated: ${ex.message}`);
          }
        }
      }

      if (showIns && f.insName.trim() && !patient.insName) {
        try {
          await update(OBJ.patients, patient.id, { [PAT.insName]: f.insName.trim(), [PAT.memberId]: f.memberId.trim(), [PAT.group]: f.group.trim() });
        } catch (ex) {
          warnings.push(`Insurance wasn't saved to the patient's file: ${ex.message}`);
        }
      }

      const a = await logAudit(user.name, "Created", "Payment", `Receipt #${p.receiptNo}`, `${money(p.amount)} ${p.method} for ${p.paymentFor}`);
      if (a) warnings.push(a);
      setWarn(warnings.join(" ") || null);
      setSaved({ ...p, patientName: p.patientName || patient.name });
    } catch (ex) {
      setErr(ex);
    } finally {
      setBusy(false);
    }
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

  function startOver() {
    setSaved(null);
    setPatient(null);
    setF(emptyForm());
    setWarn(null);
    setErr(null);
    window.history.replaceState({}, "");
  }

  if (saved) {
    return (
      <div className="page">
        <div className="done">
          <p className="done-label">Payment saved</p>
          <p className="done-amount">{money(saved.amount)}</p>
          <p className="done-meta">Receipt #{saved.receiptNo} · {saved.patientName} · {saved.method}{saved.last4 && ` ending ${saved.last4}`}</p>
          <Notice tone="warn" onClose={() => setWarn(null)}>{warn}</Notice>
          <div className="actions">
            <button className="btn" onClick={printReceipt}>Print receipt</button>
            {(saved.cpt || saved.icd) && (
              <button className="btn btn-quiet" onClick={() => print(superbillDoc(saved, patient))}>Print superbill</button>
            )}
            <button className="btn btn-quiet" onClick={startOver}>Next payment</button>
          </div>
          {patient?.receiptPref && patient.receiptPref !== "None" && (
            <p className="muted">This patient asked for receipts by {patient.receiptPref.toLowerCase()}. Text and email receipts turn on once messaging is connected; print one for now.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>New payment</h1>
      <PatientLookup patient={patient} onChange={setPatient} preloadId={preload.patientId} />

      {patient && (
        <form className="panel" onSubmit={save}>
          <div className="grid">
            <Field label="Date of service"><input type="date" value={f.dos} onChange={set("dos")} max={isoToday()} required /></Field>
            {fees.length > 0 && (
              <Field label="Service" hint="Fills in the standard self-pay price.">
                <select value={f.feeId} onChange={(e) => pickFee(e.target.value)}>
                  <option value="">Choose a service…</option>
                  {fees.map((x) => <option key={x.id} value={x.id}>{x.name}{x.price ? ` — ${money(x.price)}` : ""}</option>)}
                </select>
              </Field>
            )}
            <Field label="Payment for">
              <select value={f.paymentFor} onChange={set("paymentFor")}>
                {PAYMENT_FOR.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Amount">
              <input className="amount" inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="0.00" required />
            </Field>
          </div>

          <Field label="Form of payment" wide>
            <Segmented name="Form of payment" options={METHODS} value={f.method} onChange={(m) => setF({ ...f, method: m })} />
          </Field>

          <div className="grid">
            {isCard && (
              <>
                <Field label="Card last 4 digits"><input inputMode="numeric" maxLength={4} value={f.last4} onChange={set("last4")} /></Field>
                <Field label="Sphere transaction ID" hint="From the terminal slip."><input value={f.txnRef} onChange={set("txnRef")} /></Field>
              </>
            )}
            {f.method === "Check" && <Field label="Check number"><input value={f.txnRef} onChange={set("txnRef")} /></Field>}
            {invoices.length > 0 && (
              <Field label="Apply to invoice">
                <select value={f.invoiceId} onChange={set("invoiceId")}>
                  <option value="">No invoice</option>
                  {invoices.map((i) => <option key={i.id} value={i.id}>#{i.no} — balance {money(i.amountDue - i.amountPaid)}</option>)}
                </select>
              </Field>
            )}
          </div>

          <label className="check">
            <input type="checkbox" checked={showIns} disabled={showIns && !f.insurance} onChange={(e) => setF({ ...f, insurance: e.target.checked })} />
            Insurance visit
          </label>
          {showIns && (
            <div className="grid">
              <Field label="Insurance name"><input value={f.insName} onChange={set("insName")} /></Field>
              <Field label="Member ID"><input value={f.memberId} onChange={set("memberId")} /></Field>
              <Field label="Group number"><input value={f.group} onChange={set("group")} /></Field>
            </div>
          )}
          <div className="grid">
            <Field label="Billing codes (CPT)" hint="Separate with commas."><input value={f.cpt} onChange={set("cpt")} placeholder="99213" /></Field>
            <Field label="Diagnosis codes (ICD-10)" hint="For superbills."><input value={f.icd} onChange={set("icd")} /></Field>
          </div>
          <Field label="Notes" wide><textarea rows={2} value={f.notes} onChange={set("notes")} /></Field>

          <p className="muted">Collected by {user.name}</p>
          <ErrorBox error={err} />
          {dupe && (
            <div className="alert alert-warn">
              <p>
                Receipt #{dupe.receiptNo} already records {money(dupe.amount)} from this patient for {dupe.dos}. Is this a second, separate payment?
              </p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => save(null, true)}>Yes, save it</button>
                <button type="button" className="btn btn-quiet" onClick={() => setDupe(null)}>No, go back</button>
              </div>
            </div>
          )}
          {!dupe && (
            <div className="actions">
              <button className="btn btn-big" disabled={busy}>{busy ? "Saving…" : `Save payment${num(f.amount) > 0 ? ` of ${money(f.amount)}` : ""}`}</button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
