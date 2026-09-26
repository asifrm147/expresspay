import { useCallback, useEffect, useState } from "react";
import { OBJ, OVR } from "../config";
import { list, update, and } from "../lib/api";
import { mapOverride } from "../lib/models";
import { money } from "../lib/format";
import { logAudit } from "../lib/audit";
import { useSession } from "../lib/context";
import { ChoiceGroup, ConfirmationDialog, EmptyState, ErrorBox, Field, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";

const VIEWS = ["Pending", "Approved", "Denied", "Used", "All"].map((v) => ({ value: v, label: v }));

export default function Overrides() {
  const { user } = useSession();
  const [view, setView] = useState("Pending");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [acting, setActing] = useState(null); // { o, decision }
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState(null);

  const load = useCallback(async () => {
    setRows(null);
    setErr(null);
    try {
      const filters = view === "All" ? undefined : and({ field: OVR.status, operator: "is", value: view });
      const d = await list(OBJ.overrides, { filters, sort: OVR.no, order: "desc", perPage: 100 });
      setRows((d.records || []).map(mapOverride));
    } catch (e) { setErr(e); setRows([]); }
  }, [view]);

  useEffect(() => { load(); }, [load]);

  async function decide() {
    const { o, decision } = acting;
    if (decision === "Denied" && !reply.trim()) { setActErr("Tell the front desk why, so they can explain it to the patient."); return; }
    setBusy(true);
    setActErr(null);
    try {
      await update(OBJ.overrides, o.id, { [OVR.status]: decision, [OVR.respondedBy]: user.name, [OVR.responseNote]: reply.trim() });
      const w = await logAudit(user.name, "Edited", "Override Request", `Override #${o.no}`, `${decision}: ${o.service} ${money(o.scheduled)} → ${money(o.requested)}${reply.trim() ? `. ${reply.trim()}` : ""}`);
      setNote(`Override #${o.no} ${decision.toLowerCase()}. The front desk sees it when they check approval.${w ? ` ${w}` : ""}`);
      setActing(null);
      window.dispatchEvent(new Event("fpx:overrides-changed"));
      load();
    } catch (e) { setActErr(e); } finally { setBusy(false); }
  }

  return (
    <div className="work work-wide">
      <PageHeader title="Price overrides" />
      <div className="toolbar"><ChoiceGroup label="Status" small options={VIEWS} value={view} onChange={setView} /></div>
      <ErrorBox error={err} />
      <Notice onClose={() => setNote(null)}>{note}</Notice>
      {!rows ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Price override requests</caption>
            <thead><tr><th scope="col">Request</th><th scope="col">Service</th><th scope="col" className="num">Scheduled</th><th scope="col" className="num">Requested</th><th scope="col">Reason</th><th scope="col">From</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className="muted">#{o.no}</td>
                  <td>{o.service}<div className="muted small">{o.patientName}</div></td>
                  <td className="num muted">{money(o.scheduled)}</td>
                  <td className="num amount">{money(o.requested)}</td>
                  <td className="wrap">{o.reason}</td>
                  <td>{o.requestedBy}<div className="muted small">{o.created}</div></td>
                  <td>
                    <StatusBadge value={o.status === "Pending" ? "Pending Approval" : o.status === "Used" ? "Processed" : o.status} label={o.status} />
                    {o.respondedBy && <div className="muted small">by {o.respondedBy}{o.receiptNo && ` · receipt #${o.receiptNo}`}</div>}
                  </td>
                  <td className="actions-cell">
                    {o.status === "Pending" && (
                      <>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setReply(""); setActErr(null); setActing({ o, decision: "Approved" }); }}>Approve</button>
                        <button type="button" className="link" onClick={() => { setReply(""); setActErr(null); setActing({ o, decision: "Denied" }); }}>Deny</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState>{view === "Pending" ? "No requests waiting." : "Nothing here."}</EmptyState>}
        </div>
      )}
      {acting && (
        <ConfirmationDialog
          title={`${acting.decision === "Approved" ? "Approve" : "Deny"} ${money(acting.o.requested)} for ${acting.o.service}?`}
          confirmLabel={acting.decision === "Approved" ? "Approve" : "Deny request"}
          busyLabel="Saving…"
          busy={busy}
          danger={acting.decision === "Denied"}
          error={typeof actErr === "object" ? actErr : null}
          onConfirm={decide}
          onCancel={() => setActing(null)}
        >
          <p className="quiet">Scheduled {money(acting.o.scheduled)} · requested by {acting.o.requestedBy}</p>
          <p className="quiet">Reason: {acting.o.reason}</p>
          <Field label="Note to front desk" optional={acting.decision === "Approved"} error={typeof actErr === "string" ? actErr : null}>
            {(p) => <input {...p} autoComplete="off" value={reply} onChange={(e) => setReply(e.target.value)} />}
          </Field>
        </ConfirmationDialog>
      )}
    </div>
  );
}
