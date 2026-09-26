import { Route, Routes, Navigate } from "react-router-dom";
import Layout from "../components/Layout";
import NewPayment from "../pages/NewPayment";
import Payments from "../pages/Payments";
import Refunds from "../pages/Refunds";
import Invoices from "../pages/Invoices";
import DailyClose from "../pages/DailyClose";

const NAV = [
  { to: "/desk", label: "New payment", end: true },
  { to: "/desk/payments", label: "Payments" },
  { to: "/desk/refunds", label: "Refunds" },
  { to: "/desk/invoices", label: "Invoices" },
  { to: "/desk/close", label: "Close my drawer" },
];

export default function FrontDeskView() {
  return (
    <Layout nav={NAV} roleLabel="Front desk">
      <Routes>
        <Route index element={<NewPayment />} />
        <Route path="payments" element={<Payments />} />
        <Route path="refunds" element={<Refunds />} />
        <Route path="invoices" element={<Invoices base="/desk" />} />
        <Route path="close" element={<DailyClose />} />
        <Route path="*" element={<Navigate to="/desk" replace />} />
      </Routes>
    </Layout>
  );
}
