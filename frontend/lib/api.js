// Shared API client (browser + server). Same-origin via Next rewrites in dev.
const BASE = ''; // '' => same origin (/api/... proxied to Express)

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pt_token');
}
export function setToken(t) {
  if (typeof window !== 'undefined') localStorage.setItem('pt_token', t);
}
export function clearAuth() {
  if (typeof window !== 'undefined') { localStorage.removeItem('pt_token'); localStorage.removeItem('pt_user'); }
}
export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('pt_user') || 'null'); } catch { return null; }
}
export function setStoredUser(u) {
  if (typeof window !== 'undefined') localStorage.setItem('pt_user', JSON.stringify(u));
}

export async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (!(opts.body instanceof FormData) && opts.body) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(BASE + path, { ...opts, headers, cache: 'no-store' });
  let data = null;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    const err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    err.status = res.status; err.data = data; throw err;
  }
  return data;
}

// Server helper (no localStorage available) — pass token explicitly.
export async function apiServer(path, token, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (opts.body && typeof opts.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000') + path, { ...opts, headers, cache: 'no-store' });
  let data = null; try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) { const err = new Error(data.error || 'fail'); err.status = res.status; throw err; }
  return data;
}
