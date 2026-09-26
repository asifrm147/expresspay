import { PAT, PAY, REF, INV, CLS, FEE, AUD } from "../config";
import { rawDate, rawNum, rawText, rawName, rawEmail, rawPhone, connId, connLabel } from "./format";

export const mapPatient = (r) => ({
  id: r.id,
  dob: rawDate(r, PAT.dob),
  name: rawName(r, PAT.name),
  first: r[`${PAT.name}_raw`]?.first || "",
  last: r[`${PAT.name}_raw`]?.last || "",
  phone: rawPhone(r, PAT.phone),
  email: rawEmail(r, PAT.email),
  receiptPref: rawText(r, PAT.receiptPref),
  insName: rawText(r, PAT.insName),
  memberId: rawText(r, PAT.memberId),
  group: rawText(r, PAT.group),
  notes: rawText(r, PAT.notes),
});

export const mapPayment = (r) => ({
  id: r.id,
  receiptNo: rawText(r, PAY.receiptNo) || r[PAY.receiptNo] || "",
  dos: rawDate(r, PAY.dos),
  amount: rawNum(r, PAY.amount),
  paymentFor: rawText(r, PAY.paymentFor),
  method: rawText(r, PAY.method),
  last4: rawText(r, PAY.last4),
  txnRef: rawText(r, PAY.txnRef),
  insName: rawText(r, PAY.insName),
  memberId: rawText(r, PAY.memberId),
  group: rawText(r, PAY.group),
  cpt: rawText(r, PAY.cpt),
  icd: rawText(r, PAY.icd),
  collectedBy: rawText(r, PAY.collectedBy),
  status: rawText(r, PAY.status) || "Active",
  voidReason: rawText(r, PAY.voidReason),
  receiptSent: rawText(r, PAY.receiptSent),
  notes: rawText(r, PAY.notes),
  createdDate: rawDate(r, PAY.createdOn),
  patientId: connId(r, PAY.patient),
  patientName: connLabel(r, PAY.patient),
  invoiceId: connId(r, PAY.invoice),
  invoiceLabel: connLabel(r, PAY.invoice),
});

export const mapRefund = (r) => ({
  id: r.id,
  no: rawText(r, REF.no) || r[REF.no] || "",
  dos: rawDate(r, REF.dos),
  refundDate: rawDate(r, REF.refundDate),
  amount: rawNum(r, REF.amount),
  reason: rawText(r, REF.reason),
  method: rawText(r, REF.method),
  status: rawText(r, REF.status),
  processedBy: rawText(r, REF.processedBy),
  approvedBy: rawText(r, REF.approvedBy),
  notes: rawText(r, REF.notes),
  createdDate: rawDate(r, REF.createdOn),
  patientId: connId(r, REF.patient),
  patientName: connLabel(r, REF.patient),
  paymentId: connId(r, REF.payment),
});

export const mapInvoice = (r) => ({
  id: r.id,
  no: rawText(r, INV.no) || r[INV.no] || "",
  date: rawDate(r, INV.date),
  dos: rawDate(r, INV.dos),
  due: rawDate(r, INV.due),
  desc: rawText(r, INV.desc),
  amountDue: rawNum(r, INV.amountDue),
  amountPaid: rawNum(r, INV.amountPaid),
  status: rawText(r, INV.status),
  notes: rawText(r, INV.notes),
  patientId: connId(r, INV.patient),
  patientName: connLabel(r, INV.patient),
});

export const mapClose = (r) => ({
  id: r.id,
  date: rawDate(r, CLS.date),
  collector: rawText(r, CLS.collector),
  expected: rawNum(r, CLS.expected),
  counted: rawNum(r, CLS.counted),
  card: rawNum(r, CLS.card),
  variance: rawNum(r, CLS.variance),
  status: rawText(r, CLS.status),
  notes: rawText(r, CLS.notes),
});

export const mapFee = (r) => ({
  id: r.id,
  name: rawText(r, FEE.name),
  paymentFor: rawText(r, FEE.paymentFor),
  price: rawNum(r, FEE.price),
  cpt: rawText(r, FEE.cpt),
  availability: rawText(r, FEE.availability) || "Active",
});

export const mapAudit = (r) => ({
  id: r.id,
  time: typeof r[AUD.time] === "string" ? r[AUD.time] : "",
  action: rawText(r, AUD.action),
  recordType: rawText(r, AUD.recordType),
  ref: rawText(r, AUD.ref),
  user: rawText(r, AUD.user),
  details: rawText(r, AUD.details),
});
