import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OBJ, PAY, REF, CLS, CARD_METHODS } from "../config";
import { listAll, list, create, update, and } from "../lib/api";
import { mapPayment, mapRefund, mapClose } from "../lib/models";
import { isoToday, toKnack, dateWrite, moneyWrite, money, num } from "../lib/format";
import { logAudit } from "../lib/audit";
import { closeDoc } from "../lib/docs";
import { useSession, usePrint } from "../lib/context";
import { ConfirmationDialog, EmptyState, ErrorBox, Field, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";

const bucket = (m) => (m === "Cash" ? "Cash" : CARD_METHODS.includes(m) ? "Card" : m === "Check" ? "Check" : "Other");

function tally(payments, refunds) {
  const by = {};
  const row = (name) => (by[name] ||= { collector: name, cash: 0, card: 0, other: 0, cashRefunds: 0, count: 0 });
  payments.filter((p) => p.status !== "Voided").forEach((p) => {
    const r = row(p.collectedBy || "Unknown");
    r.count++;
    if (p.method === "Cash") r.cash += p.amount;
    else if (CARD_METHODS.includes(p.method)) r.card += p.amount;
    else r.other += p.amount;
  });
  refunds.filter((x) => x.method === "Cash").forEach((x) => { row(x.processedBy || "Unknown").cashRefunds += x.amount; });
  return Object.values(by).map((r) => ({ ...r, expected: r.cash - r.cashRefunds })).sort((a, b) => a.collector.localeCompare(b.collector));
}

function activity(payments, refunds) {
  const live = payments.filter((p) => p.status !== "Voided");
  const methods = { Card: 0, Cash: 0, Check: 0, Other: 0 };
  live.forEach((p) => { methods[bucket(p.method)] += p.amount; });
  const pay = live.reduce((s, p) => s + p.amount, 0);
  const ref = refunds.reduce((s, r) => s + r.amount, 0);
  return { pay, ref, net: pay - ref, methods, count: live.length };
}

export default function DailyClose({ seeAll = false, base }) {
  const { user } = useSession();
  const { print } = usePrint();
  const nav = useNavigate();
  const [date, setDate] = useState(isoToday());
  const [data, setData] = useState(null);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [errs, setErrs] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setData(null);
    setErr(null);
    try {
      const day = toKnack(date);
      const [p, r, c] = await Promise.all([
        listAll(OBJ.payments, { filters: and({ field: PAY.createdOn, operator: "is", value: day }) }),
        listAll(OBJ.refunds, { filters: and({ field: REF.status, operator: "is", value: "Processed" }, { field: REF.refundDate, operator: "is", value: day }) }),
        list(OBJ.closes, { filters: and({ field: CLS.date, operator: "is", value: day }), perPage: 50 }),
      ]);
      const payments = p.map(mapPayment);
      const refunds = r.map(mapRefund);
      const mineP = seeAll ? payments : payments.filter((x) => x.collectedBy === user.name);
      const mineR = seeAll ? refunds : refunds.filter((x) => x.processedBy === user.name);
      setData({ rows: tally(payments, refunds), closes: (c.records || []).map(mapClose), act: activity(mineP, mineR) });
    } catch (e) { setErr(e); setData({ rows: [], closes: [], act: activity([], []) }); }
  }, [date, seeAll, user.name]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.rows || [];
  const closes = data?.closes || [];
  const mine = rows.find((r) => r.collector === user.name) || { cash: 0, card: 0, cashRefunds: 0, expected: 0, count: 0 };
  const myClose = closes.find((c) => c.collector === user.name);
  const variance = num(counted) - mine.expected;
  const balanced = Math.abs(variance) < 0.005;

  function review(e) {
    e.preventDefault();
    const x = {};
    if (counted.trim() === "") x.counted = "Count the cash drawer and enter the total.";
    else if (!balanced && !notes.trim()) x.notes = "The count doesn't match. Explain the difference.";
    setErrs(x);
    if (!Object.keys(x).length) setConfirming(true);
  }

  async function saveClose() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const rec = await create(OBJ.closes, {
        [CLS.date]: dateWrite(date),
        [CLS.collector]: user.name,
        [CLS.expected]: moneyWrite(mine.expected),
        [CLS.counted]: moneyWrite(counted),
        [CLS.card]: moneyWrite(mine.card),
        [CLS.variance]: variance.toFixed(2),
        [CLS.status]: balanced ? "Balanced" : "Variance Flagged",
        [CLS.notes]: notes.trim(),
      });
      const c = mapClose(rec.record || rec);
      const w = await logAudit(user.name, "Created", "Daily Close", date, `Expected ${money(mine.expected)}, counted ${money(counted)}`);
      setData((d) => ({ ...d, closes: [...d.closes, c] }));
      setConfirming(false);
      setNote(`Drawer closed.${w ? ` ${w}` : ""}`);
      print(closeDoc({ ...c, date: toKnack(date) }));
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  }

  async function markReviewed(c) {
    try {
      await update(OBJ.closes, c.id, { [CLS.status]: "Reviewed", [CLS.notes]: [c.notes, `Reviewed by ${user.name}`].filter(Boolean).join("\n") });
      setNote(await logAudit(user.name, "Edited", "Daily Close", c.date, `Reviewed ${c.collector}'s close`));
      load();
    } catch (e) { setErr(e); }
  }

  const isToday = date === isoToday();

  return (
    <div className="work">
      <PageHeader title={seeAll ? "Daily close" : "Close my drawer"} />
      <div className="toolbar">
        <Field label="Day">{(p) => <input {...p} type="date" value={date} max={isoToday()} onChange={(e) => setDate(e.target.value)} />}</Field>
      </div>
      <ErrorBox error={err} onClose={() => setErr(null)} />
      <Notice onClose={() => setNote(null)}>{note}</Notice>
      {!data ? <Loading /> : (
        <>
          <section className="section">
            <h2>{isToday ? "Today's activity" : "Activity"}{!seeAll && <span className="quiet"> · yours</span>}</h2>
            <dl className="ledger-lines">
              <div><dt>Payments</dt><dd>{money(data.act.pay)}</dd></div>
              <div><dt>Refunds</dt><dd>−{money(data.act.ref)}</dd></div>
              <div className="total"><dt>Net</dt><dd>{money(data.act.net)}</dd></div>
            </dl>
            <dl className="ledger-lines ledger-small">
              {Object.entries(data.act.methods).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{money(v)}</dd></div>)}
            </dl>
            <button type="button" className="link" onClick={() => nav(`${base}/payments`)}>Review transactions</button>
          </section>

          <section className="section">
            <h2>Cash drawer</h2>
            <dl className="ledger-lines">
              <div><dt>Cash taken</dt><dd>{money(mine.cash)}</dd></div>
              <div><dt>Cash refunded</dt><dd>−{money(mine.cashRefunds)}</dd></div>
              <div className="total"><dt>Expected in drawer</dt><dd>{money(mine.expected)}</dd></div>
            </dl>
            {myClose ? (
              <div className="row-between">
                <p>Closed · counted {money(myClose.counted)} · variance {money(myClose.variance)} <StatusBadge value={myClose.status} /></p>
                <button type="button" className="link" onClick={() => print(closeDoc(myClose))}>Print</button>
              </div>
            ) : (
              <form onSubmit={review} noValidate>
                <Field label="Cash counted" error={errs.counted}>
                  {(p) => (
                    <div className="money money-sm">
                      <span aria-hidden="true">$</span>
                      <input {...p} inputMode="decimal" autoComplete="off" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^0-9.]/g, ""))} />
                    </div>
                  )}
                </Field>
                {counted.trim() !== "" && (
                  <p className={balanced ? "variance ok" : "variance off"} role="status">
                    {balanced ? "Drawer balances." : `${variance > 0 ? "Over" : "Short"} by ${money(Math.abs(variance))}.`}
                  </p>
                )}
                <Field label="Note" optional={balanced} error={errs.notes}>
                  {(p) => <textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
                </Field>
                <div className="row"><button className="btn btn-primary">Close day</button></div>
              </form>
            )}
          </section>

          {seeAll && (
            <section className="section">
              <h2>All staff</h2>
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">Drawer closes by staff member</caption>
                  <thead><tr><th scope="col">Staff</th><th scope="col" className="num">Payments</th><th scope="col" className="num">Cash expected</th><th scope="col" className="num">Card</th><th scope="col">Close</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const c = closes.find((x) => x.collector === r.collector);
                      return (
                        <tr key={r.collector}>
                          <td>{r.collector}</td>
                          <td className="num">{r.count}</td>
                          <td className="num">{money(r.expected)}</td>
                          <td className="num">{money(r.card)}</td>
                          <td>{c ? <>Counted {money(c.counted)} <StatusBadge value={c.status} /></> : <span className="muted">Not closed</span>}</td>
                          <td className="actions-cell">
                            {c && c.status !== "Reviewed" && <button type="button" className="btn btn-sm btn-secondary" onClick={() => markReviewed(c)}>Mark reviewed</button>}
                            {c && <button type="button" className="link" onClick={() => print(closeDoc(c))}>Print</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 && <EmptyState>No payments entered this day.</EmptyState>}
              </div>
            </section>
          )}
        </>
      )}
      {confirming && (
        <ConfirmationDialog
          title={`Close your drawer for ${toKnack(date)}?`}
          confirmLabel="Close day"
          busyLabel="Saving…"
          busy={busy}
          error={err}
          onConfirm={saveClose}
          onCancel={() => setConfirming(false)}
        >
          <p className="quiet">This records {money(counted)} counted against {money(mine.expected)} expected{balanced ? "." : `, ${variance > 0 ? "over" : "short"} by ${money(Math.abs(variance))}.`} It can't be edited afterward, and a manager reviews it.</p>
        </ConfirmationDialog>
      )}
    </div>
  );
}
