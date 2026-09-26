import { useEffect, useId, useRef } from "react";
import { ApiError } from "../lib/api";

export function ErrorBox({ error, onClose }) {
  if (!error) return null;
  const msg = typeof error === "string" ? error : error.message;
  const body = typeof error === "object" && error.body ? JSON.stringify(error.body, null, 2) : null;
  return (
    <div className="msg msg-error" role="alert">
      <div className="msg-row">
        <span>{msg}</span>
        {onClose && <button type="button" className="link" onClick={onClose}>Dismiss</button>}
      </div>
      {error.status === 403 && <p>This account doesn't have permission for that. A manager can check the role's table access in Knack.</p>}
      {body && (
        <details className="msg-detail">
          <summary>Technical details</summary>
          <pre>{body}</pre>
        </details>
      )}
    </div>
  );
}

export function Notice({ children, tone = "ok", onClose }) {
  if (!children) return null;
  return (
    <div className={`msg msg-${tone}`} role="status" aria-live="polite">
      <div className="msg-row">
        <span>{children}</span>
        {onClose && <button type="button" className="link" onClick={onClose}>Dismiss</button>}
      </div>
    </div>
  );
}

// Label + control + hint/error with real associations. children may be a render function receiving input props.
export function Field({ label, hint, error, optional, children, className = "" }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const described = [hint && !error && hintId, error && errId].filter(Boolean).join(" ") || undefined;
  const child = typeof children === "function"
    ? children({ id, "aria-describedby": described, "aria-invalid": error ? true : undefined })
    : children;
  return (
    <div className={`field ${className}`}>
      <label className="label" htmlFor={id}>
        {label}{optional && <span className="optional"> · optional</span>}
      </label>
      {child}
      {hint && !error && <span className="hint" id={hintId}>{hint}</span>}
      {error && <span className="field-error" id={errId} role="alert">{error}</span>}
    </div>
  );
}

export function PageHeader({ title, action }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {action}
    </header>
  );
}

// Radio group with arrow-key movement. onEnter lets Enter advance the step.
export function ChoiceGroup({ label, options, value, onChange, onEnter, small, firstRef }) {
  const refs = useRef([]);
  function key(e, i) {
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % options.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + options.length) % options.length;
    if (next !== null) {
      e.preventDefault();
      onChange(options[next].value);
      refs.current[next]?.focus();
    } else if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    } else if (e.key === " ") {
      e.preventDefault();
      onChange(options[i].value);
    }
  }
  const selected = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className={`choices ${small ? "choices-small" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === selected ? 0 : -1}
            ref={(el) => {
              refs.current[i] = el;
              if (firstRef && i === selected) firstRef.current = el;
            }}
            className={on ? "on" : ""}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => key(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatusBadge({ value, label }) {
  const tone = {
    Paid: "ok", Active: "ok", Processed: "ok", Approved: "ok", Balanced: "ok", Reviewed: "ok",
    Voided: "muted", Inactive: "muted", Denied: "bad", Refunded: "muted", "Partial refund": "warn",
    "Refund pending": "warn", "Variance Flagged": "warn", "Pending Approval": "warn", Open: "warn", "Partially Paid": "warn",
  }[value] || "muted";
  return <span className={`badge badge-${tone}`}>{label || value || "—"}</span>;
}

export function EmptyState({ children }) {
  return <p className="empty">{children}</p>;
}

export function Loading({ label = "Loading…" }) {
  return <p className="loading" role="status" aria-live="polite">{label}</p>;
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

function useEscape(onClose) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
}

function useReturnFocus() {
  useEffect(() => {
    const prev = document.activeElement;
    return () => prev?.focus?.();
  }, []);
}

export function Drawer({ title, onClose, children }) {
  useEscape(onClose);
  useReturnFocus();
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="scrim" onMouseDown={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="link" onClick={onClose}>Close</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

// For money-moving or destructive actions. Cancel receives focus first.
export function ConfirmationDialog({ title, children, confirmLabel, busyLabel, busy, danger, onConfirm, onCancel, error }) {
  useEscape(() => !busy && onCancel());
  useReturnFocus();
  const cancelRef = useRef(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return (
    <div className="scrim scrim-center" onMouseDown={() => !busy && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="dlg-title">{title}</h2>
        {children}
        <ErrorBox error={error} />
        <div className="row-end">
          <button type="button" className="btn btn-secondary" ref={cancelRef} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel || "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Ambiguous = the request may have reached the server before failing (network drop, 5xx).
export function isAmbiguous(e) {
  return !(e instanceof ApiError) || e.status >= 500;
}
