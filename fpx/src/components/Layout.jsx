import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { logout } from "../lib/auth";
import { useSession, usePrint } from "../lib/context";
import { IDLE_MINUTES } from "../config";

export default function Layout({ nav, roleLabel, children }) {
  const { user } = useSession();
  const { narrow, setReceiptNarrow } = usePrint();

  useEffect(() => {
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => logout("You were signed out after 15 minutes without activity."), IDLE_MINUTES * 60000);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-name">FranklinPark</span>
          <span className="brand-sub">Express Care payments</span>
        </div>
        <nav className="nav">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who">
            <strong>{user.name}</strong>
            <span>{roleLabel}</span>
          </div>
          <label className="receipt-size">
            <input type="checkbox" checked={narrow} onChange={(e) => setReceiptNarrow(e.target.checked)} />
            Print receipts on narrow receipt paper
          </label>
          <button className="btn btn-quiet" onClick={() => logout()}>Sign out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
