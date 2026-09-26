import { Route, Routes, Navigate } from "react-router-dom";
import Layout from "../components/Layout";
import NewPayment from "../pages/NewPayment";
import Payments from "../pages/Payments";
import Refunds from "../pages/Refunds";
import Invoices from "../pages/Invoices";
import DailyClose from "../pages/DailyClose";

const B = "/desk";
const GROUPS = [
  { items: [
    { to: B, label: "New payment", end: true },
    { to: `${B}/payments`, label: "Payments" },
    { to: `${B}/refunds`, label: "Refunds" },
    { to: `${B}/invoices`, label: "Invoices" },
  ] },
  { label: "Operations", items: [{ to: `${B}/close`, label: "Close my drawer" }] },
];

export default function FrontDeskView() {
  return (
    <Layout groups={GROUPS} base={B} roleLabel="Front desk">
      <Routes>
        <Route index element={<NewPayment base={B} />} />
        <Route path="payments" element={<Payments base={B} />} />
        <Route path="refunds" element={<Refunds />} />
        <Route path="invoices" element={<Invoices base={B} />} />
        <Route path="close" element={<DailyClose base={B} />} />
        <Route path="*" element={<Navigate to={B} replace />} />
      </Routes>
    </Layout>
  );
}
