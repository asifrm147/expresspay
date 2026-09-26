// Knack app: FranklinPark Express Care Payments
export const APP_ID = "6ab750236f2f55328950a5fd";
export const CLIENT_ID = "6ab7512b05445ccd87911b8c";
export const API = "https://api.knack.com";

export const PROFILES = { frontDesk: "profile_3", manager: "profile_4" };

export const OBJ = {
  patients: "object_5",
  payments: "object_6",
  refunds: "object_7",
  invoices: "object_8",
  closes: "object_9",
  fees: "object_10",
  audit: "object_11",
};

export const PAT = {
  dob: "field_47", name: "field_48", phone: "field_49", email: "field_50",
  receiptPref: "field_51", consentDate: "field_52", insName: "field_53",
  memberId: "field_54", group: "field_55", recordType: "field_56", notes: "field_57",
};

export const PAY = {
  receiptNo: "field_64", dos: "field_65", amount: "field_66", paymentFor: "field_67",
  method: "field_68", last4: "field_69", txnRef: "field_70", insName: "field_71",
  memberId: "field_72", group: "field_73", cpt: "field_74", icd: "field_75",
  collectedBy: "field_76", status: "field_77", voidReason: "field_78",
  receiptSent: "field_79", notes: "field_80", createdOn: "field_82",
  patient: "field_155", invoice: "field_159",
};

export const REF = {
  no: "field_87", dos: "field_88", refundDate: "field_89", amount: "field_90",
  reason: "field_91", method: "field_92", status: "field_93", processedBy: "field_94",
  approvedBy: "field_95", notes: "field_96", createdOn: "field_98",
  patient: "field_156", payment: "field_157",
};

export const INV = {
  no: "field_103", date: "field_104", dos: "field_105", due: "field_106",
  desc: "field_107", amountDue: "field_108", amountPaid: "field_109",
  status: "field_110", notes: "field_111", patient: "field_158",
};

export const CLS = {
  date: "field_118", collector: "field_119", expected: "field_120", counted: "field_121",
  card: "field_122", variance: "field_123", status: "field_124", notes: "field_125",
};

export const FEE = { name: "field_132", paymentFor: "field_133", price: "field_134", cpt: "field_135", availability: "field_136" };

export const AUD = { time: "field_143", action: "field_144", recordType: "field_145", ref: "field_146", user: "field_147", details: "field_148" };

// Option lists: must match Knack exactly (case-sensitive).
export const PAYMENT_FOR = ["Self-Pay Visit", "Copay", "Deductible Or Coinsurance", "Procedure", "Labs", "Forms Or Letters", "Prior Balance", "Other"];
export const METHODS = ["Cash", "Credit Card", "Debit Card", "HSA Or FSA", "Check", "Insurance"];
export const CARD_METHODS = ["Credit Card", "Debit Card", "HSA Or FSA"];
export const REFUND_METHODS = ["Cash", "Card Reversal", "Check", "Other"];
export const RECEIPT_PREFS = ["None", "Text", "Email", "Text And Email"];

// Printed on receipts, invoices and superbills. Fill these in before go-live.
export const CLINIC = {
  name: "FranklinPark Express Care",
  address: "[Street address], Spokane, WA [ZIP]",
  phone: "[Clinic phone]",
  taxId: "[Tax ID]",
  npi: "[Group NPI]",
};

export const IDLE_MINUTES = 15;
