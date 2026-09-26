import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSession } from "./api";
import { PROFILES } from "../config";

const SessionCtx = createContext(null);
export const useSession = () => useContext(SessionCtx);

export function SessionProvider({ children, fallback, errorView }) {
  const [state, setState] = useState({ loading: true, error: null, user: null });

  useEffect(() => {
    let alive = true;
    getSession()
      .then((d) => {
        const u = d?.session?.user || d?.user || {};
        const name = u.name?.fullName || [u.name?.first, u.name?.last].filter(Boolean).join(" ") || u.email || "Staff";
        const profileKeys = u.profileKeys || u.profile_keys || [];
        if (alive) setState({ loading: false, error: null, user: { id: u.id, name, email: u.email, profileKeys } });
      })
      .catch((e) => alive && setState({ loading: false, error: e, user: null }));
    return () => { alive = false; };
  }, []);

  const value = useMemo(() => {
    const keys = state.user?.profileKeys || [];
    return { ...state, isManager: keys.includes(PROFILES.manager), isFrontDesk: keys.includes(PROFILES.frontDesk) };
  }, [state]);

  if (state.loading) return fallback;
  if (state.error) return errorView(state.error);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

const PrintCtx = createContext(null);
export const usePrint = () => useContext(PrintCtx);

export function PrintProvider({ children }) {
  useEffect(() => { new Image().src = "/brand/mark.svg"; }, []);
  const [narrow, setNarrow] = useState(() => {
    try { return localStorage.getItem("fpx.receiptSize") === "80mm"; } catch { return false; }
  });

  const setReceiptNarrow = useCallback((v) => {
    setNarrow(v);
    try { localStorage.setItem("fpx.receiptSize", v ? "80mm" : "letter"); } catch { /* preference only */ }
  }, []);

  const print = useCallback((html, { receipt = false } = {}) => {
    const root = document.getElementById("print-root");
    root.innerHTML = `<article class="doc ${receipt && narrow ? "doc-narrow" : ""}">${html}</article>`;
    const clear = () => { root.innerHTML = ""; window.removeEventListener("afterprint", clear); };
    window.addEventListener("afterprint", clear);
    requestAnimationFrame(() => window.print());
  }, [narrow]);

  const value = useMemo(() => ({ print, narrow, setReceiptNarrow }), [print, narrow, setReceiptNarrow]);
  return <PrintCtx.Provider value={value}>{children}</PrintCtx.Provider>;
}
