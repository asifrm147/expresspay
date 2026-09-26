import { API, APP_ID } from "../config";
import { accessToken, refresh } from "./auth";

export class ApiError extends Error {
  constructor(status, body) {
    const detail = body?.errors
      ? body.errors.map((e) => e.message || JSON.stringify(e)).join("; ")
      : body?.message || body?.error_description || body?.error || JSON.stringify(body);
    super(`Knack API error ${status}: ${detail}`);
    this.status = status;
    this.body = body;
  }
}

async function request(path, opts = {}, retry = true) {
  const token = await accessToken();
  const res = await fetch(`${API}/v1${path}`, {
    ...opts,
    headers: {
      "X-Knack-Application-Id": APP_ID,
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (res.status === 401 && retry) {
    await refresh();
    return request(path, opts, false);
  }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const getSession = () => request(`/live-app/${APP_ID}/session`);

export function list(obj, { filters, sort, order = "desc", perPage = 100, page = 1 } = {}) {
  const q = new URLSearchParams({ rows_per_page: String(perPage), page: String(page) });
  if (filters) q.set("filters", JSON.stringify(filters));
  if (sort) { q.set("sort_field", sort); q.set("sort_order", order); }
  return request(`/objects/${obj}/records?${q}`);
}

// For reports: pulls every page of a server-filtered result (up to 10 pages of 1000).
export async function listAll(obj, opts = {}) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const d = await list(obj, { ...opts, perPage: 1000, page });
    out.push(...(d.records || []));
    if (page >= (d.total_pages || 1)) break;
  }
  return out;
}

export const get = (obj, id) => request(`/objects/${obj}/records/${id}`);
export const create = (obj, body) => request(`/objects/${obj}/records`, { method: "POST", body: JSON.stringify(body) });
export const update = (obj, id, body) => request(`/objects/${obj}/records/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const and = (...rules) => ({ match: "and", rules: rules.flat().filter(Boolean) });
