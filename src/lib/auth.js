import { API, CLIENT_ID } from "../config";

const TK = "fpx.tokens";
const PK = "fpx.pkce";

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const sha256 = (s) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
const form = (o) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o).toString(),
});

export const redirectUri = () => `${window.location.origin}/auth/callback`;

export function getTokens() {
  try { return JSON.parse(sessionStorage.getItem(TK)); } catch { return null; }
}

function saveTokens(d) {
  sessionStorage.setItem(TK, JSON.stringify({
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: Date.now() + (d.expires_in || 3600) * 1000,
  }));
}

async function tokenCall(body) {
  const res = await fetch(`${API}/v1/oauth/token`, form(body));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`Sign-in failed (${res.status} ${data.error || ""}): ${data.error_description || "no details"}`);
    e.status = res.status;
    e.body = data;
    throw e;
  }
  return data;
}

export async function startLogin() {
  const verifier = b64url(rand(48));
  const challenge = b64url(await sha256(verifier));
  const state = b64url(rand(16));
  sessionStorage.setItem(PK, JSON.stringify({ verifier, state }));
  const u = new URL(`${API}/v1/oauth/authorize`);
  u.searchParams.set("client_id", CLIENT_ID);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", state);
  window.location.assign(u.toString());
}

export async function completeLogin(search) {
  const p = new URLSearchParams(search);
  if (p.get("error")) throw new Error(`Sign-in failed (${p.get("error")}): ${p.get("error_description") || "no details"}`);
  const raw = sessionStorage.getItem(PK);
  sessionStorage.removeItem(PK);
  if (!raw) throw new Error("Sign-in session expired. Start sign-in again.");
  const pkce = JSON.parse(raw);
  if (p.get("state") !== pkce.state) throw new Error("Sign-in check failed (state mismatch). Start sign-in again.");
  const data = await tokenCall({
    grant_type: "authorization_code",
    code: p.get("code") || "",
    redirect_uri: redirectUri(),
    client_id: CLIENT_ID,
    code_verifier: pkce.verifier,
  });
  saveTokens(data);
}

let refreshing = null;
export function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const t = getTokens();
    if (!t) throw new Error("Not signed in.");
    try {
      saveTokens(await tokenCall({ grant_type: "refresh_token", refresh_token: t.refreshToken, client_id: CLIENT_ID }));
    } catch (e) {
      sessionStorage.removeItem(TK);
      throw e;
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export async function accessToken() {
  let t = getTokens();
  if (!t) throw new Error("Not signed in.");
  if (t.expiresAt - Date.now() < 60000) {
    await refresh();
    t = getTokens();
  }
  return t.accessToken;
}

export function logout(reason) {
  const t = getTokens();
  sessionStorage.clear();
  if (t) {
    fetch(`${API}/v1/oauth/revoke`, form({ token: t.refreshToken || t.accessToken, client_id: CLIENT_ID })).catch(() => {});
  }
  window.location.assign(reason ? `/login?reason=${encodeURIComponent(reason)}` : "/login");
}
