import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getTokens, startLogin, completeLogin, logout } from "./lib/auth";
import { SessionProvider, PrintProvider, useSession } from "./lib/context";
import FrontDeskView from "./views/FrontDeskView";
import ManagerView from "./views/ManagerView";
import { ErrorBox } from "./components/ui";

function Splash({ children }) {
  return (
    <div className="splash">
      <div className="splash-card">
        <div className="brand brand-dark">
          <span className="brand-name">FranklinPark</span>
          <span className="brand-sub">Express Care payments</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Login() {
  const reason = new URLSearchParams(useLocation().search).get("reason");
  const [err, setErr] = useState(null);
  if (getTokens()) return <Navigate to="/" replace />;
  return (
    <Splash>
      {reason && <p className="muted">{reason}</p>}
      <button className="btn btn-big" onClick={() => startLogin().catch(setErr)}>Sign in</button>
      <ErrorBox error={err} />
      <p className="muted small">For FranklinPark Express Care staff only.</p>
    </Splash>
  );
}

function Callback() {
  const nav = useNavigate();
  const loc = useLocation();
  const [err, setErr] = useState(null);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    completeLogin(loc.search).then(() => nav("/", { replace: true })).catch(setErr);
  }, [loc.search, nav]);
  return (
    <Splash>
      {err ? (
        <>
          <ErrorBox error={err} />
          <button className="btn" onClick={() => startLogin().catch(setErr)}>Try signing in again</button>
        </>
      ) : <p className="muted">Signing you in…</p>}
    </Splash>
  );
}

function RoleHome() {
  const { isManager, isFrontDesk } = useSession();
  if (isManager && isFrontDesk) {
    return (
      <Splash>
        <p>Open which workspace?</p>
        <div className="actions">
          <a className="btn" href="/manager">Manager</a>
          <a className="btn btn-quiet" href="/desk">Front desk</a>
        </div>
      </Splash>
    );
  }
  if (isManager) return <Navigate to="/manager" replace />;
  if (isFrontDesk) return <Navigate to="/desk" replace />;
  return (
    <Splash>
      <p>Your account is signed in but hasn't been given a front desk or manager role yet. Ask a manager to add you.</p>
      <button className="btn btn-quiet" onClick={() => logout()}>Sign out</button>
    </Splash>
  );
}

function RoleGate({ allow, children }) {
  const s = useSession();
  return s[allow] ? children : <Navigate to="/" replace />;
}

function Protected() {
  if (!getTokens()) return <Navigate to="/login" replace />;
  return (
    <SessionProvider
      fallback={<Splash><p className="muted">Loading…</p></Splash>}
      errorView={(e) => (
        <Splash>
          <ErrorBox error={e} />
          <button className="btn" onClick={() => logout()}>Sign in again</button>
        </Splash>
      )}
    >
      <PrintProvider>
        <Routes>
          <Route index element={<RoleHome />} />
          <Route path="desk/*" element={<RoleGate allow="isFrontDesk"><FrontDeskView /></RoleGate>} />
          <Route path="manager/*" element={<RoleGate allow="isManager"><ManagerView /></RoleGate>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PrintProvider>
    </SessionProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<Callback />} />
        <Route path="/*" element={<Protected />} />
      </Routes>
    </BrowserRouter>
  );
}
