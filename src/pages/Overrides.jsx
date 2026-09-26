import { useCallback, useEffect, useState } from "react";
import { OBJ, OVR } from "../config";
import { list, update, and } from "../lib/api";
import { mapOverride } from "../lib/models";
import { money } from "../lib/format";
import { logAudit } from "../lib/audit";
import { useSession } from "../lib/context";
import { ChoiceGroup, ConfirmationDialog, EmptyState, ErrorBox, Field, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";

const VIEWS = ["Pending", "Approved", "Denied", "Used", "Withdrawn", "All"].map((v) => ({ value: v, label: v }));

export default function Overrides() {
  const { user } = useSession();
  const [view, setView] = useState("Pending");
  const [mine, setMine] = useState(false);
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
      const rules = [];
      if (view !== "All") rules.push({ field: OVR.status, operator: "is", value: view });
      if (mine && user.email) rules.push({ field: OVR.assignedTo, operator: "is", value: user.email });
      const filters = rules.length ? and(...rules) : undefined;
      const d = await list(OBJ.overrides, { filters, sort: OVR.no, order: "desc", perPage: 100 });
      setRows((d.records || []).map(mapOverride));
    } catch (e) { setErr(e); setRows([]); }
  }, [view, mine, user.email]);

  useEffect(() => { load(); }, [load]);

  async function decide() {
    const { o, decision } = acting;
    if (decision === "Denied" && !reply.trim()) { setActErr("Tell the front desk why, so they can explain it to the patient."); return; }
    setBusy(true);
    setActErr(null);
    try {
      await update(OBJ.overrides, o.id, { [OVR.status]: decision, [OVR.respondedBy]: user.name, [OVR.responseNote]: reply.trim() });
      const what = o.type === "Manager Review" ? o.summary || money(o.requested) : `${o.service} ${money(o.scheduled)} → ${money(o.requested)}`;
      const w = await logAudit(user.name, "Edited", o.type, `Request #${o.no}`, `${decision}: ${what}${reply.trim() ? `. ${reply.trim()}` : ""}`);
      setNote(`Request #${o.no} ${decision.toLowerCase()}. The front desk sees it when they check approval.${w ? ` ${w}` : ""}`);
      setActing(null);
      window.dispatchEvent(new Event("fpx:overrides-changed"));
      load();
    } catch (e) { setActErr(e); } finally { setBusy(false); }
  }

  return (
    <div className="work work-wide">
      <PageHeader title="Approvals" />
      <div className="toolbar">
        <ChoiceGroup label="Status" small options={VIEWS} value={view} onChange={setView} />
        <label className="pref"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only requests addressed to me</label>
      </div>
      <ErrorBox error={err} />
      <Notice onClose={() => setNote(null)}>{note}</Notice>
      {!rows ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Approval requests</caption>
            <thead><tr><th scope="col">Request</th><th scope="col">For</th><th scope="col" className="num">Amount</th><th scope="col">Message</th><th scope="col">From</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>#{o.no}<div className="muted small">{o.type === "Manager Review" ? "Manager review" : "Price override"}</div></td>
                  <td>{o.patientName}<div className="muted small">{o.type === "Manager Review" ? o.summary : o.service}</div></td>
                  <td className="num">
                    <span className="amount">{money(o.requested)}</span>
                    {o.type !== "Manager Review" && <div className="muted small">scheduled {money(o.scheduled)}</div>}
                  </td>
                  <td className="wrap">{o.reason}</td>
                  <td>{o.requestedBy}<div className="muted small">{o.created}</div></td>
                  <td>
                    <StatusBadge value={o.status === "Pending" ? "Pending Approval" : o.status === "Used" ? "Processed" : o.status === "Withdrawn" ? "Voided" : o.status} label={o.status === "Used" ? "Saved" : o.status} />
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
          title={`${acting.decision === "Approved" ? "Approve" : "Deny"} ${acting.o.type === "Manager Review" ? acting.o.summary || money(acting.o.requested) : `${money(acting.o.requested)} for ${acting.o.service}`}?`}
          confirmLabel={acting.decision === "Approved" ? "Approve" : "Deny request"}
          busyLabel="Saving…"
          busy={busy}
          danger={acting.decision === "Denied"}
          error={typeof actErr === "object" ? actErr : null}
          onConfirm={decide}
          onCancel={() => setActing(null)}
        >
          <p className="quiet">{acting.o.patientName} · requested by {acting.o.requestedBy}{acting.o.type !== "Manager Review" && ` · scheduled ${money(acting.o.scheduled)}`}</p>
          <p>“{acting.o.reason}”</p>
          <Field label="Note to front desk" optional={acting.decision === "Approved"} error={typeof actErr === "string" ? actErr : null}>
            {(p) => <input {...p} autoComplete="off" value={reply} onChange={(e) => setReply(e.target.value)} />}
          </Field>
        </ConfirmationDialog>
      )}
    </div>
  );
}
