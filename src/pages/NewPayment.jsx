import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OBJ, PAY, PAT, INV, FEE, PAYMENT_FOR } from "../config";
import { list, create, update, get, and } from "../lib/api";
import { mapPayment, mapInvoice, mapFee, mapPatient } from "../lib/models";
import { isoToday, dateWrite, moneyWrite, money, num, toKnack } from "../lib/format";
import { phoneLast4 } from "../lib/dob";
import { ptTime } from "../lib/time";
import { logAudit } from "../lib/audit";
import { requestOverride, requestManagerReview, withdrawRequest, fetchOverride, markOverrideUsed } from "../lib/overrides";
import { receiptDoc, superbillDoc } from "../lib/docs";
import { useSession, usePrint } from "../lib/context";
import PatientSearch, { PatientForm } from "../components/PatientSearch";
import { ChoiceGroup, Drawer, ErrorBox, Field, Notice, isAmbiguous } from "../components/ui";

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

// Knack values are unchanged: Card → Credit Card / Debit Card / HSA Or FSA; Other → Insurance.
const TOP_METHODS = [
  { value: "Card", label: "Card" },
  { value: "Cash", label: "Cash" },
  { value: "Check", label: "Check" },
  { value: "Other", label: "Other" },
];
const CARD_TYPES = [
  { value: "Credit Card", label: "Credit" },
  { value: "Debit Card", label: "Debit" },
  { value: "HSA Or FSA", label: "HSA / FSA" },
];

const emptyForm = () => ({
  dos: isoToday(), paymentFor: "Self-Pay Visit", feeId: "", amount: "", top: "Card", cardType: "Credit Card",
  last4: "", txnRef: "", insName: "", memberId: "", group: "", cpt: "", icd: "", notes: "", invoiceId: "", receipt: "None",
});

export default function NewPayment({ base }) {
  const { user, isSuperAdmin } = useSession();
  const { print } = usePrint();
  const loc = useLocation();
  const nav = useNavigate();
  const preload = loc.state || {};
  const [patient, setPatient] = useState(null);
  const [editingPatient, setEditingPatient] = useState(false);
  const [savedPatient, setSavedPatient] = useState(null);
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
  const [override, setOverride] = useState(null);
  const [ovReason, setOvReason] = useState("");
  const [ovErr, setOvErr] = useState(null);
  const [ovBusy, setOvBusy] = useState(false);
  // "Contact manager": hold this payment until the manager approves it.
  const [mgr, setMgr] = useState(null);
  const [mgrOpen, setMgrOpen] = useState(false);
  const [mgrMsg, setMgrMsg] = useState("");
  const [mgrErr, setMgrErr] = useState(null);
  const [mgrBusy, setMgrBusy] = useState(false);
  const mgrMsgRef = useRef(null);
  const inFlight = useRef(false);
  const amountRef = useRef(null);
  const methodRef = useRef(null);
  const last4Ref = useRef(null);
  const nextRef = useRef(null);

  const method = f.top === "Card" ? f.cardType : f.top === "Other" ? "Insurance" : f.top;
  const isCard = f.top === "Card";
  const needsIns = f.top === "Other" || ["Copay", "Deductible Or Coinsurance"].includes(f.paymentFor);

  // Price override: a fee-schedule service with a different amount needs super admin approval.
  const fee = fees.find((x) => x.id === f.feeId);
  const scheduled = fee && fee.price > 0 ? fee.price : null;
  const differs = scheduled !== null && num(f.amount) > 0 && Math.abs(num(f.amount) - scheduled) >= 0.005;
  const approved = Boolean(override && override.status === "Approved" && fee && override.service === fee.name
    && patient && override.patientId === patient.id && Math.abs(override.requested - num(f.amount)) < 0.005);
  const blocked = differs && !isSuperAdmin && !approved;
  const pending = blocked && override?.status === "Pending" && Math.abs(override.requested - num(f.amount)) < 0.005;
  const mgrLive = Boolean(mgr && mgr.status !== "Withdrawn");
  const mgrMatches = Boolean(mgrLive && patient && mgr.patientId === patient.id && Math.abs(mgr.requested - num(f.amount)) < 0.005);
  const mgrApproved = mgrMatches && mgr.status === "Approved";
  const mgrPending = mgrMatches && mgr.status === "Pending";
  const mgrHold = mgrLive && !mgrApproved;

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

  // Change patient keeps whatever amount and method are already entered.
  function changePatient() {
    setPatient(null);
    setOverride(null);
    setMgr(null);
    setMgrOpen(false);
    setOvReason("");
    setOvErr(null);
    setInvoices([]);
    setDupe(null);
    setF((cur) => ({ ...cur, insName: "", memberId: "", group: "", invoiceId: "" }));
    setSearchKey((k) => k + 1);
  }

  const startOver = useCallback(() => {
    if (inFlight.current) return;
    setSaved(null);
    setSavedPatient(null);
    setPatient(null);
    setEditingPatient(false);
    setF(emptyForm());
    setErrs({});
    setWarn(null);
    setErr(null);
    setDupe(null);
    setShowDetails(false);
    setOverride(null);
    setOvReason("");
    setOvErr(null);
    setMgr(null);
    setMgrOpen(false);
    setMgrMsg("");
    setMgrErr(null);
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
    if (f.top === "Other" && !f.insName.trim()) e.insName = "Enter the insurance name.";
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
    if (mgrHold) { if (mgrPending) checkMgr(); return; }
    if (blocked && !mgrApproved) { pending ? checkOverride() : sendOverride(); return; }
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
      [PAY.ts]: new Date().toISOString(),
    };
    if (f.invoiceId) body[PAY.invoice] = [{ id: f.invoiceId }];
    const usedOverride = differs && approved ? override : null;
    const usedMgr = mgrApproved ? mgr : null;
    const approvalNotes = [
      usedOverride && `Price override #${usedOverride.no} (${money(scheduled)} → ${money(f.amount)}) approved by ${usedOverride.respondedBy}.`,
      usedMgr && `Manager review #${usedMgr.no} approved by ${usedMgr.respondedBy}.`,
    ].filter(Boolean);
    if (approvalNotes.length) body[PAY.notes] = [f.notes.trim(), ...approvalNotes].filter(Boolean).join("\n");

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
    for (const r of [usedOverride, usedMgr].filter(Boolean)) {
      try { await markOverrideUsed(r.id, p.receiptNo); } catch (ex) { warnings.push(`Request #${r.no} wasn't marked as saved: ${ex.message}`); }
    }
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
    setSavedAt(ptTime(new Date().toISOString()));
    const done = { ...p, patientName: p.patientName || patient.name };
    setSaved(done);
    setSavedPatient(patient);
    release();
    if (f.receipt === "Print") printReceipt(done);
  }

  async function sendOverride() {
    if (ovBusy) return;
    if (!ovReason.trim()) { setOvErr("Enter the reason for the different price."); return; }
    setOvBusy(true);
    setOvErr(null);
    try {
      const { request, warning } = await requestOverride({ patient, fee, amount: num(f.amount), reason: ovReason.trim(), userName: user.name });
      setOverride(request);
      setWarn(warning);
    } catch (ex) {
      setOvErr(isAmbiguous(ex)
        ? "Connection lost. Check with the super admin before sending the request again."
        : `Request not sent. ${ex.message}`);
    } finally { setOvBusy(false); }
  }

  function openContact() {
    const v = validate();
    setErrs(v);
    if (Object.keys(v).length) return;
    setMgrOpen(true);
    setTimeout(() => mgrMsgRef.current?.focus(), 0);
  }

  async function sendMgr(e) {
    e?.preventDefault();
    if (mgrBusy) return;
    if (!mgrMsg.trim()) { setMgrErr("Tell the manager what needs approving."); return; }
    setMgrBusy(true);
    setMgrErr(null);
    try {
      const { request, warning } = await requestManagerReview({ patient, amount: num(f.amount), method, message: mgrMsg.trim(), userName: user.name });
      setMgr(request);
      setMgrOpen(false);
      setWarn(warning);
    } catch (ex) {
      setMgrErr(isAmbiguous(ex) ? "Connection lost. Check with the manager before sending again." : `Request not sent. ${ex.message}`);
    } finally { setMgrBusy(false); }
  }

  async function checkMgr() {
    if (mgrBusy || !mgr) return;
    setMgrBusy(true);
    setMgrErr(null);
    try { setMgr(await fetchOverride(mgr.id)); }
    catch (ex) { setMgrErr(`Couldn't check the request. ${ex.message}`); }
    finally { setMgrBusy(false); }
  }

  async function withdrawMgr() {
    if (mgrBusy || !mgr) return;
    setMgrBusy(true);
    try {
      const w = await withdrawRequest(mgr, user.name);
      setMgr(null);
      setMgrMsg("");
      if (w) setWarn(w);
    } catch (ex) { setMgrErr(`Couldn't withdraw the request. ${ex.message}`); }
    finally { setMgrBusy(false); }
  }

  async function checkOverride() {
    if (ovBusy || !override) return;
    setOvBusy(true);
    setOvErr(null);
    try { setOverride(await fetchOverride(override.id)); }
    catch (ex) { setOvErr(`Couldn't check the request. ${ex.message}`); }
    finally { setOvBusy(false); }
  }

  async function printReceipt(pay = saved) {
    print(receiptDoc(pay), { receipt: true });
    if (pay.receiptSent !== "Printed") {
      try {
        await update(OBJ.payments, pay.id, { [PAY.receiptSent]: "Printed" });
        setSaved((cur) => (cur && cur.id === pay.id ? { ...cur, receiptSent: "Printed" } : cur));
      } catch (ex) {
        setWarn(`Receipt printed, but the record wasn't marked as printed: ${ex.message}`);
      }
    }
  }

  const amountLabel = num(f.amount) > 0 ? money(f.amount) : "";
  const sp = savedPatient || patient;

  return (
    <div className="ws">
      <h1>New payment</h1>
      <ErrorBox error={!patient && !saved ? err : null} />

      {saved ? (
        /* ---------- Recorded: replaces the controls in place ---------- */
        <section className="recorded" aria-live="polite">
          <p className="recorded-title"><span className="tick" aria-hidden="true">✓</span>Payment recorded</p>
          <p className="recorded-amount">{money(saved.amount)}</p>
          <p className="recorded-name">{saved.patientName}</p>
          <p className="quiet">{saved.method}{saved.last4 && ` •••• ${saved.last4}`}</p>
          <p className="quiet">Today · {savedAt} · Receipt #{saved.receiptNo}</p>
          <Notice tone="warn" onClose={() => setWarn(null)}>{warn}</Notice>
          <div className="row row-links">
            <button type="button" className="link" onClick={() => printReceipt()}>{saved.receiptSent === "Printed" ? "Print receipt again" : "Print receipt"}</button>
            {(saved.cpt || saved.icd) && <button type="button" className="link" onClick={() => print(superbillDoc(saved, sp))}>Superbill</button>}
            <button type="button" className="link" onClick={() => nav(`${base}/payments`, { state: { receipt: String(saved.receiptNo) } })}>View payment</button>
          </div>
          <button type="button" className="btn btn-primary btn-record" ref={nextRef} onClick={startOver}>New payment</button>
          {sp?.receiptPref && sp.receiptPref !== "None" && (
            <p className="quiet small">Prefers receipts by {sp.receiptPref.toLowerCase()}. Sending turns on once messaging is connected.</p>
          )}
        </section>
      ) : (
        <>
          {/* ---------- Patient ---------- */}
          <p className="section-label">Patient</p>
          <div className="patient-slot">
          {!patient ? (
            <PatientSearch key={searchKey} onSelect={(p) => { setErr(null); setPatient(p); }} />
          ) : (
            <div className="who-line">
              <div>
                <p className="identity-name">{patient.name}</p>
                <p className="quiet">{patient.dob}{phoneLast4(patient.phone) && ` · phone ending ${phoneLast4(patient.phone)}`}</p>
              </div>
              <div className="who-actions">
                <button type="button" className="link link-quiet" onClick={() => setEditingPatient(true)}>Edit</button>
                <button type="button" className="link" onClick={changePatient}>Change</button>
              </div>
            </div>
          )}
          </div>
          <Notice tone="warn" onClose={() => setWarn(null)}>{warn}</Notice>
          <hr className="rule" />

          {/* ---------- Transaction: present but inactive until a patient is chosen ---------- */}
          <form className={`txn ${patient ? "" : "txn-idle"}`} onSubmit={save} noValidate aria-disabled={!patient}>
            <fieldset disabled={!patient}>
              <legend className="sr-only">Payment</legend>

              {fees.length > 0 && (
                <Field label="Service" optional>
                  {(p) => (
                    <select {...p} className="w-md" value={f.feeId} onChange={(e) => pickFee(e.target.value)}>
                      <option value="">None</option>
                      {fees.map((x) => <option key={x.id} value={x.id}>{x.name}{x.price ? ` — ${money(x.price)}` : ""}</option>)}
                    </select>
                  )}
                </Field>
              )}

              <Field label="Amount" error={errs.amount}>
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

              {differs && isSuperAdmin && <p className="hint override-note">Scheduled price {money(scheduled)}. Changed by you as super admin.</p>}
              {differs && !isSuperAdmin && (
                <div className="override" role="region" aria-label="Price approval">
                  {approved ? (
                    <p className="override-ok">Override #{override.no} approved by {override.respondedBy}.</p>
                  ) : pending ? (
                    <>
                      <p>Override #{override.no} is waiting for approval.{override.textStatus === "Sent" && " The super admin has been texted."}</p>
                      <button type="button" className="link" onClick={checkOverride} disabled={ovBusy}>{ovBusy ? "Checking…" : "Check approval"}</button>
                    </>
                  ) : (
                    <>
                      {override?.status === "Denied" && Math.abs(override.requested - num(f.amount)) < 0.005 && (
                        <p className="override-denied">Override #{override.no} was denied by {override.respondedBy}{override.responseNote ? `: ${override.responseNote}` : "."}</p>
                      )}
                      <p>Scheduled price for {fee.name} is {money(scheduled)}. A different amount needs super admin approval.</p>
                      <Field label="Reason" error={typeof ovErr === "string" ? ovErr : null}>
                        {(p) => <input {...p} autoComplete="off" value={ovReason} onChange={(e) => { setOvReason(e.target.value); setOvErr(null); }} />}
                      </Field>
                    </>
                  )}
                  <button type="button" className="link" onClick={() => setF({ ...f, amount: scheduled.toFixed(2) })}>Use {money(scheduled)} instead</button>
                </div>
              )}

              <div className="field">
                <span className="label">Payment method</span>
                <ChoiceGroup label="Payment method" options={TOP_METHODS} value={f.top} onChange={(v) => setF({ ...f, top: v })} onEnter={methodEnter} firstRef={methodRef} />
              </div>

              {isCard && (
                <div className="sub">
                  <ChoiceGroup label="Card type" small options={CARD_TYPES} value={f.cardType} onChange={(v) => setF({ ...f, cardType: v })} onEnter={methodEnter} />
                  <div className="pair">
                    <Field label="Last 4" error={errs.last4}>
                      {(p) => (
                        <input {...p} ref={last4Ref} className="w-sm" inputMode="numeric" maxLength={4} autoComplete="off" value={f.last4}
                          onChange={(e) => { setF({ ...f, last4: e.target.value.replace(/\D/g, "") }); if (errs.last4) setErrs({ ...errs, last4: null }); }} />
                      )}
                    </Field>
                    <Field label="Sphere transaction ID" optional>{(p) => <input {...p} autoComplete="off" value={f.txnRef} onChange={set("txnRef")} />}</Field>
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
                  {f.top === "Other" && <p className="quiet small">Recorded as insurance.</p>}
                  <div className="pair">
                    <Field label="Insurance" error={errs.insName} optional={f.top !== "Other"}>{(p) => <input {...p} autoComplete="off" value={f.insName} onChange={set("insName")} />}</Field>
                    <Field label="Member ID" optional>{(p) => <input {...p} autoComplete="off" value={f.memberId} onChange={set("memberId")} />}</Field>
                  </div>
                </div>
              )}

              <div className="pair">
                <Field label="Receipt">
                  {(p) => (
                    <select {...p} value={f.receipt} onChange={set("receipt")}>
                      <option>None</option>
                      <option>Print</option>
                    </select>
                  )}
                </Field>
                {invoices.length > 0 && (
                  <Field label="Invoice" optional>
                    {(p) => (
                      <select {...p} value={f.invoiceId} onChange={set("invoiceId")}>
                        <option value="">None</option>
                        {invoices.map((i) => <option key={i.id} value={i.id}>#{i.no} · {money(i.amountDue - i.amountPaid)} due</option>)}
                      </select>
                    )}
                  </Field>
                )}
              </div>

              <div className="details">
                {!showDetails && <span className="quiet">{f.paymentFor} · {f.dos === isoToday() ? "Today" : f.dos}</span>}
                <button type="button" className="link link-quiet" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>
                  {showDetails ? "Hide details" : "Details"}
                </button>
                {showDetails && (
                  <div className="details-body">
                    <div className="pair">
                      <Field label="Payment for">
                        {(p) => <select {...p} value={f.paymentFor} onChange={set("paymentFor")}>{PAYMENT_FOR.map((o) => <option key={o}>{o}</option>)}</select>}
                      </Field>
                      <Field label="Date of service" error={errs.dos}>
                        {(p) => <input {...p} type="date" value={f.dos} max={isoToday()} onChange={set("dos")} />}
                      </Field>
                      <Field label="CPT" optional>{(p) => <input {...p} autoComplete="off" value={f.cpt} onChange={set("cpt")} />}</Field>
                      <Field label="ICD-10" optional>{(p) => <input {...p} autoComplete="off" value={f.icd} onChange={set("icd")} />}</Field>
                    </div>
                    {needsIns && <Field label="Group number" optional>{(p) => <input {...p} className="w-md" autoComplete="off" value={f.group} onChange={set("group")} />}</Field>}
                    <Field label="Note" optional>{(p) => <textarea {...p} rows={2} value={f.notes} onChange={set("notes")} />}</Field>
                  </div>
                )}
              </div>

              {mgrLive && (
                <div className={`mgr mgr-${mgr.status.toLowerCase()}`} role="status" aria-live="polite">
                  {mgrApproved ? (
                    <p className="override-ok">Approved by {mgr.respondedBy}{mgr.responseNote ? `: ${mgr.responseNote}` : "."} Save when ready.</p>
                  ) : mgr.status === "Denied" ? (
                    <>
                      <p className="override-denied">Request #{mgr.no} was denied by {mgr.respondedBy}{mgr.responseNote ? `: ${mgr.responseNote}` : "."}</p>
                      <button type="button" className="link" onClick={startOver}>Start over</button>
                    </>
                  ) : !mgrMatches ? (
                    <>
                      <p>The amount changed after request #{mgr.no} was sent ({money(mgr.requested)}).</p>
                      <div className="row row-tight">
                        <button type="button" className="link" onClick={() => setF({ ...f, amount: mgr.requested.toFixed(2) })}>Use {money(mgr.requested)}</button>
                        <button type="button" className="link link-quiet" onClick={withdrawMgr} disabled={mgrBusy}>Withdraw request</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>Waiting for manager approval · request #{mgr.no}{mgr.textStatus === "Sent" ? " · texted" : ""}</p>
                      <button type="button" className="link link-quiet" onClick={withdrawMgr} disabled={mgrBusy}>Withdraw request</button>
                    </>
                  )}
                  {mgrErr && <p className="field-error">{mgrErr}</p>}
                </div>
              )}

              <ErrorBox error={patient ? err : null} />
              {dupe ? (
                <div className="msg msg-warn" role="alert">
                  <p>Receipt #{dupe.receiptNo} already records {money(dupe.amount)} from this patient for {dupe.dos}. Record this as a second, separate payment?</p>
                  <div className="row row-tight">
                    <button type="button" className="btn btn-primary" onClick={() => save(null, true)} disabled={busy}>{busy ? "Recording payment…" : "Yes, record it"}</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setDupe(null)} disabled={busy}>No</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-primary btn-record" disabled={!patient || busy || ovBusy || mgrBusy || (mgrHold && !mgrPending)}>
                  {busy ? "Recording payment…"
                    : mgrApproved ? `Save ${money(f.amount)}`
                    : mgrPending ? (mgrBusy ? "Checking…" : "Check approval")
                    : mgrHold ? "Waiting on manager"
                    : blocked ? (pending ? (ovBusy ? "Checking…" : "Check approval") : (ovBusy ? "Sending request…" : "Request price approval"))
                    : amountLabel ? `Record ${amountLabel}` : "Record payment"}
                </button>
              )}

              {patient && !mgrLive && !dupe && (
                mgrOpen ? (
                  <div className="contact">
                    <Field label="Message to manager" hint="Goes to the approval queue. The text only says a request is waiting." error={mgrErr}>
                      {(p) => <textarea {...p} ref={mgrMsgRef} rows={2} value={mgrMsg} onChange={(e) => { setMgrMsg(e.target.value); setMgrErr(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMgr(); } if (e.key === "Escape") setMgrOpen(false); }} />}
                    </Field>
                    <div className="row row-tight">
                      <button type="button" className="btn btn-secondary" onClick={sendMgr} disabled={mgrBusy}>{mgrBusy ? "Sending…" : "Send to manager"}</button>
                      <button type="button" className="link link-quiet" onClick={() => setMgrOpen(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="link link-quiet contact-link" onClick={openContact}>Contact manager</button>
                )
              )}
            </fieldset>
          </form>
          {patient && <p className="quiet small collected">Collected by {user.name}</p>}
        </>
      )}

      {editingPatient && patient && (
        <Drawer title="Patient details" onClose={() => setEditingPatient(false)}>
          <PatientForm
            bare
            patientId={patient.id}
            initial={{ ...patient, receiptPref: patient.receiptPref || "None" }}
            onCancel={() => setEditingPatient(false)}
            onSaved={(p, w) => { setPatient(p); setWarn(w); setEditingPatient(false); }}
          />
        </Drawer>
      )}
    </div>
  );
}
