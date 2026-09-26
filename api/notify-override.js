// POST /api/notify-override  { requestId }
// Authorization: Bearer <the signed-in staff member's Knack token>
//
// Reads the override request from Knack *as the caller* (so only signed-in staff who can
// see the request can trigger a text), then texts the super admin a link to review it.
// The text contains no patient information.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER   e.g. +15095550123
//   OVERRIDE_ALERT_TO   e.g. +15098501098
//   APP_URL             e.g. https://fpx-chi.vercel.app

const APP_ID = "6ab750236f2f55328950a5fd";
const OBJ = "object_13";
const F = { no: "field_172", service: "field_173", scheduled: "field_174", requested: "field_175", requestedBy: "field_177", status: "field_178", textStatus: "field_182" };

const money = (v) => Number(String(v ?? "").replace(/[^0-9.-]/g, "") || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const raw = (r, k) => r?.[`${k}_raw`] ?? r?.[k] ?? "";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization || "";
  if (!/^Bearer lao_[\w.-]+$/.test(auth)) return res.status(401).json({ error: "Not signed in" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const id = String(body.requestId || "");
  if (!/^[a-f0-9]{24}$/.test(id)) return res.status(400).json({ error: "Invalid request id" });

  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM_NUMBER: from, OVERRIDE_ALERT_TO: to, APP_URL: appUrl } = process.env;
  if (!sid || !token || !from || !to) return res.status(503).json({ error: "Text messaging isn't set up yet" });

  // Load the request with the caller's own token: proves they're signed in and allowed to see it.
  const k = await fetch(`https://api.knack.com/v1/objects/${OBJ}/records/${id}`, {
    headers: { "X-Knack-Application-Id": APP_ID, Authorization: auth },
  });
  if (k.status === 401 || k.status === 403) return res.status(k.status).json({ error: "Not allowed" });
  if (!k.ok) return res.status(502).json({ error: `Couldn't load the request (Knack ${k.status})` });
  const r = await k.json();

  if (raw(r, F.status) !== "Pending") return res.status(409).json({ error: "Request is no longer pending" });
  if (raw(r, F.textStatus) === "Sent") return res.status(200).json({ sent: false, reason: "already sent" });

  const link = `${(appUrl || "").replace(/\/$/, "")}/admin/overrides`;
  const text = `Franklin Park: price override #${raw(r, F.no)} needs your review. `
    + `${raw(r, F.service)}: ${money(raw(r, F.scheduled))} scheduled, ${money(raw(r, F.requested))} requested by ${raw(r, F.requestedBy) || "staff"}. `
    + `Review: ${link}`;

  const t = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: text }).toString(),
  });
  if (!t.ok) {
    const e = await t.json().catch(() => ({}));
    return res.status(502).json({ error: `Text not sent: ${e.message || `Twilio ${t.status}`}` });
  }
  return res.status(200).json({ sent: true });
}
