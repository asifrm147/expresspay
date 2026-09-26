import { useEffect, useState } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import Layout from "../components/Layout";
import NewPayment from "../pages/NewPayment";
import Payments from "../pages/Payments";
import Refunds from "../pages/Refunds";
import Invoices from "../pages/Invoices";
import DailyClose from "../pages/DailyClose";
import Reports from "../pages/Reports";
import Overrides from "../pages/Overrides";
import { FeeSchedule, AuditLog } from "../pages/Admin";
import { OBJ, OVR } from "../config";
import { list, and } from "../lib/api";

const B = "/admin";

function usePendingOverrides() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = () => list(OBJ.overrides, { filters: and({ field: OVR.status, operator: "is", value: "Pending" }), perPage: 1 })
      .then((d) => setN(d.total_records || 0)).catch(() => {});
    load();
    window.addEventListener("fpx:overrides-changed", load);
    return () => window.removeEventListener("fpx:overrides-changed", load);
  }, []);
  return n;
}

export default function SuperAdminView() {
  const pending = usePendingOverrides();
  const groups = [
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
      { to: `${B}/approvals`, label: "Approvals", badge: pending },
      { to: `${B}/fees`, label: "Fee schedule" },
      { to: `${B}/audit`, label: "Audit log" },
    ] },
  ];
  return (
    <Layout groups={groups} base={B} roleLabel="Super admin">
      <Routes>
        <Route index element={<NewPayment base={B} />} />
        <Route path="payments" element={<Payments base={B} canVoidAny />} />
        <Route path="refunds" element={<Refunds canApprove />} />
        <Route path="invoices" element={<Invoices base={B} canVoid />} />
        <Route path="close" element={<DailyClose base={B} seeAll />} />
        <Route path="reports" element={<Reports />} />
        <Route path="approvals" element={<Overrides />} />
        <Route path="overrides" element={<Navigate to={`${B}/approvals`} replace />} />
        <Route path="fees" element={<FeeSchedule />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="*" element={<Navigate to={B} replace />} />
      </Routes>
    </Layout>
  );
}
