import { Route, Routes, Navigate } from "react-router-dom";
import Layout from "../components/Layout";
import NewPayment from "../pages/NewPayment";
import Payments from "../pages/Payments";
import Refunds from "../pages/Refunds";
import Invoices from "../pages/Invoices";
import DailyClose from "../pages/DailyClose";
import Reports from "../pages/Reports";
import { AuditLog } from "../pages/Admin";

const B = "/manager";
const GROUPS = [
  { items: [
    { to: B, label: "New payment", end: true },
    { to: `${B}/payments`, label: "Payments" },
    { to: `${B}/refunds`, label: "Refunds" },
    { to: `${B}/invoices`, label: "Invoices" },
  ] },
  { label: "Operations", items: [
    { to: `${B}/close`, label: "Daily close" },
    { to: `${B}/reports`, label: "Reports" },
  ] },
  { label: "Administration", items: [
    { to: `${B}/audit`, label: "Audit log" },
  ] },
];

export default function ManagerView() {
  return (
    <Layout groups={GROUPS} base={B} roleLabel="Manager">
      <Routes>
        <Route index element={<NewPayment base={B} />} />
        <Route path="payments" element={<Payments base={B} canVoidAny />} />
        <Route path="refunds" element={<Refunds canApprove />} />
        <Route path="invoices" element={<Invoices base={B} canVoid />} />
        <Route path="close" element={<DailyClose base={B} seeAll />} />
        <Route path="reports" element={<Reports />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="*" element={<Navigate to={B} replace />} />
      </Routes>
    </Layout>
  );
}
