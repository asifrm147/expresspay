import { CLINIC } from "../config";
import { esc, money } from "./format";

const header = (title, sub = "") => `
  <header class="doc-head">
    <div>
      <div class="doc-clinic">${esc(CLINIC.name)}</div>
      <div class="doc-small">${esc(CLINIC.address)}<br/>${esc(CLINIC.phone)}</div>
    </div>
    <div class="doc-title"><div>${esc(title)}</div><div class="doc-small">${esc(sub)}</div></div>
  </header>`;

const rows = (pairs) =>
  `<table class="doc-kv">${pairs
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join("")}</table>`;

const printedOn = () => `<p class="doc-foot">Printed ${esc(new Date().toLocaleString())}</p>`;

export function receiptDoc(p) {
  const card = p.last4 ? `${p.method} ending ${p.last4}` : p.method;
  return `${header("Payment receipt", `Receipt #${p.receiptNo}`)}
    ${rows([
      ["Patient", p.patientName],
      ["Date of service", p.dos],
      ["Payment for", p.paymentFor],
      ["Paid by", card],
      ["Reference", p.txnRef],
      ["Received by", p.collectedBy],
    ])}
    <div class="doc-total"><span>Amount paid</span><strong>${money(p.amount)}</strong></div>
    ${p.status === "Voided" ? `<p class="doc-void">VOIDED — ${esc(p.voidReason)}</p>` : ""}
    <p class="doc-small">Thank you. Keep this receipt for your records.</p>
    ${printedOn()}`;
}

export function superbillDoc(p, patient) {
  return `${header("Superbill", `Receipt #${p.receiptNo}`)}
    <p class="doc-small">Submit this form to your insurance company for possible reimbursement.</p>
    <h3>Provider</h3>
    ${rows([["Practice", CLINIC.name], ["Address", CLINIC.address], ["Phone", CLINIC.phone], ["Tax ID", CLINIC.taxId], ["NPI", CLINIC.npi]])}
    <h3>Patient</h3>
    ${rows([
      ["Name", patient?.name || p.patientName],
      ["Date of birth", patient?.dob],
      ["Insurance", p.insName || patient?.insName],
      ["Member ID", p.memberId || patient?.memberId],
      ["Group number", p.group || patient?.group],
    ])}
    <h3>Services</h3>
    ${rows([["Date of service", p.dos], ["Procedure codes (CPT)", p.cpt], ["Diagnosis codes (ICD-10)", p.icd]])}
    <div class="doc-total"><span>Amount paid by patient</span><strong>${money(p.amount)}</strong></div>
    <div class="doc-sign">Provider signature ______________________________ &nbsp; Date __________</div>
    ${printedOn()}`;
}

export function invoiceDoc(inv) {
  const balance = Math.max(0, inv.amountDue - inv.amountPaid);
  return `${header("Invoice", `Invoice #${inv.no}`)}
    ${rows([
      ["Patient", inv.patientName],
      ["Invoice date", inv.date],
      ["Date of service", inv.dos],
      ["Due date", inv.due],
      ["Description", inv.desc],
    ])}
    <table class="doc-lines">
      <tr><td>Amount due</td><td>${money(inv.amountDue)}</td></tr>
      <tr><td>Paid to date</td><td>${money(inv.amountPaid)}</td></tr>
    </table>
    <div class="doc-total"><span>Balance</span><strong>${money(balance)}</strong></div>
    <p class="doc-small">Questions about this invoice? Call ${esc(CLINIC.phone)}.</p>
    ${printedOn()}`;
}

export function refundDoc(r) {
  return `${header("Refund receipt", `Refund #${r.no}`)}
    ${rows([
      ["Patient", r.patientName],
      ["Date of service", r.dos],
      ["Refund date", r.refundDate],
      ["Refunded by", r.method],
      ["Reason", r.reason],
      ["Processed by", r.processedBy],
    ])}
    <div class="doc-total"><span>Amount refunded</span><strong>${money(r.amount)}</strong></div>
    ${printedOn()}`;
}

const table = (title, entries) =>
  `<h3>${esc(title)}</h3><table class="doc-lines">${entries
    .map(([k, count, total]) => `<tr><td>${esc(k)}</td><td>${count}</td><td>${money(total)}</td></tr>`)
    .join("") || "<tr><td>None</td></tr>"}</table>`;

export function reportDoc(s, label) {
  return `${header("Payments report", label)}
    <table class="doc-lines">
      <tr><td>Payments collected</td><td>${s.count}</td><td>${money(s.gross)}</td></tr>
      <tr><td>Refunds paid out</td><td>${s.refundCount}</td><td>-${money(s.refundTotal)}</td></tr>
      <tr><td><strong>Net</strong></td><td></td><td><strong>${money(s.net)}</strong></td></tr>
      <tr><td>Voided entries (not counted)</td><td>${s.voidCount}</td><td>${money(s.voidTotal)}</td></tr>
    </table>
    ${table("By form of payment", s.byMethod)}
    ${table("By collector", s.byCollector)}
    ${table("By payment type", s.byCategory)}
    ${printedOn()}`;
}

export function closeDoc(c) {
  return `${header("Drawer close", c.date)}
    ${rows([["Collector", c.collector]])}
    <table class="doc-lines">
      <tr><td>Expected cash</td><td>${money(c.expected)}</td></tr>
      <tr><td>Counted cash</td><td>${money(c.counted)}</td></tr>
      <tr><td>Variance</td><td>${money(c.variance)}</td></tr>
      <tr><td>Card total</td><td>${money(c.card)}</td></tr>
    </table>
    ${rows([["Status", c.status], ["Notes", c.notes]])}
    <div class="doc-sign">Staff ______________________ &nbsp; Manager ______________________</div>
    ${printedOn()}`;
}
