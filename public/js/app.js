/* ============================================================
   Pokhara Tourism — Shared app logic
   - API client, auth state, nav injection, toast, helpers
   ============================================================ */

const API = '';  // same origin

/* ---------- storage helpers ---------- */
const TOKEN_KEY = 'pt_token';
const USER_KEY = 'pt_user';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearAuth() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
function getStoredUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } }
function setStoredUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }

/* ---------- fetch wrapper ---------- */
async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (!(opts.body instanceof FormData) && opts.body) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  if (getToken()) headers['Authorization'] = 'Bearer ' + getToken();
  const res = await fetch(API + path, { ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    const err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    err.status = res.status; err.data = data; throw err;
  }
  return data;
}

/* ---------- toast ---------- */
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- stars render ---------- */
function starString(n) {
  n = Math.round(n);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
function timeAgo(iso) {
  const d = new Date((iso || '').replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const days = Math.floor(h / 24); if (days < 30) return days + 'd ago';
  return days.toLocaleDateString();
}

/* ---------- nav ---------- */
function navHtml(active) {
  const user = getStoredUser();
  const link = (href, label, key) =>
    `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  const right = user
    ? `<a href="/profile.html" class="nav-avatar" title="${escapeHtml(user.username)}">
         <span class="avatar-sm">${escapeHtml((user.username || '?')[0].toUpperCase())}</span>
       </a>
       <button class="btn btn-ghost" style="color:var(--ink);background:var(--surface);border:1px solid var(--line)" onclick="logout()">Log out</button>`
    : `<a href="/login.html" class="btn btn-outline">Log in</a>
       <a href="/register.html" class="btn btn-primary">Sign up</a>`;
  return `
  <nav class="nav">
    <div class="container nav-inner">
      <a href="/" class="brand"><span class="logo">🌊</span> Pokhara <span style="color:var(--teal-500)">Tú</span></a>
      <button class="hamburger" onclick="document.querySelector('.nav-links').classList.toggle('open')">☰</button>
      <div class="nav-links" id="navLinks">
        ${link('/', 'Home', 'home')}
        ${link('/destinations.html', 'Destinations', 'destinations')}
        ${link('/map.html', 'Map', 'map')}
        ${user ? link('/profile.html', 'Profile', 'profile') : ''}
      </div>
      <div class="nav-right">${right}</div>
    </div>
  </nav>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function logout() {
  clearAuth();
  toast('Logged out 👋');
  location.href = '/';
}

/* ---------- boot nav ---------- */
function mountNav(active) {
  const placeholder = document.getElementById('nav-placeholder');
  if (placeholder) placeholder.outerHTML = navHtml(active);
}

/* ---------- auth-gated helper ---------- */
function requireLogin() {
  if (!getToken()) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return false; }
  return true;
}

/* ---------- maps helper (OpenStreetMap + Leaflet) ---------- */
function loadLeaflet(cb) {
  if (window.L) return cb();
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
  const s = document.createElement('script');
  s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  s.onload = cb; s.onerror = () => toast('Map library failed to load');
  document.head.appendChild(s);
}

function makeIcon(active) {
  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:${active ? '#ff7a45' : '#0e7490'};transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.3);display:grid;place-items:center"><span style="transform:rotate(45deg);font-size:14px">📍</span></div>`,
    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
  });
}

/* expose */
window.PT = { api, getToken, setToken, clearAuth, getStoredUser, setStoredUser, toast, starString, timeAgo, mountNav, requireLogin, loadLeaflet, makeIcon, escapeHtml };
