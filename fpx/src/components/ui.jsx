import { useEffect } from "react";

export function ErrorBox({ error, onClose }) {
  if (!error) return null;
  const msg = typeof error === "string" ? error : error.message;
  const body = typeof error === "object" && error.body ? JSON.stringify(error.body, null, 2) : null;
  return (
    <div className="alert alert-error" role="alert">
      <div className="alert-row">
        <strong>{msg}</strong>
        {onClose && <button className="btn-link" onClick={onClose}>Dismiss</button>}
      </div>
      {error.status === 403 && (
        <p>Your account doesn't have permission for this. Ask a manager to check this role's table access in Knack.</p>
      )}
      {body && <pre className="alert-detail">{body}</pre>}
    </div>
  );
}

export function Notice({ children, tone = "ok", onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${tone}`} role="status">
      <div className="alert-row">
        <span>{children}</span>
        {onClose && <button className="btn-link" onClick={onClose}>Dismiss</button>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, wide }) {
  return (
    <label className={`field ${wide ? "field-wide" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented({ options, value, onChange, name }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          type="button"
          key={o}
          role="radio"
          aria-checked={value === o}
          className={value === o ? "on" : ""}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function Drawer({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="btn-link" onClick={onClose}>Close</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function StatusTag({ value }) {
  const tone = {
    Active: "ok", Paid: "ok", Processed: "ok", Approved: "ok", Balanced: "ok", Reviewed: "ok",
    Voided: "muted", Denied: "bad", "Variance Flagged": "warn", "Pending Approval": "warn",
    Open: "warn", "Partially Paid": "warn",
  }[value] || "muted";
  return <span className={`tag tag-${tone}`}>{value || "—"}</span>;
}

export function Loading({ label = "Loading…" }) {
  return <p className="loading">{label}</p>;
}

export function KV({ items }) {
  return (
    <dl className="kv">
      {items.filter(([, v]) => v !== "" && v != null).map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}
