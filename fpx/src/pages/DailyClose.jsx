import { useCallback, useEffect, useState } from "react";
import { OBJ, PAY, REF, CLS, CARD_METHODS } from "../config";
import { listAll, list, create, update, and } from "../lib/api";
import { mapPayment, mapRefund, mapClose } from "../lib/models";
import { isoToday, toKnack, dateWrite, moneyWrite, money, num } from "../lib/format";
import { logAudit } from "../lib/audit";
import { closeDoc } from "../lib/docs";
import { useSession, usePrint } from "../lib/context";
import { ErrorBox, Field, Loading, Notice, StatusTag } from "../components/ui";

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

export default function DailyClose({ seeAll = false }) {
  const { user } = useSession();
  const { print } = usePrint();
  const [date, setDate] = useState(isoToday());
  const [rows, setRows] = useState(null);
  const [closes, setCloses] = useState([]);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    setErr(null);
    try {
      const day = toKnack(date);
      const [p, r, c] = await Promise.all([
        listAll(OBJ.payments, { filters: and({ field: PAY.createdOn, operator: "is", value: day }) }),
        listAll(OBJ.refunds, { filters: and({ field: REF.status, operator: "is", value: "Processed" }, { field: REF.refundDate, operator: "is", value: day }) }),
        list(OBJ.closes, { filters: and({ field: CLS.date, operator: "is", value: day }), perPage: 50 }),
      ]);
      setRows(tally(p.map(mapPayment), r.map(mapRefund)));
      setCloses((c.records || []).map(mapClose));
    } catch (e) { setErr(e); setRows([]); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const mine = (rows || []).find((r) => r.collector === user.name) || { collector: user.name, cash: 0, card: 0, other: 0, cashRefunds: 0, expected: 0, count: 0 };
  const myClose = closes.find((c) => c.collector === user.name);
  const variance = num(counted) - mine.expected;

  async function saveClose(e) {
    e.preventDefault();
    if (counted.trim() === "") return setErr("Count the cash drawer and enter the total.");
    const balanced = Math.abs(variance) < 0.005;
    if (!balanced && !notes.trim()) return setErr("The count doesn't match. Add a note explaining the difference.");
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
      setCloses([...closes, c]);
      setNote(`Drawer closed.${w ? ` ${w}` : ""}`);
      print(closeDoc({ ...c, date: toKnack(date) }));
    } catch (ex) { setErr(ex); } finally { setBusy(false); }
  }

  async function review(c) {
    try {
      await update(OBJ.closes, c.id, { [CLS.status]: "Reviewed", [CLS.notes]: [c.notes, `Reviewed by ${user.name}`].filter(Boolean).join("\n") });
      const w = await logAudit(user.name, "Edited", "Daily Close", c.date, `Reviewed ${c.collector}'s close`);
      setNote(w);
      load();
    } catch (e) { setErr(e); }
  }

  return (
    <div className="page">
      <h1>{seeAll ? "Daily close" : "Close my drawer"}</h1>
      <div className="filters">
        <Field label="Day"><input type="date" value={date} max={isoToday()} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <ErrorBox error={err} />
      <Notice onClose={() => setNote(null)}>{note}</Notice>
      {!rows ? <Loading /> : (
        <>
          <section className="panel">
            <h2>{seeAll ? "Your drawer" : `${user.name}'s drawer`}</h2>
            <dl className="figures">
              <div><dt>Cash taken</dt><dd>{money(mine.cash)}</dd></div>
              <div><dt>Cash refunded</dt><dd>{money(mine.cashRefunds)}</dd></div>
              <div><dt>Cash expected</dt><dd className="strong">{money(mine.expected)}</dd></div>
              <div><dt>Cards</dt><dd>{money(mine.card)}</dd></div>
            </dl>
            {myClose ? (
              <div className="alert-row">
                <p>Closed: counted {money(myClose.counted)}, variance {money(myClose.variance)}. <StatusTag value={myClose.status} /></p>
                <button className="btn btn-quiet" onClick={() => print(closeDoc(myClose))}>Print</button>
              </div>
            ) : (
              <form onSubmit={saveClose}>
                <div className="grid">
                  <Field label="Cash counted in drawer"><input className="amount" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" /></Field>
                  {counted.trim() !== "" && (
                    <div className={`variance ${Math.abs(variance) < 0.005 ? "ok" : "off"}`}>
                      {Math.abs(variance) < 0.005 ? "Drawer balances" : `${variance > 0 ? "Over" : "Short"} by ${money(Math.abs(variance))}`}
                    </div>
                  )}
                </div>
                <Field label="Notes" wide><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
                <div className="actions"><button className="btn" disabled={busy}>{busy ? "Saving…" : "Close drawer and print"}</button></div>
              </form>
            )}
          </section>

          {seeAll && (
            <section>
              <h2>All collectors</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Collector</th><th className="num">Payments</th><th className="num">Cash expected</th><th className="num">Cards</th><th className="num">Other</th><th>Close</th><th></th></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const c = closes.find((x) => x.collector === r.collector);
                      return (
                        <tr key={r.collector}>
                          <td>{r.collector}</td><td className="num">{r.count}</td><td className="num">{money(r.expected)}</td>
                          <td className="num">{money(r.card)}</td><td className="num">{money(r.other)}</td>
                          <td>{c ? <>Counted {money(c.counted)} · <StatusTag value={c.status} /></> : <span className="muted">Not closed</span>}</td>
                          <td className="row-actions">
                            {c && c.status !== "Reviewed" && <button className="btn btn-small" onClick={() => review(c)}>Mark reviewed</button>}
                            {c && <button className="btn btn-small btn-quiet" onClick={() => print(closeDoc(c))}>Print</button>}
                          </td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && <tr><td colSpan={7} className="empty">No payments entered this day.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
