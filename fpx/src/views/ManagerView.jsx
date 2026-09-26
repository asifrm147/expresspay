import { Route, Routes, Navigate } from "react-router-dom";
import Layout from "../components/Layout";
import NewPayment from "../pages/NewPayment";
import Payments from "../pages/Payments";
import Refunds from "../pages/Refunds";
import Invoices from "../pages/Invoices";
import DailyClose from "../pages/DailyClose";
import Reports from "../pages/Reports";
import { FeeSchedule, AuditLog } from "../pages/Admin";

const NAV = [
  { to: "/manager", label: "New payment", end: true },
  { to: "/manager/payments", label: "Payments" },
  { to: "/manager/refunds", label: "Refunds" },
  { to: "/manager/invoices", label: "Invoices" },
  { to: "/manager/close", label: "Daily close" },
  { to: "/manager/reports", label: "Reports" },
  { to: "/manager/fees", label: "Fee schedule" },
  { to: "/manager/audit", label: "Audit log" },
];

export default function ManagerView() {
  return (
    <Layout nav={NAV} roleLabel="Manager">
      <Routes>
        <Route index element={<NewPayment />} />
        <Route path="payments" element={<Payments canVoidAny />} />
        <Route path="refunds" element={<Refunds canApprove />} />
        <Route path="invoices" element={<Invoices base="/manager" canVoid />} />
        <Route path="close" element={<DailyClose seeAll />} />
        <Route path="reports" element={<Reports />} />
        <Route path="fees" element={<FeeSchedule />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="*" element={<Navigate to="/manager" replace />} />
      </Routes>
    </Layout>
  );
}
