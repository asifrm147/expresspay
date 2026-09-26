import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { logout } from "../lib/auth";
import { useSession, usePrint } from "../lib/context";
import { IDLE_MINUTES } from "../config";

const isTyping = (el) => el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);

// groups: [{ label?, items: [{ to, label, end }] }]
export default function Layout({ groups, base, roleLabel, children }) {
  const { user } = useSession();
  const { narrow, setReceiptNarrow } = usePrint();
  const nav = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);

  // Sign out after inactivity.
  useEffect(() => {
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => logout(`Signed out after ${IDLE_MINUTES} minutes without activity.`), IDLE_MINUTES * 60000);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, []);

  // Alt/Option+N: new payment. "/": focus the page's search field.
  useEffect(() => {
    function onKey(e) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyN") {
        e.preventDefault();
        if (loc.pathname === base) window.dispatchEvent(new Event("fpx:new-payment"));
        else nav(base);
        return;
      }
      if (e.key === "/" && !e.altKey && !e.ctrlKey && !e.metaKey && !isTyping(document.activeElement)) {
        const target = document.querySelector("[data-search]");
        if (target) { e.preventDefault(); target.focus(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [base, loc.pathname, nav]);

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="rail">
        <div className="rail-top">
          <div className="brand">
            <img src="/brand/mark.svg" alt="" width="28" height="28" />
            <span>Franklin Park<br /><span className="brand-sub">Express Care</span></span>
          </div>
          <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="nav" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
        <nav id="nav" className={`nav ${menuOpen ? "open" : ""}`} aria-label="Main">
          {groups.map((g, gi) => (
            <div className="nav-group" key={gi} role="group" aria-label={g.label || "Payments"}>
              {g.label && <span className="nav-label">{g.label}</span>}
              {g.items.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
            </div>
          ))}
          <div className="rail-foot">
            <p className="who">{user.name}<span>{roleLabel}</span></p>
            <label className="pref">
              <input type="checkbox" checked={narrow} onChange={(e) => setReceiptNarrow(e.target.checked)} />
              Narrow receipt paper
            </label>
            <button type="button" className="link" onClick={() => logout()}>Sign out</button>
          </div>
        </nav>
      </aside>
      <main className="main" id="main" tabIndex={-1}>{children}</main>
    </div>
  );
}
